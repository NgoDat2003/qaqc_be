import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { brandCreateSchema, brandSelect, getValidationMessage } from "@/lib/admin";
import { invalidateAdminCache, readAdminCache } from "@/lib/admin-cache";
import { withServerTiming } from "@/lib/server-timing";

export async function GET(request: NextRequest) {
  const startedAt = performance.now();
  const forbidden = requireRole(request, ["company_admin", "qa_manager"]);
  if (forbidden) return forbidden;

  try {
    const dbStartedAt = performance.now();
    const { value: brands, cacheHit } = await readAdminCache("brands:list", () =>
      prisma.brand.findMany({
        select: brandSelect,
        orderBy: { name: "asc" },
      })
    );
    const dbDuration = performance.now() - dbStartedAt;

    return withServerTiming(response.success(brands), [
      {
        name: cacheHit ? "cache" : "db",
        durationMs: dbDuration,
        description: cacheHit ? "Admin cache hit" : "Prisma query",
      },
      {
        name: "total",
        durationMs: performance.now() - startedAt,
        description: "Route handler",
      },
    ]);
  } catch (error) {
    console.error("Get brands error:", error);
    return response.error("Internal server error", 500);
  }
}

export async function POST(request: NextRequest) {
  const forbidden = requireRole(request, ["company_admin"]);
  if (forbidden) return forbidden;

  try {
    const parsed = brandCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return response.error(getValidationMessage(parsed.error), 400);
    }

    const existingBrand = await prisma.brand.findFirst({
      where: {
        OR: [
          { code: parsed.data.code },
          { name: parsed.data.name },
        ],
      },
      select: {
        code: true,
        name: true,
      },
    });

    if (existingBrand?.code === parsed.data.code) {
      return response.error("Brand code already exists", 400);
    }

    if (existingBrand?.name === parsed.data.name) {
      return response.error("Brand name already exists", 400);
    }

    const brand = await prisma.brand.create({
      data: parsed.data,
      select: brandSelect,
    });

    invalidateAdminCache("brands:");
    return response.created(brand, "Brand created successfully");
  } catch (error) {
    console.error("Create brand error:", error);
    return response.error("Internal server error", 500);
  }
}
