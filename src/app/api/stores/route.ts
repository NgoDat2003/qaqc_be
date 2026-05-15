import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import {
  getValidationMessage,
  storeCreateSchema,
  storeDetailSelect,
  storeSelect,
} from "@/lib/admin";
import {
  activeUserHasRole,
  isBrandCompatibleWithModelType,
} from "@/lib/admin-db";
import { invalidateAdminCache, readAdminCache } from "@/lib/admin-cache";
import { withServerTiming } from "@/lib/server-timing";

export async function GET(request: NextRequest) {
  const startedAt = performance.now();
  const forbidden = requireRole(request, ["company_admin", "qa_manager"]);
  if (forbidden) return forbidden;

  try {
    const dbStartedAt = performance.now();
    const { value: stores, cacheHit } = await readAdminCache("stores:list", () =>
      prisma.store.findMany({
        select: storeSelect,
        orderBy: { code: "asc" },
      })
    );
    const dbDuration = performance.now() - dbStartedAt;

    return withServerTiming(response.success(stores), [
      {
        name: cacheHit ? "cache" : "db",
        durationMs: dbDuration,
        description: cacheHit ? "Admin cache hit" : "Prisma query",
      },
      { name: "total", durationMs: performance.now() - startedAt, description: "Route handler" },
    ]);
  } catch (error) {
    console.error("Get stores error:", error);
    return response.error("Internal server error", 500);
  }
}

export async function POST(request: NextRequest) {
  const forbidden = requireRole(request, ["company_admin"]);
  if (forbidden) return forbidden;

  try {
    const parsed = storeCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return response.error(getValidationMessage(parsed.error), 400);
    }

    const [duplicateStore, brand] = await Promise.all([
      prisma.store.findUnique({
        where: { code: parsed.data.code },
        select: { id: true },
      }),
      prisma.brand.findUnique({
        where: { id: parsed.data.brandId },
        select: { id: true, code: true },
      }),
    ]);

    if (duplicateStore) {
      return response.error("Store code already exists", 400);
    }

    if (!brand) {
      return response.error("Brand not found", 404);
    }

    if (!isBrandCompatibleWithModelType(brand.code, parsed.data.modelType)) {
      return parsed.data.modelType === "standard"
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

    const store = await prisma.store.create({
      data: parsed.data,
      select: storeDetailSelect,
    });

    invalidateAdminCache("stores:", "brands:", "users:");
    return response.created(store, "Store created successfully");
  } catch (error) {
    console.error("Create store error:", error);
    return response.error("Internal server error", 500);
  }
}
