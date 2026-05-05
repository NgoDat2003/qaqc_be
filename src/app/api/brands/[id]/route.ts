import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { z } from "zod";

const updateBrandSchema = z.object({
  name: z.string().min(2, "Brand name must be at least 2 characters").max(100).optional(),
  isActive: z.boolean().optional(),
});

/**
 * PATCH /api/brands/[id]
 * Update brand details.
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
    const parsed = updateBrandSchema.safeParse(body);

    if (!parsed.success) {
      return response.error(parsed.error.errors[0].message, 400);
    }

    const brand = await prisma.brand.findUnique({ where: { id } });
    if (!brand) {
      return response.error("Brand not found", 404);
    }

    // If name is changing, check for duplicates
    if (parsed.data.name && parsed.data.name !== brand.name) {
      const existing = await prisma.brand.findUnique({
        where: { name: parsed.data.name }
      });
      if (existing) return response.error("Brand name already exists", 400);
    }

    const updated = await prisma.brand.update({
      where: { id },
      data: parsed.data,
    });

    return response.success(updated, "Brand updated successfully");
  } catch (error) {
    console.error("[PATCH /api/brands/[id]] Error:", error);
    return response.error("Internal server error", 500);
  }
}
