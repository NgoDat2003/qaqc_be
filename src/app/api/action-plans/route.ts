import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { isActionPlanStatus } from "@/lib/action-plan-workflow";
import { getReadableStoreIds, getRequestUser } from "@/lib/scope";

export async function GET(request: NextRequest) {
  try {
    const user = getRequestUser(request);
    if (!user) return response.unauthorized();

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("storeId");
    const status = searchParams.get("status");

    const where: any = {};
    if (storeId) where.storeId = storeId;
    if (status) {
      if (!isActionPlanStatus(status)) {
        return response.error("Invalid action plan status", 400);
      }
      where.status = status;
    }

    const readableStoreIds = await getReadableStoreIds(prisma, user.userId, user.roles);
    if (readableStoreIds !== undefined) {
      if (storeId && !readableStoreIds.includes(storeId)) return response.success([]);
      if (!storeId) where.storeId = { in: readableStoreIds };
    }

    const actionPlans = await prisma.actionPlan.findMany({
      where,
      include: {
        store: { select: { id: true, name: true, code: true } },
        audit: { select: { id: true, finalScore: true, grade: true, submittedAt: true } },
        closedBy: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return response.success(actionPlans);
  } catch (error) {
    console.error("GET Action Plans Error:", error);
    return response.error("Internal server error", 500);
  }
}
