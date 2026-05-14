import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import {
  canReviewActionPlan,
  getReviewedActionPlanStatus,
  isActionPlanClosedByReview,
} from "@/lib/action-plan-workflow";
import { z } from "zod";

const confirmSchema = z.object({
  reviewNote: z.string().optional(),
  action: z.enum(["confirm", "reject"]),
});

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const forbidden = requireRole(request, ["qa_manager"]);
    if (forbidden) return forbidden;

    const { id } = params;

    const actionPlan = await prisma.actionPlan.findUnique({ where: { id } });
    if (!actionPlan) return response.error("Action Plan not found", 404);

    if (!canReviewActionPlan(actionPlan.status)) {
      return response.error("Can only review action plan in submitted status", 400);
    }

    const body = await request.json();
    const parsed = confirmSchema.safeParse(body);

    if (!parsed.success) {
      return response.error(parsed.error.errors[0].message, 400);
    }

    const reviewerId = request.headers.get("x-user-id") || undefined;
    const newStatus = getReviewedActionPlanStatus(parsed.data.action);
    const shouldClose = isActionPlanClosedByReview(parsed.data.action);

    const updated = await prisma.actionPlan.update({
      where: { id },
      data: {
        status: newStatus,
        closedById: shouldClose ? reviewerId : null,
        closedAt: shouldClose ? new Date() : null,
      },
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
    console.error("POST Confirm Action Plan Error:", error);
    return response.error("Internal server error", 500);
  }
}
