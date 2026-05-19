import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import {
  getQamUserIds,
  getRequestUser,
  notifyUsers,
  userCanManageStore,
} from "@/lib/audit-workflow";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const forbidden = requireRole(request, ["store_manager"]);
    if (forbidden) return forbidden;

    const { userId, roles } = getRequestUser(request);
    if (!userId) return response.unauthorized();

    const actionPlan = await (prisma as any).actionPlan.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        storeId: true,
        status: true,
        items: {
          select: {
            id: true,
            rootCause: true,
            remediation: true,
            fixedAt: true,
            assigneeName: true,
            evidences: { select: { id: true } },
            violation: {
              select: {
                isCriticalTriggered: true,
                isRiskTriggered: true,
                criteria: { select: { flag: true } },
              },
            },
          },
        },
      },
    });

    if (!actionPlan) return response.error("Action plan not found", 404);

    const allowed = await userCanManageStore(actionPlan.storeId, userId, roles);
    if (!allowed) return response.forbidden();

    if (!["draft", "rejected"].includes(actionPlan.status)) {
      return response.error("Only draft or rejected action plan can be submitted", 400);
    }

    const missingRequired = actionPlan.items.find(
      (item: any) =>
        !item.rootCause?.trim() ||
        !item.remediation?.trim() ||
        !item.fixedAt ||
        !item.assigneeName?.trim()
    );
    if (missingRequired) {
      return response.error(
        "All action plan items must have rootCause, remediation, fixedAt and assigneeName",
        400
      );
    }

    const missingCriticalEvidence = actionPlan.items.find((item: any) => {
      const needsEvidence =
        item.violation.criteria.flag === "critical" ||
        item.violation.criteria.flag === "risk" ||
        item.violation.isCriticalTriggered ||
        item.violation.isRiskTriggered;
      return needsEvidence && item.evidences.length === 0;
    });
    if (missingCriticalEvidence) {
      return response.error("Critical/risk action plan items require evidence images", 400);
    }

    const updated = await (prisma as any).actionPlan.update({
      where: { id: actionPlan.id },
      data: {
        status: "submitted",
        reviewedById: null,
        reviewedAt: null,
        reviewNote: null,
      },
      select: { id: true, status: true },
    });

    await notifyUsers({
      userIds: await getQamUserIds(),
      title: "Action Plan cho QA review",
      message: "Store Manager da gui Action Plan cho QA review.",
      type: "info",
      link: `/action-plans/${actionPlan.id}`,
    });

    return response.success(updated, "Action plan submitted");
  } catch (error) {
    console.error("Submit action plan error:", error);
    return response.error("Internal server error", 500);
  }
}
