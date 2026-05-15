import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { brandSelect, brandUpdateSchema, getValidationMessage } from "@/lib/admin";
import { invalidateAdminCache } from "@/lib/admin-cache";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const forbidden = requireRole(request, ["company_admin"]);
  if (forbidden) return forbidden;

  try {
    const parsed = brandUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return response.error(getValidationMessage(parsed.error), 400);
    }

    const currentBrand = await prisma.brand.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        name: true,
      },
    });

    if (!currentBrand) {
      return response.error("Brand not found", 404);
    }

    if (parsed.data.name && parsed.data.name !== currentBrand.name) {
      const duplicate = await prisma.brand.findUnique({
        where: { name: parsed.data.name },
        select: { id: true },
      });

      if (duplicate) {
        return response.error("Brand name already exists", 400);
      }
    }

    const brand = await prisma.brand.update({
      where: { id: params.id },
      data: parsed.data,
      select: brandSelect,
    });

    invalidateAdminCache("brands:");
    return response.success(brand, "Brand updated successfully");
  } catch (error) {
    console.error("Update brand error:", error);
    return response.error("Internal server error", 500);
  }
}
