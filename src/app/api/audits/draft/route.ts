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
  getAuditableAssignmentError,
  getChecklistCriteria,
  mapAuditSession,
  QC_ROLES,
} from "@/lib/audit";

export async function PATCH(request: NextRequest) {
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

    const allowedCriteriaIds = new Set(
      getChecklistCriteria(assignment).map((item: any) => item.criteriaId)
    );
    if (
      parsed.data.violations.some(
        (violation) => !allowedCriteriaIds.has(violation.criteriaId)
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

    const savedAssignment = await prisma.$transaction(async (tx) => {
      let auditId = assignment.auditId;

      if (!auditId) {
        const audit = await tx.audit.create({
          data: {
            formId: assignment.plan.formId,
            storeId: assignment.storeId,
            auditorId: assignment.auditorId,
          },
          select: { id: true },
        });
        auditId = audit.id;

        const claimed = await tx.auditAssignment.updateMany({
          where: {
            id: assignment.id,
            auditorId: userId,
            auditId: null,
            status: "pending",
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

      await tx.violation.deleteMany({
        where: { auditId },
      });

      for (const violation of parsed.data.violations) {
        const created = await tx.violation.create({
          data: {
            auditId,
            criteriaId: violation.criteriaId,
            numErrors: violation.numErrors,
            repeatCount: 0,
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

      return tx.auditAssignment.findUniqueOrThrow({
        where: { id: assignment.id },
        select: auditAssignmentSessionSelect,
      });
    });

    return response.success(
      mapAuditSession(savedAssignment),
      "Audit draft saved successfully"
    );
  } catch (error) {
    if (error instanceof AuditAssignmentConflictError) {
      return response.error(error.message, 409);
    }

    console.error("Save audit draft error:", error);
    return response.error("Internal server error", 500);
  }
}
