import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import {
  AUDIT_READ_ROLES,
  auditDetailDto,
  getRequestUser,
  userCanAccessAudit,
} from "@/lib/audit-workflow";
import { buildAuditScoreBreakdown } from "@/lib/audit-score-breakdown";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const forbidden = requireRole(request, [...AUDIT_READ_ROLES]);
  if (forbidden) return forbidden;

  const { userId, roles } = getRequestUser(request);
  if (!userId) return response.unauthorized();

  try {
    const audit = await (prisma as any).audit.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        storeId: true,
        auditorId: true,
        finalScore: true,
        grade: true,
        isRiskTriggered: true,
        submittedAt: true,
        editedAt: true,
        editNote: true,
        store: { select: { id: true, code: true, name: true } },
        form: {
          select: {
            id: true,
            name: true,
            version: true,
            status: true,
            sections: {
              orderBy: { order: "asc" },
              select: {
                id: true,
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
                    criteria: {
                      select: {
                        id: true,
                        code: true,
                        content: true,
                        flag: true,
                        groupId: true,
                        deductionPerError: true,
                        maxDeduction: true,
                        group: {
                          select: { id: true, code: true, name: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        groupScores: {
          select: {
            id: true,
            groupId: true,
            groupCode: true,
            weight: true,
            maxScore: true,
            reachedScore: true,
            percentage: true,
            triggeredCritical: true,
          },
          orderBy: { groupCode: "asc" },
        },
        violations: {
          select: {
            id: true,
            numErrors: true,
            repeatCount: true,
            isCriticalTriggered: true,
            isRiskTriggered: true,
            note: true,
            criteria: {
              select: {
                id: true,
                code: true,
                content: true,
                flag: true,
                groupId: true,
                deductionPerError: true,
                maxDeduction: true,
                group: { select: { id: true, code: true, name: true } },
              },
            },
            evidences: {
              select: { id: true, url: true, fileName: true, mimeType: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        actionPlan: { select: { id: true, status: true } },
        correctionRequests: {
          select: {
            id: true,
            auditId: true,
            storeId: true,
            reason: true,
            status: true,
            reviewNote: true,
            reviewedAt: true,
            createdAt: true,
            requestedBy: { select: { id: true, fullName: true, email: true } },
            reviewedBy: { select: { id: true, fullName: true, email: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!audit || !audit.submittedAt) {
      return response.error("Audit result not found", 404);
    }

    if (!(await userCanAccessAudit(audit, userId, roles))) {
      return response.forbidden();
    }

    const auditor = await prisma.user.findUnique({
      where: { id: audit.auditorId },
      select: { id: true, fullName: true, email: true },
    });

    const scoreBreakdown = buildAuditScoreBreakdown(audit);

    return response.success(auditDetailDto(audit, auditor, scoreBreakdown));
  } catch (error) {
    console.error("Get audit detail error:", error);
    return response.error("Internal server error", 500);
  }
}
