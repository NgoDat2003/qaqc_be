import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { getValidationMessage } from "@/lib/qam";
import {
  assertImagesAttachable,
  auditCorrectionSchema,
  calculateAuditScoreFromViolations,
  getRequestUser,
  getStoreManagerUserIds,
  notifyUsers,
} from "@/lib/audit-workflow";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const forbidden = requireRole(request, ["qa_manager"]);
    if (forbidden) return forbidden;

    const { userId } = getRequestUser(request);
    if (!userId) return response.unauthorized();

    const body = await request.json();
    const parsed = auditCorrectionSchema.safeParse(body);
    if (!parsed.success) {
      return response.error(getValidationMessage(parsed.error), 400);
    }

    const audit = await (prisma as any).audit.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        storeId: true,
        submittedAt: true,
        actionPlan: { select: { id: true } },
        correctionRequests: {
          where: { status: "approved" },
          orderBy: { reviewedAt: "desc" },
          take: 1,
          select: { id: true, status: true },
        },
        form: {
          select: {
            id: true,
            name: true,
            version: true,
            sections: {
              orderBy: { order: "asc" },
              select: {
                id: true,
                groupId: true,
                weight: true,
                group: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                    weight: true,
                  },
                },
                items: {
                  orderBy: { order: "asc" },
                  select: {
                    id: true,
                    criteriaId: true,
                    criteria: {
                      select: {
                        id: true,
                        code: true,
                        name: true,
                        content: true,
                        deductionPerError: true,
                        maxDeduction: true,
                        flag: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!audit || !audit.submittedAt) {
      return response.error("Audit result not found", 404);
    }

    if (audit.actionPlan) {
      return response.error(
        "Audit already has an action plan and cannot be corrected",
        400
      );
    }

    if (audit.correctionRequests.length === 0) {
      return response.error("Audit correction request must be approved first", 400);
    }

    const imageIds = parsed.data.violations.flatMap((violation) => violation.imageIds);
    const imagesCheck = await assertImagesAttachable(imageIds, { auditId: audit.id });
    if (!imagesCheck.ok) return response.error(imagesCheck.message, 400);

    const calculated = await calculateAuditScoreFromViolations({
      audit,
      violations: parsed.data.violations,
      excludeAuditId: audit.id,
    });

    if (!calculated.ok) {
      return response.error(calculated.message, 400);
    }

    const savedAudit = await prisma.$transaction(async (tx) => {
      const previousViolations = await tx.violation.findMany({
        where: { auditId: audit.id },
        select: { id: true },
      });
      const previousViolationIds = previousViolations.map((item) => item.id);

      if (previousViolationIds.length > 0) {
        await tx.evidence.updateMany({
          where: { violationId: { in: previousViolationIds } },
          data: { violationId: null },
        });
      }

      await tx.violation.deleteMany({ where: { auditId: audit.id } });
      await tx.groupScore.deleteMany({ where: { auditId: audit.id } });

      for (const violation of parsed.data.violations) {
        const repeat = calculated.repeatInfoByCriteriaId.get(violation.criteriaId);
        const criterion = calculated.criteriaById.get(violation.criteriaId)!;
        const created = await tx.violation.create({
          data: {
            auditId: audit.id,
            criteriaId: violation.criteriaId,
            numErrors: violation.numErrors,
            repeatCount: repeat?.repeatCount ?? 0,
            isCriticalTriggered: repeat?.isCriticalTriggered ?? false,
            isRiskTriggered:
              criterion.criterion.flag === "risk" && violation.numErrors > 0,
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

      if (calculated.score.groupScores.length > 0) {
        await tx.groupScore.createMany({
          data: calculated.score.groupScores.map((group) => ({
            auditId: audit.id,
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

      return tx.audit.update({
        where: { id: audit.id },
        data: {
          finalScore: calculated.score.finalScore,
          grade: calculated.score.grade,
          isRiskTriggered: calculated.score.isRiskTriggered,
          editedAt: new Date(),
          editNote: parsed.data.editNote,
        },
        select: {
          id: true,
          finalScore: true,
          grade: true,
          isRiskTriggered: true,
          editedAt: true,
          editNote: true,
        },
      });
    });

    await notifyUsers({
      userIds: await getStoreManagerUserIds(audit.storeId),
      title: "Bai audit da duoc cap nhat",
      message: "QA da cap nhat lai loi va diem cua bai audit.",
      type: "info",
      link: `/audit-results/${audit.id}`,
    });

    return response.success(
      {
        ...savedAudit,
        repeatInfo: calculated.repeatInfo,
      },
      "Audit result corrected"
    );
  } catch (error) {
    console.error("Correct audit result error:", error);
    return response.error("Internal server error", 500);
  }
}
