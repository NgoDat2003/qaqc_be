import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { canReviewActionPlan } from "@/lib/action-plan-workflow";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const forbidden = requireRole(request, ["qa_manager"]);
    if (forbidden) return forbidden;

    const { id } = params;

    const actionPlan = await prisma.actionPlan.findUnique({ where: { id } });
    if (!actionPlan) return response.error("Action Plan not found", 404);

    if (!canReviewActionPlan(actionPlan.status)) {
      return response.error("Can only close action plan in submitted status", 400);
    }

    const reviewerId = request.headers.get("x-user-id") || undefined;
    const updated = await prisma.actionPlan.update({
      where: { id },
      data: { status: "closed", closedById: reviewerId, closedAt: new Date() },
      select: {
        id: true,
        status: true,
        remediation: true,
        deadline: true,
        closedAt: true,
        store: { select: { id: true, code: true, name: true } },
        closedBy: { select: { id: true, fullName: true, email: true } },
      },
    });

    return response.success(updated);
  } catch (error) {
    console.error("POST Close Action Plan Error:", error);
    return response.error("Internal server error", 500);
  }
}
