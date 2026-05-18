import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import {
  auditPlanDetailSelect,
  isValidAuditWindow,
  mapAuditPlan,
  QAM_ROLES,
} from "@/lib/qam";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const forbidden = requireRole(request, [...QAM_ROLES]);
  if (forbidden) return forbidden;

  try {
    const existing = await prisma.auditPlan.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        status: true,
        startDate: true,
        endDate: true,
        form: {
          select: {
            status: true,
          },
        },
        assignments: {
          select: {
            id: true,
            store: {
              select: {
                isActive: true,
              },
            },
            auditor: {
              select: {
                isActive: true,
                roleAssignments: {
                  select: {
                    roleKey: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!existing) {
      return response.error("Audit plan not found", 404);
    }

    if (existing.status !== "draft") {
      return response.error("Only draft audit plan can be published", 400);
    }

    if (existing.form.status !== "published") {
      return response.error("Audit plan requires a published checklist", 400);
    }

    if (!isValidAuditWindow(existing.startDate, existing.endDate)) {
      return response.error("startDate must be before or equal to endDate", 400);
    }

    if (existing.assignments.length === 0) {
      return response.error("Audit plan requires at least one assignment", 400);
    }

    const hasInactiveStore = existing.assignments.some(
      (assignment) => !assignment.store.isActive
    );
    if (hasInactiveStore) {
      return response.error("All stores must exist and be active", 400);
    }

    const hasInvalidAuditor = existing.assignments.some(
      (assignment) =>
        !assignment.auditor.isActive ||
        !assignment.auditor.roleAssignments.some(
          (roleAssignment) => roleAssignment.roleKey === "qc_auditor"
        )
    );
    if (hasInvalidAuditor) {
      return response.error("All auditors must be active QC users", 400);
    }

    const plan = await prisma.auditPlan.update({
      where: { id: params.id },
      data: { status: "open" },
      select: auditPlanDetailSelect,
    });

    return response.success(mapAuditPlan(plan), "Audit plan published successfully");
  } catch (error) {
    console.error("Publish audit plan error:", error);
    return response.error("Internal server error", 500);
  }
}
