import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { getValidationMessage } from "@/lib/qam";
import {
  assertAssignmentClaimed,
  assertUniqueViolationCriteria,
  AuditAssignmentConflictError,
  auditAssignmentSessionSelect,
  auditWriteSchema,
  getAuditCriteria,
  getAuditableAssignmentError,
  getChecklistGroups,
  globalRiskCriteriaSelect,
  getRepeatState,
  QC_ROLES,
} from "@/lib/audit";
import { calculateAuditScore } from "@/lib/scoring";

export async function POST(request: NextRequest) {
  const forbidden = requireRole(request, [...QC_ROLES]);
  if (forbidden) return forbidden;

  const userId = request.headers.get("x-user-id");
  if (!userId) return response.unauthorized();

  try {
    const parsed = auditWriteSchema.safeParse(await request.json());
    if (!parsed.success) {
      return response.error(getValidationMessage(parsed.error), 400);
    }

    if (!assertUniqueViolationCriteria(parsed.data.violations)) {
      return response.error("Duplicate criteriaId is not allowed in one audit", 400);
    }

    const assignment = await prisma.auditAssignment.findUnique({
      where: { id: parsed.data.assignmentId },
      select: auditAssignmentSessionSelect,
    });

    if (!assignment) {
      return response.error("Audit assignment not found", 404);
    }

    const auditableError = getAuditableAssignmentError(assignment, userId);
    if (auditableError) {
      return response.error(auditableError.message, auditableError.status);
    }

    if (assignment.audit?.submittedAt) {
      return response.error("Submitted audit cannot be changed by QC", 400);
    }

    const riskCriteria = await prisma.criteria.findMany({
      where: { flag: "risk", isActive: true },
      select: globalRiskCriteriaSelect,
      orderBy: { code: "asc" },
    });
    const checklistCriteria = getAuditCriteria(assignment, riskCriteria);
    const criteriaById = new Map<string, any>(
      checklistCriteria.map((item: any) => [item.criteriaId, item])
    );
    if (
      parsed.data.violations.some(
        (violation) => !criteriaById.has(violation.criteriaId)
      )
    ) {
      return response.error("All criteria must belong to the assigned checklist", 400);
    }

    const imageIds = Array.from(
      new Set(parsed.data.violations.flatMap((violation) => violation.imageIds))
    );
    if (imageIds.length > 0) {
      const images = await prisma.evidence.findMany({
        where: { id: { in: imageIds } },
        select: {
          id: true,
          violation: {
            select: {
              auditId: true,
            },
          },
          actionPlanId: true,
        },
      });

      if (images.length !== imageIds.length) {
        return response.error("Some images were not found", 400);
      }

      if (
        images.some(
          (image) =>
            image.actionPlanId ||
            (image.violation && image.violation.auditId !== assignment.auditId)
        )
      ) {
        return response.error("Some images are already attached elsewhere", 400);
      }
    }

    const positiveViolations = parsed.data.violations.filter(
      (violation) => violation.numErrors > 0
    );
    const repeatedHistory = await prisma.violation.findMany({
      where: {
        criteriaId: { in: positiveViolations.map((item) => item.criteriaId) },
        numErrors: { gt: 0 },
        audit: {
          storeId: assignment.storeId,
          submittedAt: { not: null },
        },
      },
      select: {
        criteriaId: true,
      },
    });
    const historyCountByCriteria = repeatedHistory.reduce<Record<string, number>>(
      (counts, item) => {
        counts[item.criteriaId] = (counts[item.criteriaId] ?? 0) + 1;
        return counts;
      },
      {}
    );

    const repeatInfo = positiveViolations.map((violation) => {
      const repeatState = getRepeatState(historyCountByCriteria[violation.criteriaId] ?? 0);
      return {
        criteriaId: violation.criteriaId,
        numErrors: violation.numErrors,
        ...repeatState,
      };
    });

    const repeatInfoByCriteriaId = new Map(
      repeatInfo.map((item) => [item.criteriaId, item])
    );
    const score = calculateAuditScore({
      groups: getChecklistGroups(assignment),
      criteria: checklistCriteria.map((item: any) => ({
        id: item.criteriaId,
        groupId: item.groupId,
        groupCode: item.groupCode,
        deductionPerError: item.criterion.deductionPerError,
        maxDeduction: item.criterion.maxDeduction,
        flag: item.criterion.flag,
      })),
      violations: positiveViolations.map((violation) => {
        const repeat = repeatInfoByCriteriaId.get(violation.criteriaId)!;
        return {
          criteriaId: violation.criteriaId,
          numErrors: violation.numErrors,
          repeatCount: repeat.repeatCount,
          repeatLabel: repeat.repeatLabel,
          isCriticalTriggered: repeat.isCriticalTriggered,
        };
      }),
    });

    const savedAudit = await prisma.$transaction(async (tx) => {
      let auditId = assignment.auditId;

      if (!auditId) {
        const createdAudit = await tx.audit.create({
          data: {
            formId: assignment.plan.formId,
            storeId: assignment.storeId,
            auditorId: assignment.auditorId,
          },
          select: { id: true },
        });
        auditId = createdAudit.id;

        const claimed = await tx.auditAssignment.updateMany({
          where: {
            id: assignment.id,
            auditorId: userId,
            auditId: null,
            status: { in: ["pending", "in_progress"] },
          },
          data: {
            auditId,
            status: "in_progress",
          },
        });
        assertAssignmentClaimed(claimed);
      } else {
        const claimed = await tx.auditAssignment.updateMany({
          where: {
            id: assignment.id,
            auditorId: userId,
            auditId,
            status: { in: ["pending", "in_progress"] },
          },
          data: {
            status: "in_progress",
          },
        });
        assertAssignmentClaimed(claimed);
      }

      const previousViolations = await tx.violation.findMany({
        where: { auditId },
        select: { id: true },
      });
      const previousViolationIds = previousViolations.map((item) => item.id);

      if (previousViolationIds.length > 0) {
        await tx.evidence.updateMany({
          where: { violationId: { in: previousViolationIds } },
          data: { violationId: null },
        });
      }

      await tx.violation.deleteMany({ where: { auditId } });
      await tx.groupScore.deleteMany({ where: { auditId } });

      for (const violation of parsed.data.violations) {
        const repeat = repeatInfoByCriteriaId.get(violation.criteriaId);
        const criterion = criteriaById.get(violation.criteriaId)!;
        const created = await tx.violation.create({
          data: {
            auditId,
            criteriaId: violation.criteriaId,
            numErrors: violation.numErrors,
            repeatCount: repeat?.repeatCount ?? 0,
            isCriticalTriggered: repeat?.isCriticalTriggered ?? false,
            isRiskTriggered: criterion.criterion.flag === "risk" && violation.numErrors > 0,
            note: violation.note ?? null,
          },
          select: { id: true },
        });

        if (violation.imageIds.length > 0) {
          await tx.evidence.updateMany({
            where: { id: { in: violation.imageIds } },
            data: { violationId: created.id },
          });
        }
      }

      if (score.groupScores.length > 0) {
        await tx.groupScore.createMany({
          data: score.groupScores.map((group) => ({
            auditId,
            groupId: group.groupId,
            groupCode: group.groupCode,
            weight: group.weight,
            maxScore: group.maxScore,
            reachedScore: group.reachedScore,
            percentage: group.percentage,
            triggeredCritical: group.triggeredCritical,
          })),
        });
      }

      const audit = await tx.audit.update({
        where: { id: auditId },
        data: {
          finalScore: score.finalScore,
          grade: score.grade,
          isRiskTriggered: score.isRiskTriggered,
          submittedAt: new Date(),
        },
        select: {
          id: true,
          finalScore: true,
          grade: true,
          isRiskTriggered: true,
        },
      });

      await tx.auditAssignment.update({
        where: { id: assignment.id },
        data: {
          auditId,
          status: "completed",
        },
      });

      return audit;
    });

    return response.success(
      {
        ...savedAudit,
        repeatInfo,
      },
      "Audit submitted successfully"
    );
  } catch (error) {
    if (error instanceof AuditAssignmentConflictError) {
      return response.error(error.message, 409);
    }

    console.error("Submit audit error:", error);
    return response.error("Internal server error", 500);
  }
}
