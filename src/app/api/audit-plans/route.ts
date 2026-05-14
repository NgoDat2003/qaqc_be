import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { getPaginationMeta, getPaginationParams } from "@/lib/pagination";
import { z } from "zod";

const createPlanSchema = z.object({
  name: z.string().min(1, "Plan name is required"),
  formId: z.string().min(1, "Form ID is required"),
  assignments: z.array(z.object({
    storeId: z.string(),
    auditorId: z.string(),
    scheduledDate: z.string().transform(v => new Date(v)),
  })).min(1, "At least one assignment is required"),
});

/**
 * GET /api/audit-plans
 */
export async function GET(request: NextRequest) {
  try {
    const forbidden = requireRole(request, ["company_admin", "qa_manager"]);
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const pagination = getPaginationParams(searchParams);

    const [total, plans] = await prisma.$transaction([
      prisma.auditPlan.count(),
      prisma.auditPlan.findMany({
        skip: pagination.skip,
        take: pagination.take,
        select: {
          id: true,
          name: true,
          type: true,
          scope: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          form: { select: { id: true, name: true, version: true, status: true } },
          _count: { select: { assignments: true } },
        },
        orderBy: { createdAt: "desc" }
      }),
    ]);

    return response.success(plans, undefined, getPaginationMeta(pagination, total));
  } catch (error) {
    console.error("[GET /api/audit-plans] Error:", error);
    return response.error("Internal server error", 500);
  }
}

/**
 * POST /api/audit-plans
 */
export async function POST(request: NextRequest) {
  try {
    const forbidden = requireRole(request, ["company_admin", "qa_manager"]);
    if (forbidden) return forbidden;

    const body = await request.json();
    const parsed = createPlanSchema.safeParse(body);

    if (!parsed.success) {
      return response.error(parsed.error.errors[0].message, 400);
    }

    const { name, formId, assignments } = parsed.data;

    // Verify form
    const form = await prisma.checklistForm.findUnique({ where: { id: formId } });
    if (!form || form.status !== "published") {
      return response.error("Active published checklist form not found", 400);
    }

    const plan = await prisma.auditPlan.create({
      data: {
        name,
        formId,
        type: "adhoc",
        scope: "company",
        status: "open",
        assignments: {
          create: assignments
        }
      },
      include: { assignments: true }
    });

    return response.created(plan, "Audit plan created successfully");
  } catch (error) {
    console.error("[POST /api/audit-plans] Error:", error);
    return response.error("Internal server error", 500);
  }
}
