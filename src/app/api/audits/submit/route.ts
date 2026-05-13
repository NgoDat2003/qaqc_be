import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { calculateRepeatInfo } from "@/lib/audit-repeat";
import { calculateAuditScore, CriteriaInput, GroupWeight } from "@/lib/scoring";
import { z } from "zod";

const submitSchema = z.object({
  assignmentId: z.string(),
  violations: z.array(z.object({
    criteriaId: z.string(),
    numErrors: z.number().int().min(0),
    note: z.string().optional().nullable(),
    evidenceUrls: z.array(z.string()).optional().default([]),
  })),
});

/**
 * POST /api/audits/submit
 * Submit audit, tinh diem bang scoring engine va khoa assignment.
 */
export async function POST(request: NextRequest) {
  try {
    const forbidden = requireRole(request, ["qc_auditor"]);
    if (forbidden) return forbidden;

    const auditorId = request.headers.get("x-user-id");
    const body = await request.json();
    const parsed = submitSchema.safeParse(body);

    if (!parsed.success) {
      return response.error(parsed.error.errors[0].message, 400);
    }

    const { assignmentId, violations } = parsed.data;

    // 1. Fetch Assignment & Checklist
    const assignment = await prisma.auditAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        plan: {
          include: {
            form: {
              include: {
                sections: {
                  include: {
                    group: true,
                    items: { include: { criteria: true } }
                  }
                }
              }
            }
          }
        },
        store: true
      }
    });

    if (!assignment) return response.error("Khong tim thay assignment", 404);
    if (!auditorId || assignment.auditorId !== auditorId) {
      return response.forbidden("Ban khong duoc gan cho bai audit nay");
    }
    if (assignment.status === "completed") return response.error("Audit da duoc submit", 400);

    const form = assignment.plan.form;

    const criteriaById = new Map(
      form.sections
        .flatMap((section) => section.items)
        .map((item) => [item.criteriaId, item.criteria])
    );

    for (const violation of violations) {
      if (!criteriaById.has(violation.criteriaId)) {
        return response.error("Tieu chi khong thuoc checklist cua assignment nay", 400);
      }
    }

    const repeatInfo = await calculateRepeatInfo(prisma, assignment.storeId, violations);
    const repeatByCriteriaId = new Map(repeatInfo.map((info) => [info.criteriaId, info]));

    const groupWeights: GroupWeight[] = Array.from(
      new Map(
        form.sections.map((section) => [
          section.groupId,
          {
            groupId: section.groupId,
            groupCode: section.group.code,
            weight: section.group.weight,
          },
        ])
      ).values()
    );

    const scoringItems: CriteriaInput[] = violations.map((violation) => {
      const criteria = criteriaById.get(violation.criteriaId)!;
      return {
        id: violation.criteriaId,
        groupId: criteria.groupId,
        groupCode: groupWeights.find((group) => group.groupId === criteria.groupId)?.groupCode || "",
        maxScore: criteria.maxDeduction,
        maxDeduction: criteria.maxDeduction,
        deductionPerError: criteria.deductionPerError,
        numErrors: violation.numErrors,
        repeatCount: repeatByCriteriaId.get(violation.criteriaId)?.repeatCount || 1,
        flag: criteria.flag as "none" | "critical" | "risk",
      };
    });

    const scoreResult = calculateAuditScore(scoringItems, groupWeights);

    const violationResults = violations.map((violation) => {
      const criteria = criteriaById.get(violation.criteriaId)!;
      const repeat = repeatByCriteriaId.get(violation.criteriaId);

      return {
        criteriaId: violation.criteriaId,
        numErrors: violation.numErrors,
        repeatCount: repeat?.repeatCount || 1,
        note: violation.note,
        isRiskTriggered: criteria.flag === "risk" && violation.numErrors > 0,
        isCriticalTriggered:
          (criteria.flag === "critical" && violation.numErrors > 0) ||
          (repeat?.isCriticalTriggered || false),
        evidence: violation.evidenceUrls,
      };
    });

    const groupScores = Object.values(scoreResult.groups);
    const hasActionPlanFindings = violations.some((violation) => violation.numErrors > 0);

    // 3. Save in Transaction
    const audit = await prisma.$transaction(async (tx) => {
      const existingAudit = await tx.audit.findFirst({
        where: { assignment: { id: assignmentId } },
      });

      if (existingAudit) {
        await tx.violation.deleteMany({ where: { auditId: existingAudit.id } });
        await tx.groupScore.deleteMany({ where: { auditId: existingAudit.id } });
      }

      const auditData = {
        formId: form.id,
        storeId: assignment.storeId,
        auditorId: auditorId!,
        finalScore: scoreResult.finalScore,
        grade: scoreResult.grade,
        isRiskTriggered: scoreResult.isRiskTriggered,
        submittedAt: new Date(),
        groupScores: {
          create: groupScores.map((gs) => ({
            groupId: gs.groupId,
            groupCode: gs.groupCode,
            weight: gs.weight,
            maxScore: gs.maxScore,
            reachedScore: gs.reachedScore,
            percentage: gs.percentage,
            triggeredCritical: gs.triggeredCritical,
          })),
        },
        violations: {
          create: violationResults.map(({ evidence, ...vr }) => ({
            ...vr,
            evidences: {
              create: evidence.map((url: string) => ({ url })),
            },
          })),
        },
      };

      const auditRecord = existingAudit
        ? await tx.audit.update({
            where: { id: existingAudit.id },
            data: auditData,
          })
        : await tx.audit.create({
            data: auditData,
          });

      await tx.auditAssignment.update({
        where: { id: assignmentId },
        data: { 
          status: "completed",
          auditId: auditRecord.id
        }
      });

      if (hasActionPlanFindings) {
        await tx.actionPlan.upsert({
          where: { auditId: auditRecord.id },
          update: {},
          create: {
            auditId: auditRecord.id,
            storeId: assignment.storeId,
            status: "draft",
          },
        });
      }

      return auditRecord;
    });

    return response.created(
      {
        id: audit.id,
        finalScore: audit.finalScore,
        grade: audit.grade,
        isRiskTriggered: audit.isRiskTriggered,
        repeatInfo,
      },
      "Submit audit thanh cong"
    );
  } catch (error) {
    console.error("[POST /api/audits/submit] Error:", error);
    return response.error("Loi server", 500);
  }
}
