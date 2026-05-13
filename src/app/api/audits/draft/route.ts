import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { calculateRepeatInfo } from "@/lib/audit-repeat";
import { z } from "zod";

const draftSchema = z.object({
  assignmentId: z.string(),
  violations: z.array(z.object({
    criteriaId: z.string(),
    numErrors: z.number().int().min(0),
    note: z.string().optional().nullable(),
    evidenceUrls: z.array(z.string()).optional().default([]),
  })),
});

/**
 * PATCH /api/audits/draft
 * Luu tien do audit dang lam, chua chot diem cuoi.
 */
export async function PATCH(request: NextRequest) {
  try {
    const forbidden = requireRole(request, ["qc_auditor"]);
    if (forbidden) return forbidden;

    const auditorId = request.headers.get("x-user-id");
    const body = await request.json();
    const parsed = draftSchema.safeParse(body);

    if (!parsed.success) {
      return response.error(parsed.error.errors[0].message, 400);
    }

    const { assignmentId, violations } = parsed.data;

    // 1. Fetch Assignment
    const assignment = await prisma.auditAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        plan: {
          include: {
            form: {
              include: {
                sections: {
                  include: {
                    items: { include: { criteria: true } }
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!assignment) return response.error("Khong tim thay assignment", 404);
    if (!auditorId || assignment.auditorId !== auditorId) {
      return response.forbidden("Ban khong duoc gan cho bai audit nay");
    }
    if (assignment.status === "completed") return response.error("Audit da duoc submit", 400);

    const criteriaById = new Map(
      assignment.plan.form.sections
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

    // 2. Save Draft in Transaction
    const audit = await prisma.$transaction(async (tx) => {
      // Tim audit draft hien co cua assignment.
      let auditRecord = await tx.audit.findFirst({
        where: { assignment: { id: assignmentId } }
      });

      if (auditRecord) {
        // Xoa du lieu draft cu.
        await tx.violation.deleteMany({ where: { auditId: auditRecord.id } });
        await tx.groupScore.deleteMany({ where: { auditId: auditRecord.id } });

        // Cap nhat thong tin co ban.
        auditRecord = await tx.audit.update({
          where: { id: auditRecord.id },
          data: {
            updatedAt: new Date(),
            submittedAt: null, // Dam bao van la draft.
          }
        });
      } else {
        // Tao audit draft moi.
        auditRecord = await tx.audit.create({
          data: {
            formId: assignment.plan.formId,
            storeId: assignment.storeId,
            auditorId: auditorId!,
            submittedAt: null, // Danh dau la draft.
          }
        });

        // Gan audit vao assignment.
        await tx.auditAssignment.update({
          where: { id: assignmentId },
          data: { 
            status: "in_progress",
            auditId: auditRecord.id
          }
        });
      }

      // Tao violations cho draft.
      await tx.violation.createMany({
        data: violations.map(v => ({
          auditId: auditRecord!.id,
          criteriaId: v.criteriaId,
          numErrors: v.numErrors,
          repeatCount: repeatByCriteriaId.get(v.criteriaId)?.repeatCount || 1,
          isCriticalTriggered:
            (criteriaById.get(v.criteriaId)?.flag === "critical" && v.numErrors > 0) ||
            (repeatByCriteriaId.get(v.criteriaId)?.isCriticalTriggered || false),
          isRiskTriggered: criteriaById.get(v.criteriaId)?.flag === "risk" && v.numErrors > 0,
          note: v.note,
        }))
      });

      // Khong luu evidence o draft de giu thao tac nhe.
      // Evidence thuong duoc upload rieng qua /upload/evidence.

      return auditRecord;
    });

    return response.success({ ...audit, repeatInfo }, "Da luu draft thanh cong");
  } catch (error) {
    console.error("[PATCH /api/audits/draft] Error:", error);
    return response.error("Loi server", 500);
  }
}
