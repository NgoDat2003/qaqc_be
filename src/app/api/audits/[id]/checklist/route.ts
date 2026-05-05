import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const forbidden = requireRole(request, ["company_admin", "qa_manager", "qc_auditor"]);
    if (forbidden) return forbidden;

    const assignmentId = params.id;

    const assignment = await prisma.auditAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        plan: {
          select: { formId: true },
        },
      },
    });

    if (!assignment) return response.error("Assignment not found", 404);

    const checklist = await prisma.checklistForm.findUnique({
      where: { id: assignment.plan.formId },
      include: {
        sections: {
          include: {
            group: true,
            items: {
              include: {
                criteria: true,
              },
              orderBy: { order: "asc" },
            },
          },
          orderBy: { order: "asc" },
        },
      },
    });

    if (!checklist) return response.error("Checklist not found", 404);

    return response.success(checklist);
  } catch (error) {
    console.error("GET Audit Checklist Error:", error);
    return response.error("Internal server error", 500);
  }
}
