import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { getPaginationMeta, getPaginationParams } from "@/lib/pagination";
import { withServerTiming } from "@/lib/server-timing";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createCriteriaSchema = z.object({
  code: z.string().min(1, "Code is required").toUpperCase(),
  groupId: z.string().min(1, "Group ID is required"),
  content: z.string().min(5, "Content is too short"),
  deductionPerError: z.number().min(0).default(1.0),
  maxDeduction: z.number().min(0).default(5.0),
  flag: z.enum(["none", "critical", "risk"]).default("none"),
});

/**
 * GET /api/criteria
 */
export async function GET(request: NextRequest) {
  const startedAt = performance.now();

  try {
    const forbidden = requireRole(request, ["company_admin", "qa_manager", "qc_auditor"]);
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const pagination = getPaginationParams(searchParams);
    const groupId = searchParams.get("groupId");
    const where = groupId ? { groupId } : {};

    let countDuration = 0;
    let rowsDuration = 0;
    const dbStartedAt = performance.now();
    const countStartedAt = performance.now();
    const totalPromise = prisma.criteria.count({ where }).finally(() => {
      countDuration = performance.now() - countStartedAt;
    });
    const rowsStartedAt = performance.now();
    const criteriaPromise = prisma.criteria.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        select: {
          id: true,
          code: true,
          content: true,
          deductionPerError: true,
          maxDeduction: true,
          flag: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          group: { select: { id: true, name: true, code: true, weight: true } },
        },
        orderBy: { code: "asc" }
      }).finally(() => {
      rowsDuration = performance.now() - rowsStartedAt;
    });
    const [total, criteria] = await Promise.all([totalPromise, criteriaPromise]);
    const dbDuration = performance.now() - dbStartedAt;

    return withServerTiming(
      response.success(criteria, undefined, getPaginationMeta(pagination, total)),
      [
        { name: "count", durationMs: countDuration, description: "Prisma count query" },
        { name: "rows", durationMs: rowsDuration, description: "Prisma rows query" },
        { name: "db", durationMs: dbDuration, description: "Prisma list queries" },
        { name: "total", durationMs: performance.now() - startedAt, description: "Route handler" },
      ]
    );
  } catch (error) {
    console.error("[GET /api/criteria] Error:", error);
    return response.error("Internal server error", 500);
  }
}

/**
 * POST /api/criteria
 */
export async function POST(request: NextRequest) {
  try {
    const forbidden = requireRole(request, ["company_admin", "qa_manager"]);
    if (forbidden) return forbidden;

    const body = await request.json();
    const parsed = createCriteriaSchema.safeParse(body);

    if (!parsed.success) {
      return response.error(parsed.error.errors[0].message, 400);
    }

    // Check unique code
    const existing = await prisma.criteria.findUnique({ where: { code: parsed.data.code } });
    if (existing) return response.error("Criteria code already exists", 400);

    const criteria = await prisma.criteria.create({
      data: parsed.data,
      include: { group: true }
    });

    return response.created(criteria, "Criteria created successfully");
  } catch (error) {
    console.error("[POST /api/criteria] Error:", error);
    return response.error("Internal server error", 500);
  }
}
