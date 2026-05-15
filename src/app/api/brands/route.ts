import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { getPaginationMeta, getPaginationParams } from "@/lib/pagination";
import { withServerTiming } from "@/lib/server-timing";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * @skill zod-validation-expert
 * Schema for creating a brand.
 * - code: Unique identifier (e.g., 'MC', 'BO')
 * - name: Display name (e.g., 'Maycha', 'Bò Lế Rồ')
 */
const createBrandSchema = z.object({
  code: z.string()
    .min(2, "Brand code must be at least 2 characters")
    .max(10, "Brand code too long")
    .toUpperCase(),
  name: z.string()
    .min(2, "Brand name must be at least 2 characters")
    .max(100, "Brand name too long"),
});

/**
 * GET /api/brands
 * List all brands.
 * Accessible by: company_admin, qa_manager
 */
export async function GET(request: NextRequest) {
  const startedAt = performance.now();

  try {
    const forbidden = requireRole(request, ["company_admin", "qa_manager"]);
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const pagination = getPaginationParams(searchParams);

    let countDuration = 0;
    let rowsDuration = 0;
    const dbStartedAt = performance.now();
    const countStartedAt = performance.now();
    const totalPromise = prisma.brand.count().finally(() => {
      countDuration = performance.now() - countStartedAt;
    });
    const rowsStartedAt = performance.now();
    const brandsPromise = prisma.brand.findMany({
        skip: pagination.skip,
        take: pagination.take,
        select: {
          id: true,
          code: true,
          name: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { stores: true }
          }
        },
        orderBy: { name: "asc" },
      }).finally(() => {
      rowsDuration = performance.now() - rowsStartedAt;
    });
    const [total, brands] = await Promise.all([totalPromise, brandsPromise]);
    const dbDuration = performance.now() - dbStartedAt;

    return withServerTiming(
      response.success(brands, undefined, getPaginationMeta(pagination, total)),
      [
        { name: "count", durationMs: countDuration, description: "Prisma count query" },
        { name: "rows", durationMs: rowsDuration, description: "Prisma rows query" },
        { name: "db", durationMs: dbDuration, description: "Prisma list queries" },
        { name: "total", durationMs: performance.now() - startedAt, description: "Route handler" },
      ]
    );
  } catch (error) {
    console.error("[GET /api/brands] Error:", error);
    return response.error("Internal server error", 500);
  }
}

/**
 * POST /api/brands
 * Create a new brand.
 * Accessible by: company_admin only
 */
export async function POST(request: NextRequest) {
  try {
    const forbidden = requireRole(request, ["company_admin"]);
    if (forbidden) return forbidden;

    const body = await request.json();
    const parsed = createBrandSchema.safeParse(body);

    if (!parsed.success) {
      return response.error(parsed.error.errors[0].message, 400);
    }

    const { code, name } = parsed.data;

    // Check for existing brand
    const existing = await prisma.brand.findFirst({
      where: {
        OR: [
          { code },
          { name }
        ]
      }
    });

    if (existing) {
      const field = existing.code === code ? "code" : "name";
      return response.error(`Brand ${field} already exists`, 400);
    }

    const brand = await prisma.brand.create({
      data: { code, name },
    });

    return response.created(brand, "Brand created successfully");
  } catch (error) {
    console.error("[POST /api/brands] Error:", error);
    return response.error("Internal server error", 500);
  }
}
