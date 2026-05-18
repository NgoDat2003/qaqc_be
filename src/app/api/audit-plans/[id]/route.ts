import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import {
  assertUniqueValues,
  auditPlanDetailSelect,
  auditPlanUpdateSchema,
  getValidationMessage,
  isValidAuditWindow,
  mapAuditPlan,
  parseDate,
  QAM_ROLES,
} from "@/lib/qam";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const forbidden = requireRole(request, [...QAM_ROLES]);
  if (forbidden) return forbidden;

  try {
    const plan = await prisma.auditPlan.findUnique({
      where: { id: params.id },
      select: auditPlanDetailSelect,
    });

    if (!plan) {
      return response.error("Audit plan not found", 404);
    }

    return response.success(mapAuditPlan(plan));
  } catch (error) {
    console.error("Get audit plan detail error:", error);
    return response.error("Internal server error", 500);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const forbidden = requireRole(request, [...QAM_ROLES]);
  if (forbidden) return forbidden;

  try {
    const parsed = auditPlanUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return response.error(getValidationMessage(parsed.error), 400);
    }

    const existing = await prisma.auditPlan.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        status: true,
        formId: true,
        startDate: true,
        endDate: true,
      },
    });

    if (!existing) {
      return response.error("Audit plan not found", 404);
    }

    if (existing.status === "closed") {
      return response.error("Closed audit plan cannot be changed", 400);
    }

    if (
      existing.status === "open" &&
      (parsed.data.formId !== undefined || parsed.data.assignments !== undefined)
    ) {
      return response.error("Open audit plan can only update name and audit window", 400);
    }

    const startDate = parsed.data.startDate
      ? parseDate(parsed.data.startDate)
      : existing.startDate;
    const endDate = parsed.data.endDate
      ? parseDate(parsed.data.endDate)
      : existing.endDate;

    if (!startDate || !endDate) {
      return response.error("Invalid audit window", 400);
    }

    if (!isValidAuditWindow(startDate, endDate)) {
      return response.error("startDate must be before or equal to endDate", 400);
    }

    const formId = parsed.data.formId ?? existing.formId;
    const updateData: {
      name?: string;
      formId?: string;
      startDate: Date;
      endDate: Date;
    } = {
      startDate,
      endDate,
    };

    if (parsed.data.name !== undefined) {
      updateData.name = parsed.data.name;
    }

    if (parsed.data.formId !== undefined) {
      updateData.formId = formId;
    }

    if (existing.status === "draft" && parsed.data.formId !== undefined) {
      const form = await prisma.checklistForm.findUnique({
        where: { id: formId },
        select: { id: true, status: true },
      });

      if (!form) {
        return response.error("Checklist not found", 404);
      }

      if (form.status !== "published") {
        return response.error("Audit plan requires a published checklist", 400);
      }
    }

    if (existing.status === "draft" && parsed.data.assignments !== undefined) {
      const storeIds = parsed.data.assignments.map((assignment) => assignment.storeId);
      const auditorIds = Array.from(
        new Set(parsed.data.assignments.map((assignment) => assignment.auditorId))
      );

      if (!assertUniqueValues(storeIds)) {
        return response.error("Duplicate storeId is not allowed in one audit plan", 400);
      }

      const [stores, auditors] = await Promise.all([
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

      if (stores.length !== storeIds.length) {
        return response.error("All stores must exist and be active", 400);
      }

      if (auditors.length !== auditorIds.length) {
        return response.error("All auditors must be active QC users", 400);
      }
    }

    const plan = await prisma.$transaction(async (tx) => {
      await tx.auditPlan.update({
        where: { id: params.id },
        data: updateData,
        select: { id: true },
      });

      if (existing.status === "draft" && parsed.data.assignments !== undefined) {
        await tx.auditAssignment.deleteMany({
          where: { planId: params.id },
        });

        if (parsed.data.assignments.length > 0) {
          await tx.auditAssignment.createMany({
            data: parsed.data.assignments.map((assignment) => ({
              planId: params.id,
              storeId: assignment.storeId,
              auditorId: assignment.auditorId,
              status: "pending",
            })),
          });
        }
      }

      return tx.auditPlan.findUniqueOrThrow({
        where: { id: params.id },
        select: auditPlanDetailSelect,
      });
    });

    return response.success(mapAuditPlan(plan), "Audit plan updated successfully");
  } catch (error) {
    console.error("Update audit plan error:", error);
    return response.error("Internal server error", 500);
  }
}
