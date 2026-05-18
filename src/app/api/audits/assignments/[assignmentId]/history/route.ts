import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import {
  auditAssignmentHistorySelect,
  getChecklistCriteriaIds,
  getRepeatState,
  QC_ROLES,
} from "@/lib/audit";

export async function GET(
  request: NextRequest,
  { params }: { params: { assignmentId: string } }
) {
  const forbidden = requireRole(request, [...QC_ROLES]);
  if (forbidden) return forbidden;

  const userId = request.headers.get("x-user-id");
  if (!userId) return response.unauthorized();

  try {
    const assignment = await prisma.auditAssignment.findUnique({
      where: { id: params.assignmentId },
      select: auditAssignmentHistorySelect,
    });

    if (!assignment) {
      return response.error("Audit assignment not found", 404);
    }

    if (assignment.auditorId !== userId) {
      return response.forbidden("Assignment does not belong to current auditor");
    }

    const criteriaIds = getChecklistCriteriaIds(assignment);
    const histories = await prisma.violation.findMany({
      where: {
        criteriaId: { in: criteriaIds },
        numErrors: { gt: 0 },
        audit: {
          storeId: assignment.storeId,
          submittedAt: { not: null },
        },
      },
      select: {
        criteriaId: true,
        numErrors: true,
        repeatCount: true,
        note: true,
        audit: {
          select: {
            id: true,
            submittedAt: true,
          },
        },
        evidences: {
          select: {
            id: true,
            url: true,
          },
        },
      },
    });

    const sortedHistories = histories.sort((left, right) => {
      const leftDate = left.audit.submittedAt?.getTime() ?? 0;
      const rightDate = right.audit.submittedAt?.getTime() ?? 0;
      return rightDate - leftDate;
    });

    const historiesByCriteriaId: Record<string, any> = {};
    for (const criteriaId of criteriaIds) {
      historiesByCriteriaId[criteriaId] = {
        criteriaId,
        ...getRepeatState(0),
        history: [],
      };
    }

    for (const history of sortedHistories) {
      historiesByCriteriaId[history.criteriaId].history.push({
        auditId: history.audit.id,
        submittedAt: history.audit.submittedAt,
        numErrors: history.numErrors,
        repeatCount: history.repeatCount,
        note: history.note,
        images: history.evidences,
      });
    }

    for (const item of Object.values(historiesByCriteriaId) as any[]) {
      Object.assign(item, getRepeatState(item.history.length));
    }

    return response.success({
      assignmentId: assignment.id,
      store: assignment.store,
      historiesByCriteriaId,
    });
  } catch (error) {
    console.error("Get audit history bundle error:", error);
    return response.error("Internal server error", 500);
  }
}
