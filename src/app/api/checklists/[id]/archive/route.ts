import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const forbidden = requireRole(request, ["qa_manager", "company_admin"]);
    if (forbidden) return forbidden;

    const { id } = params;

    const checklist = await prisma.checklistForm.findUnique({
      where: { id },
    });

    if (!checklist) return response.error("Checklist not found", 404);
    if (checklist.status === "archived") return response.error("Checklist is already archived", 400);

    // Check if there are ongoing audits using this checklist.
    // Allow archiving if no audits OR all audits using this form are completed/submitted?
    // Instruction: archive (chỉ nếu không có audit đang dùng)
    // Means no open AuditPlan with this form, or no pending assignments.
    const openPlans = await prisma.auditPlan.count({
      where: {
        formId: id,
        status: "open",
      },
    });

    if (openPlans > 0) {
      return response.error("Cannot archive checklist: it is currently used in an open Audit Plan", 400);
    }

    const updated = await prisma.checklistForm.update({
      where: { id },
      data: { status: "archived" },
    });

    return response.success(updated);
  } catch (error) {
    console.error("PATCH Archive Checklist Error:", error);
    return response.error("Internal server error", 500);
  }
}
