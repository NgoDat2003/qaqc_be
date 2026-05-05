import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
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
 * Save progress of an audit without finalizing score or grade.
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
      include: { plan: true }
    });

    if (!assignment) return response.error("Assignment not found", 404);
    if (assignment.status === "completed") return response.error("Audit already submitted", 400);

    // 2. Save Draft in Transaction
    const audit = await prisma.$transaction(async (tx) => {
      // Find existing audit for this assignment
      let auditRecord = await tx.audit.findFirst({
        where: { assignment: { id: assignmentId } }
      });

      if (auditRecord) {
        // Clear old draft data
        await tx.violation.deleteMany({ where: { auditId: auditRecord.id } });
        await tx.groupScore.deleteMany({ where: { auditId: auditRecord.id } });

        // Update basic info
        auditRecord = await tx.audit.update({
          where: { id: auditRecord.id },
          data: {
            updatedAt: new Date(),
            submittedAt: null, // Ensure it's still a draft
          }
        });
      } else {
        // Create new audit record in draft state
        auditRecord = await tx.audit.create({
          data: {
            formId: assignment.plan.formId,
            storeId: assignment.storeId,
            auditorId: auditorId!,
            submittedAt: null, // Mark as draft
          }
        });

        // Link to assignment
        await tx.auditAssignment.update({
          where: { id: assignmentId },
          data: { 
            status: "in_progress",
            auditId: auditRecord.id
          }
        });
      }

      // Create violations for the draft
      await tx.violation.createMany({
        data: violations.map(v => ({
          auditId: auditRecord!.id,
          criteriaId: v.criteriaId,
          numErrors: v.numErrors,
          note: v.note,
        }))
      });

      // Note: We don't save evidence here to keep draft save lightweight. 
      // Evidence is usually uploaded separately via /upload/evidence.

      return auditRecord;
    });

    return response.success(audit, "Draft saved successfully");
  } catch (error) {
    console.error("[PATCH /api/audits/draft] Error:", error);
    return response.error("Internal server error", 500);
  }
}
