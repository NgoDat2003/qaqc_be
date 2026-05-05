import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { z } from "zod";

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
  try {
    const forbidden = requireRole(request, ["company_admin", "qa_manager", "qc_auditor"]);
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get("groupId");

    const criteria = await prisma.criteria.findMany({
      where: groupId ? { groupId } : {},
      include: {
        group: { select: { name: true, code: true } }
      },
      orderBy: { code: "asc" }
    });

    return response.success(criteria);
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
