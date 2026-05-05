import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";

/**
 * PATCH /api/users/[id]/toggle-active
 * Toggle user active status.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const forbidden = requireRole(request, ["company_admin"]);
    if (forbidden) return forbidden;

    const id = params.id;
    const user = await prisma.user.findUnique({ where: { id } });

    if (!user) return response.error("User not found", 404);

    const updated = await prisma.user.update({
      where: { id },
      data: { isActive: !user.isActive }
    });

    return response.success(
      { isActive: updated.isActive },
      `User ${updated.isActive ? "activated" : "deactivated"} successfully`
    );
  } catch (error) {
    console.error("[PATCH /api/users/[id]/toggle-active] Error:", error);
    return response.error("Internal server error", 500);
  }
}
