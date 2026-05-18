import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { isAuditWindowOpen, myAssignmentSelect } from "@/lib/qam";

export async function GET(request: NextRequest) {
  const forbidden = requireRole(request, ["qc_auditor"]);
  if (forbidden) return forbidden;

  const userId = request.headers.get("x-user-id");
  if (!userId) {
    return response.unauthorized();
  }

  try {
    const assignments = await prisma.auditAssignment.findMany({
      where: {
        auditorId: userId,
        plan: {
          status: "open",
        },
      },
      select: myAssignmentSelect,
      orderBy: { createdAt: "asc" },
    });

    return response.success(
      assignments.map((assignment) => ({
        id: assignment.id,
        status: assignment.status,
        store: assignment.store,
        plan: {
          id: assignment.plan.id,
          name: assignment.plan.name,
          status: assignment.plan.status,
          startDate: assignment.plan.startDate,
          endDate: assignment.plan.endDate,
          isAuditWindowOpen: isAuditWindowOpen(assignment.plan),
        },
        checklist: assignment.plan.form,
        auditId: assignment.auditId,
      }))
    );
  } catch (error) {
    console.error("Get my assignments error:", error);
    return response.error("Internal server error", 500);
  }
}
