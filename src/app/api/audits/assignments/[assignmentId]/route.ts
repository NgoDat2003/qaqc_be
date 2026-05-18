import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import {
  auditAssignmentSessionSelect,
  mapAuditSession,
  QC_ROLES,
} from "@/lib/audit";

export async function GET(
  request: NextRequest,
  { params }: { params: { assignmentId: string } }
) {
  const forbidden = requireRole(request, [...QC_ROLES]);
  if (forbidden) return forbidden;

  const userId = request.headers.get("x-user-id");
  if (!userId) return response.unauthorized();

  try {
    const assignment = await prisma.auditAssignment.findUnique({
      where: { id: params.assignmentId },
      select: auditAssignmentSessionSelect,
    });

    if (!assignment) {
      return response.error("Audit assignment not found", 404);
    }

    if (assignment.auditorId !== userId) {
      return response.forbidden("Assignment does not belong to current auditor");
    }

    return response.success(mapAuditSession(assignment));
  } catch (error) {
    console.error("Get audit session error:", error);
    return response.error("Internal server error", 500);
  }
}
