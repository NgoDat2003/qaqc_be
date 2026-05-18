import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import {
  assertPendingAssignmentMutable,
  auditAssignmentUpdateSchema,
  auditPlanDetailSelect,
  getValidationMessage,
  mapAuditPlan,
  QAM_ROLES,
} from "@/lib/qam";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; assignmentId: string } }
) {
  const forbidden = requireRole(request, [...QAM_ROLES]);
  if (forbidden) return forbidden;

  try {
    const parsed = auditAssignmentUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return response.error(getValidationMessage(parsed.error), 400);
    }

    const assignment = await prisma.auditAssignment.findUnique({
      where: { id: params.assignmentId },
      select: {
        id: true,
        planId: true,
        status: true,
        auditId: true,
        plan: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!assignment || assignment.planId !== params.id) {
      return response.error("Audit assignment not found", 404);
    }

    if (assignment.plan.status === "closed") {
      return response.error("Closed audit plan cannot be changed", 400);
    }

    const assignmentError = assertPendingAssignmentMutable(assignment);
    if (assignmentError) {
      return response.error(assignmentError, 400);
    }

    const auditor = await prisma.user.findFirst({
      where: {
        id: parsed.data.auditorId,
        isActive: true,
        roleAssignments: {
          some: {
            roleKey: "qc_auditor",
          },
        },
      },
      select: { id: true },
    });

    if (!auditor) {
      return response.error("Auditor must be an active QC user", 400);
    }

    await prisma.auditAssignment.update({
      where: { id: params.assignmentId },
      data: { auditorId: parsed.data.auditorId },
      select: { id: true },
    });

    const plan = await prisma.auditPlan.findUniqueOrThrow({
      where: { id: params.id },
      select: auditPlanDetailSelect,
    });

    return response.success(mapAuditPlan(plan), "Audit assignment updated successfully");
  } catch (error) {
    console.error("Update audit assignment error:", error);
    return response.error("Internal server error", 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; assignmentId: string } }
) {
  const forbidden = requireRole(request, [...QAM_ROLES]);
  if (forbidden) return forbidden;

  try {
    const assignment = await prisma.auditAssignment.findUnique({
      where: { id: params.assignmentId },
      select: {
        id: true,
        planId: true,
        status: true,
        auditId: true,
        plan: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!assignment || assignment.planId !== params.id) {
      return response.error("Audit assignment not found", 404);
    }

    if (assignment.plan.status === "closed") {
      return response.error("Closed audit plan cannot be changed", 400);
    }

    const assignmentError = assertPendingAssignmentMutable(assignment);
    if (assignmentError) {
      return response.error(assignmentError, 400);
    }

    if (assignment.plan.status === "open") {
      const assignmentCount = await prisma.auditAssignment.count({
        where: { planId: params.id },
      });

      if (assignmentCount <= 1) {
        return response.error("Open audit plan requires at least one assignment", 400);
      }
    }

    await prisma.auditAssignment.delete({
      where: { id: params.assignmentId },
    });

    const plan = await prisma.auditPlan.findUniqueOrThrow({
      where: { id: params.id },
      select: auditPlanDetailSelect,
    });

    return response.success(mapAuditPlan(plan), "Audit assignment deleted successfully");
  } catch (error) {
    console.error("Delete audit assignment error:", error);
    return response.error("Internal server error", 500);
  }
}
