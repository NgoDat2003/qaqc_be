import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import {
  getValidationMessage,
  storeDetailSelect,
  storeUpdateSchema,
} from "@/lib/admin";
import {
  activeUserHasRole,
  isBrandCompatibleWithModelType,
} from "@/lib/admin-db";
import { invalidateAdminCache } from "@/lib/admin-cache";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const forbidden = requireRole(request, ["company_admin", "qa_manager"]);
  if (forbidden) return forbidden;

  try {
    const store = await prisma.store.findUnique({
      where: { id: params.id },
      select: storeDetailSelect,
    });

    if (!store) {
      return response.error("Store not found", 404);
    }

    return response.success(store);
  } catch (error) {
    console.error("Get store error:", error);
    return response.error("Internal server error", 500);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const forbidden = requireRole(request, ["company_admin"]);
  if (forbidden) return forbidden;

  try {
    const parsed = storeUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return response.error(getValidationMessage(parsed.error), 400);
    }

    const currentStore = await prisma.store.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        modelType: true,
        brandId: true,
      },
    });

    if (!currentStore) {
      return response.error("Store not found", 404);
    }

    const nextBrandId = parsed.data.brandId ?? currentStore.brandId;
    const nextModelType = parsed.data.modelType ?? currentStore.modelType;

    const brand = await prisma.brand.findUnique({
      where: { id: nextBrandId },
      select: { id: true, code: true },
    });

    if (!brand) {
      return response.error("Brand not found", 404);
    }

    if (!isBrandCompatibleWithModelType(brand.code, nextModelType)) {
      return nextModelType === "standard"
        ? response.error("Standard stores cannot use the CLOUD brand", 400)
        : response.error("Cloud Kitchen must use the CLOUD brand", 400);
    }

    if (parsed.data.amId && !(await activeUserHasRole(parsed.data.amId, "am"))) {
      return response.error("AM user must be active and have am role", 400);
    }

    if (
      parsed.data.managerId &&
      !(await activeUserHasRole(parsed.data.managerId, "store_manager"))
    ) {
      return response.error("Manager user must be active and have store_manager role", 400);
    }

    const store = await prisma.store.update({
      where: { id: params.id },
      data: parsed.data,
      select: storeDetailSelect,
    });

    invalidateAdminCache("stores:", "brands:", "users:");
    return response.success(store, "Store updated successfully");
  } catch (error) {
    console.error("Update store error:", error);
    return response.error("Internal server error", 500);
  }
}
