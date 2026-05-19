import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import {
  getRequestUser,
  getStoreManagerUserIds,
  notifyUsers,
} from "@/lib/audit-workflow";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const forbidden = requireRole(request, ["qa_manager"]);
    if (forbidden) return forbidden;

    const { userId } = getRequestUser(request);
    if (!userId) return response.unauthorized();

    const current = await prisma.actionPlan.findUnique({
      where: { id: params.id },
      select: { id: true, status: true, storeId: true },
    });

    if (!current) return response.error("Action plan not found", 404);
    if (current.status !== "submitted") {
      return response.error("Only submitted action plan can be closed", 400);
    }

    const updated = await (prisma as any).actionPlan.update({
      where: { id: current.id },
      data: {
        status: "closed",
        reviewedById: userId,
        reviewedAt: new Date(),
        closedById: userId,
        closedAt: new Date(),
      },
      select: { id: true, status: true, closedAt: true },
    });

    await notifyUsers({
      userIds: await getStoreManagerUserIds(current.storeId),
      title: "Action Plan da dong",
      message: "QA da duyet va dong Action Plan.",
      type: "info",
      link: `/action-plans/${current.id}`,
    });

    return response.success(updated, "Action plan closed");
  } catch (error) {
    console.error("Close action plan error:", error);
    return response.error("Internal server error", 500);
  }
}
