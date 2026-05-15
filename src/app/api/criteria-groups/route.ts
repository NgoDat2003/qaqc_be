import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { withServerTiming } from "@/lib/server-timing";
import { z } from "zod";

const createGroupSchema = z.object({
  code: z.string().min(1, "Code is required").toUpperCase(),
  name: z.string().min(2, "Name is required"),
  weight: z.number().min(0).max(1),
  color: z.string().optional().nullable(),
});

/**
 * GET /api/criteria-groups
 */
export async function GET(request: NextRequest) {
  const startedAt = performance.now();

  try {
    const forbidden = requireRole(request, ["company_admin", "qa_manager", "qc_auditor"]);
    if (forbidden) return forbidden;

    const lookupStartedAt = performance.now();
    const groups = await prisma.criteriaGroup.findMany({
      include: {
        _count: { select: { items: true } }
      },
      orderBy: { code: "asc" }
    });
    const lookupDuration = performance.now() - lookupStartedAt;

    return withServerTiming(response.success(groups), [
      { name: "lookup", durationMs: lookupDuration, description: "Criteria group query" },
      { name: "total", durationMs: performance.now() - startedAt, description: "Route handler" },
    ]);
  } catch (error) {
    console.error("[GET /api/criteria-groups] Error:", error);
    return response.error("Internal server error", 500);
  }
}

/**
 * POST /api/criteria-groups
 */
export async function POST(request: NextRequest) {
  try {
    const forbidden = requireRole(request, ["company_admin", "qa_manager"]);
    if (forbidden) return forbidden;

    const body = await request.json();
    const parsed = createGroupSchema.safeParse(body);

    if (!parsed.success) {
      return response.error(parsed.error.errors[0].message, 400);
    }

    // Check unique code
    const existing = await prisma.criteriaGroup.findUnique({ where: { code: parsed.data.code } });
    if (existing) return response.error("Group code already exists", 400);

    const group = await prisma.criteriaGroup.create({
      data: parsed.data
    });

    return response.created(group, "Criteria group created successfully");
  } catch (error) {
    console.error("[POST /api/criteria-groups] Error:", error);
    return response.error("Internal server error", 500);
  }
}
