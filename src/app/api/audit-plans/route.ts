import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import {
  assertUniqueValues,
  auditPlanCreateSchema,
  auditPlanDetailSelect,
  getValidationMessage,
  mapAuditPlan,
  parseDate,
  QAM_ROLES,
} from "@/lib/qam";

export async function GET(request: NextRequest) {
  const forbidden = requireRole(request, [...QAM_ROLES]);
  if (forbidden) return forbidden;

  try {
    const plans = await prisma.auditPlan.findMany({
      select: auditPlanDetailSelect,
      orderBy: { createdAt: "desc" },
    });

    return response.success(plans.map(mapAuditPlan));
  } catch (error) {
    console.error("Get audit plans error:", error);
    return response.error("Internal server error", 500);
  }
}

export async function POST(request: NextRequest) {
  const forbidden = requireRole(request, [...QAM_ROLES]);
  if (forbidden) return forbidden;

  try {
    const parsed = auditPlanCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return response.error(getValidationMessage(parsed.error), 400);
    }

    const storeIds = parsed.data.assignments.map((assignment) => assignment.storeId);
    const auditorIds = Array.from(
      new Set(parsed.data.assignments.map((assignment) => assignment.auditorId))
    );
    const scheduledDates = parsed.data.assignments.map((assignment) =>
      parseDate(assignment.scheduledDate)
    );

    if (!assertUniqueValues(storeIds)) {
      return response.error("Duplicate storeId is not allowed in one audit plan", 400);
    }

    if (scheduledDates.some((date) => !date)) {
      return response.error("Invalid scheduledDate", 400);
    }

    const [form, stores, auditors] = await Promise.all([
      prisma.checklistForm.findUnique({
        where: { id: parsed.data.formId },
        select: { id: true, status: true },
      }),
      prisma.store.findMany({
        where: {
          id: { in: storeIds },
          isActive: true,
        },
        select: { id: true },
      }),
      prisma.user.findMany({
        where: {
          id: { in: auditorIds },
          isActive: true,
          roleAssignments: {
            some: {
              roleKey: "qc_auditor",
            },
          },
        },
        select: { id: true },
      }),
    ]);

    if (!form) {
      return response.error("Checklist not found", 404);
    }

    if (form.status !== "published") {
      return response.error("Audit plan requires a published checklist", 400);
    }

    if (stores.length !== storeIds.length) {
      return response.error("All stores must exist and be active", 400);
    }

    if (auditors.length !== auditorIds.length) {
      return response.error("All auditors must be active QC users", 400);
    }

    const plan = await prisma.$transaction(async (tx) => {
      const created = await tx.auditPlan.create({
        data: {
          name: parsed.data.name,
          formId: parsed.data.formId,
          status: "open",
          assignments: {
            create: parsed.data.assignments.map((assignment, index) => ({
              storeId: assignment.storeId,
              auditorId: assignment.auditorId,
              scheduledDate: scheduledDates[index]!,
              status: "pending",
            })),
          },
        },
        select: { id: true },
      });

      return tx.auditPlan.findUniqueOrThrow({
        where: { id: created.id },
        select: auditPlanDetailSelect,
      });
    });

    return response.created(mapAuditPlan(plan), "Audit plan created successfully");
  } catch (error) {
    console.error("Create audit plan error:", error);
    return response.error("Internal server error", 500);
  }
}
