import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { z } from "zod";

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
  try {
    const forbidden = requireRole(request, ["company_admin", "qa_manager"]);
    if (forbidden) return forbidden;

    const brands = await prisma.brand.findMany({
      include: {
        _count: {
          select: { stores: true }
        }
      },
      orderBy: { name: "asc" },
    });

    return response.success(brands);
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
