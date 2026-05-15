import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { z } from "zod";

const assignAmSchema = z.object({
  amId: z.string().min(1, "AM ID is required").nullable(),
});

/**
 * PATCH /api/stores/[id]/assign-am
 * Assign an Area Manager (AM) to the store.
 * Accessible by: company_admin only
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const forbidden = requireRole(request, ["company_admin"]);
    if (forbidden) return forbidden;

    const id = params.id;
    const body = await request.json();
    const parsed = assignAmSchema.safeParse(body);

    if (!parsed.success) {
      return response.error(parsed.error.errors[0].message, 400);
    }

    const { amId } = parsed.data;

    // 1. Verify store exists
    const storeExists = await prisma.store.findUnique({ where: { id } });
    if (!storeExists) return response.error("Store not found", 404);

    // 2. If assigning an AM, verify user exists and has AM role
    if (amId) {
      const amUser = await prisma.user.findUnique({
        where: { id: amId },
        include: { roleAssignments: true }
      });
      if (!amUser) return response.error("AM user not found", 404);
      
      const hasAmRole = amUser.roleAssignments.some(r => r.roleKey === "am");
      if (!hasAmRole) return response.error("Selected user does not have the AM role", 400);
    }

    const updated = await prisma.store.update({
      where: { id },
      data: { amId },
      select: {
        id: true,
        code: true,
        name: true,
        amId: true,
        am: { select: { id: true, fullName: true, email: true } }
      }
    });

    return response.success(updated, "AM assigned successfully");
  } catch (error) {
    console.error("[PATCH /api/stores/[id]/assign-am] Error:", error);
    return response.error("Internal server error", 500);
  }
}
