import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
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
 * Scoring logic: Start at 100% for each group, subtract deductions per violation.
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

    if (!assignment) return response.error("Assignment not found", 404);
    if (assignment.status === "completed") return response.error("Audit already submitted", 400);

    const form = assignment.plan.form;
    
    // 2. Scoring Calculation
    // Group criteria by GroupId
    const groupData: Record<string, { weight: number, code: string, deductions: number }> = {};
    
    // Initialize groups from sections
    form.sections.forEach(s => {
      if (!groupData[s.groupId]) {
        groupData[s.groupId] = { 
          weight: s.group.weight, 
          code: s.group.code, 
          deductions: 0 
        };
      }
    });

    const violationResults: any[] = [];
    let isRiskTriggered = false;

    // Process violations
    for (const v of violations) {
      const criteria = await prisma.criteria.findUnique({ where: { id: v.criteriaId } });
      if (!criteria) continue;

      const deduction = Math.min(v.numErrors * criteria.deductionPerError, criteria.maxDeduction);
      groupData[criteria.groupId].deductions += deduction;

      if (criteria.flag === "risk" && v.numErrors > 0) isRiskTriggered = true;

      violationResults.push({
        criteriaId: v.criteriaId,
        numErrors: v.numErrors,
        note: v.note,
        isRiskTriggered: criteria.flag === "risk" && v.numErrors > 0,
        isCriticalTriggered: criteria.flag === "critical" && v.numErrors > 0,
        evidence: v.evidenceUrls
      });
    }

    // Calculate final scores per group and total
    let finalScore = 0;
    const groupScores: any[] = [];

    for (const [groupId, data] of Object.entries(groupData)) {
      const reachedScore = Math.max(0, 100 - data.deductions);
      const weightedScore = reachedScore * data.weight;
      finalScore += weightedScore;

      groupScores.push({
        groupId,
        groupCode: data.code,
        weight: data.weight,
        maxScore: 100,
        reachedScore,
        percentage: reachedScore
      });
    }

    // Determine grade
    let grade = "fail";
    if (finalScore >= 95) grade = "excellent";
    else if (finalScore >= 85) grade = "good";
    else if (finalScore >= 75) grade = "pass";
    
    if (isRiskTriggered) grade = "alarm";

    // 3. Save in Transaction
    const audit = await prisma.$transaction(async (tx) => {
      const auditRecord = await tx.audit.create({
        data: {
          formId: form.id,
          storeId: assignment.storeId,
          auditorId: auditorId!,
          finalScore: parseFloat(finalScore.toFixed(2)),
          grade,
          isRiskTriggered,
          submittedAt: new Date(),
          groupScores: {
            create: groupScores.map(({groupId, ...gs}) => ({ ...gs, groupId }))
          },
          violations: {
            create: violationResults.map(({evidence, ...vr}) => ({
              ...vr,
              evidences: {
                create: evidence.map((url: string) => ({ url }))
              }
            }))
          }
        }
      });

      await tx.auditAssignment.update({
        where: { id: assignmentId },
        data: { 
          status: "completed",
          auditId: auditRecord.id
        }
      });

      return auditRecord;
    });

    return response.created(audit, "Audit submitted successfully");
  } catch (error) {
    console.error("[POST /api/audits/submit] Error:", error);
    return response.error("Internal server error", 500);
  }
}
