import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { getRoles, requireRole } from "@/lib/rbac";
import { canEditActionPlan } from "@/lib/action-plan-workflow";
import {
  canAccessActionPlanRecord,
  getAssignedStoreIds,
  getRequestUser,
} from "@/lib/scope";
import { z } from "zod";

const updateActionPlanSchema = z.object({
  actionDescription: z.string().min(1, "Description is required"),
  deadline: z.string().datetime("Invalid deadline format"),
});

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = getRequestUser(request);
    if (!user) return response.unauthorized();

    const { id } = params;

    const actionPlan = await prisma.actionPlan.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        remediation: true,
        deadline: true,
        createdAt: true,
        updatedAt: true,
        closedAt: true,
        storeId: true,
        store: {
          select: { id: true, code: true, name: true },
        },
        audit: {
          select: {
            id: true,
            finalScore: true,
            grade: true,
            submittedAt: true,
            violations: {
              select: {
                id: true,
                criteriaId: true,
                numErrors: true,
                repeatCount: true,
                isCriticalTriggered: true,
                isRiskTriggered: true,
                note: true,
                criteria: {
                  select: { id: true, code: true, content: true, flag: true },
                },
              },
            },
          },
        },
        closedBy: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    if (!actionPlan) return response.error("Action Plan not found", 404);

    const hasAccess = await canAccessActionPlanRecord(prisma, user.userId, user.roles, actionPlan);
    if (!hasAccess) {
      return response.error("Unauthorized access to this action plan", 403);
    }

    return response.success(actionPlan);
  } catch (error) {
    console.error("GET Action Plan Detail Error:", error);
    return response.error("Internal server error", 500);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const forbidden = requireRole(request, ["store_manager"]);
    if (forbidden) return forbidden;

    const { id } = params;
    
    const actionPlan = await prisma.actionPlan.findUnique({ where: { id } });
    if (!actionPlan) return response.error("Action Plan not found", 404);

    if (!canEditActionPlan(actionPlan.status)) {
      return response.error("Can only update action plan in draft or rejected status", 400);
    }

    const roles = getRoles(request);
    const userId = request.headers.get("x-user-id");
    if (!roles.includes("store_manager") || !userId) return response.forbidden();

    const validStoreIds = await getAssignedStoreIds(prisma, userId, "store_manager");
    if (!validStoreIds.includes(actionPlan.storeId)) {
      return response.error("Unauthorized to update this store's action plan", 403);
    }

    const body = await request.json();
    const parsed = updateActionPlanSchema.safeParse(body);

    if (!parsed.success) {
      return response.error(parsed.error.errors[0].message, 400);
    }

    const updated = await prisma.actionPlan.update({
      where: { id },
      data: {
        remediation: parsed.data.actionDescription,
        deadline: new Date(parsed.data.deadline),
      },
      select: {
        id: true,
        status: true,
        remediation: true,
        deadline: true,
        updatedAt: true,
        store: { select: { id: true, code: true, name: true } },
      },
    });

    return response.success(updated);
  } catch (error) {
    console.error("PATCH Action Plan Error:", error);
    return response.error("Internal server error", 500);
  }
}
