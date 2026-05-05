import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { z } from "zod";

/**
 * @skill zod-validation-expert
 * Store Schema with Brand Isolation rules.
 */
const createStoreSchema = z.object({
  code: z.string().min(2, "Store code must be at least 2 characters").toUpperCase(),
  name: z.string().min(2, "Store name is required"),
  modelType: z.enum(["standard", "cloud_kitchen"], {
    errorMap: () => ({ message: "Model type must be 'standard' or 'cloud_kitchen'" }),
  }),
  brandId: z.string().min(1, "Brand ID is required"),
  region: z.string().optional().nullable(),
  province: z.string().optional().nullable(),
  district: z.string().optional().nullable(),
  ward: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  managerId: z.string().optional().nullable(),
});

/**
 * GET /api/stores
 * List stores with filters.
 * Filters: brandId, isActive
 */
export async function GET(request: NextRequest) {
  try {
    const forbidden = requireRole(request, ["company_admin", "qa_manager"]);
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get("brandId");
    const isActiveParam = searchParams.get("isActive");

    const where: any = {};
    if (brandId) where.brandId = brandId;
    if (isActiveParam !== null && isActiveParam !== undefined && isActiveParam !== "") {
      where.isActive = isActiveParam === "true";
    }

    const stores = await prisma.store.findMany({
      where,
      include: {
        brand: { select: { id: true, code: true, name: true } },
        am: { select: { id: true, fullName: true, email: true } },
        manager: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { code: "asc" },
    });

    return response.success(stores);
  } catch (error) {
    console.error("[GET /api/stores] Error:", error);
    return response.error("Internal server error", 500);
  }
}

/**
 * POST /api/stores
 * Create a store with Brand Isolation rules.
 * Rule 1: 'standard' store CANNOT use 'CLOUD' brand.
 * Rule 2: 'cloud_kitchen' MUST use 'CLOUD' brand.
 */
export async function POST(request: NextRequest) {
  try {
    const forbidden = requireRole(request, ["company_admin"]);
    if (forbidden) return forbidden;

    const body = await request.json();
    const parsed = createStoreSchema.safeParse(body);

    if (!parsed.success) {
      return response.error(parsed.error.errors[0].message, 400);
    }

    const { brandId, modelType, code, managerId, ...rest } = parsed.data;

    // 1. Verify Brand exists and check Isolation rules
    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) return response.error("Brand not found", 404);

    const isCloudBrand = brand.code.toUpperCase() === "CLOUD";

    if (modelType === "standard" && isCloudBrand) {
      return response.error("Standard stores cannot be assigned to the CLOUD brand", 400);
    }
    if (modelType === "cloud_kitchen" && !isCloudBrand) {
      return response.error("Cloud Kitchen stores must be assigned to the CLOUD brand", 400);
    }

    // 2. Check duplicate store code
    const existing = await prisma.store.findUnique({ where: { code } });
    if (existing) return response.error("Store code already exists", 400);

    // 3. Verify Manager if provided
    if (managerId) {
      const manager = await prisma.user.findUnique({
        where: { id: managerId },
        include: { roleAssignments: true }
      });
      if (!manager) return response.error("Manager user not found", 404);
      
      const hasManagerRole = manager.roleAssignments.some(r => r.roleKey === "store_manager");
      if (!hasManagerRole) return response.error("Selected user is not a Store Manager", 400);
    }

    // 4. Create Store
    const store = await prisma.store.create({
      data: {
        code,
        modelType,
        brandId,
        managerId,
        ...rest
      },
      include: {
        brand: true,
        manager: { select: { id: true, fullName: true, email: true } }
      }
    });

    return response.created(store, "Store created successfully");
  } catch (error) {
    console.error("[POST /api/stores] Error:", error);
    return response.error("Internal server error", 500);
  }
}
