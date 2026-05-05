import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { z } from "zod";

const updateStoreSchema = z.object({
  code: z.string().min(2).toUpperCase().optional(),
  name: z.string().min(2).optional(),
  modelType: z.enum(["standard", "cloud_kitchen"]).optional(),
  brandId: z.string().optional(),
  region: z.string().optional().nullable(),
  province: z.string().optional().nullable(),
  district: z.string().optional().nullable(),
  ward: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  managerId: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

/**
 * PATCH /api/stores/[id]
 * Update store details.
 * Rule: Apply Brand Isolation if modelType or brandId changes.
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
    const parsed = updateStoreSchema.safeParse(body);

    if (!parsed.success) {
      return response.error(parsed.error.errors[0].message, 400);
    }

    const currentStore = await prisma.store.findUnique({ where: { id } });
    if (!currentStore) return response.error("Store not found", 404);

    const updateData: any = { ...parsed.data };

    // 1. Check duplicate code
    if (updateData.code && updateData.code !== currentStore.code) {
      const existing = await prisma.store.findUnique({ where: { code: updateData.code } });
      if (existing) return response.error("Store code already exists", 400);
    }

    // 2. Brand Isolation Logic
    const finalModelType = updateData.modelType || currentStore.modelType;
    const finalBrandId = updateData.brandId || currentStore.brandId;

    if (updateData.modelType || updateData.brandId) {
      const brand = await prisma.brand.findUnique({ where: { id: finalBrandId } });
      if (!brand) return response.error("Brand not found", 404);

      const isCloudBrand = brand.code.toUpperCase() === "CLOUD";

      if (finalModelType === "standard" && isCloudBrand) {
        return response.error("Standard stores cannot be assigned to the CLOUD brand", 400);
      }
      if (finalModelType === "cloud_kitchen" && !isCloudBrand) {
        return response.error("Cloud Kitchen stores must be assigned to the CLOUD brand", 400);
      }
    }

    // 3. Manager Validation
    if (updateData.managerId && updateData.managerId !== currentStore.managerId) {
      const manager = await prisma.user.findUnique({
        where: { id: updateData.managerId },
        include: { roleAssignments: true }
      });
      if (!manager) return response.error("Manager user not found", 404);
      const hasManagerRole = manager.roleAssignments.some(r => r.roleKey === "store_manager");
      if (!hasManagerRole) return response.error("Selected user is not a Store Manager", 400);
    }

    const updated = await prisma.store.update({
      where: { id },
      data: updateData,
      include: {
        brand: true,
        manager: { select: { id: true, fullName: true, email: true } },
        am: { select: { id: true, fullName: true, email: true } }
      }
    });

    return response.success(updated, "Store updated successfully");
  } catch (error) {
    console.error("[PATCH /api/stores/[id]] Error:", error);
    return response.error("Internal server error", 500);
  }
}
