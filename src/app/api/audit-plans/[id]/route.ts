import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { auditPlanDetailSelect, mapAuditPlan, QAM_ROLES } from "@/lib/qam";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const forbidden = requireRole(request, [...QAM_ROLES]);
  if (forbidden) return forbidden;

  try {
    const plan = await prisma.auditPlan.findUnique({
      where: { id: params.id },
      select: auditPlanDetailSelect,
    });

    if (!plan) {
      return response.error("Audit plan not found", 404);
    }

    return response.success(mapAuditPlan(plan));
  } catch (error) {
    console.error("Get audit plan detail error:", error);
    return response.error("Internal server error", 500);
  }
}
