import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { auditPlanDetailSelect, mapAuditPlan, QAM_ROLES } from "@/lib/qam";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const forbidden = requireRole(request, [...QAM_ROLES]);
  if (forbidden) return forbidden;

  try {
    const existing = await prisma.auditPlan.findUnique({
      where: { id: params.id },
      select: { id: true, status: true },
    });

    if (!existing) {
      return response.error("Audit plan not found", 404);
    }

    if (existing.status === "closed") {
      return response.error("Audit plan is already closed", 400);
    }

    const plan = await prisma.auditPlan.update({
      where: { id: params.id },
      data: { status: "closed" },
      select: auditPlanDetailSelect,
    });

    return response.success(mapAuditPlan(plan), "Audit plan closed successfully");
  } catch (error) {
    console.error("Close audit plan error:", error);
    return response.error("Internal server error", 500);
  }
}
