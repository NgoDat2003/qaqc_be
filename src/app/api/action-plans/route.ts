import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { isActionPlanStatus } from "@/lib/action-plan-workflow";
import { getReadableStoreIds, getRequestUser } from "@/lib/scope";
import { getPaginationMeta, getPaginationParams } from "@/lib/pagination";
import { withServerTiming } from "@/lib/server-timing";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const startedAt = performance.now();

  try {
    const user = getRequestUser(request);
    if (!user) return response.unauthorized();

    const { searchParams } = new URL(request.url);
    const pagination = getPaginationParams(searchParams);
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
      if (storeId && !readableStoreIds.includes(storeId)) {
        return response.success([], undefined, getPaginationMeta(pagination, 0));
      }
      if (!storeId) where.storeId = { in: readableStoreIds };
    }

    let countDuration = 0;
    let rowsDuration = 0;
    const dbStartedAt = performance.now();
    const countStartedAt = performance.now();
    const totalPromise = prisma.actionPlan.count({ where }).finally(() => {
      countDuration = performance.now() - countStartedAt;
    });
    const rowsStartedAt = performance.now();
    const actionPlansPromise = prisma.actionPlan.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        select: {
          id: true,
          status: true,
          deadline: true,
          createdAt: true,
          updatedAt: true,
          store: { select: { id: true, name: true, code: true } },
          audit: { select: { id: true, finalScore: true, grade: true, submittedAt: true } },
        },
        orderBy: { createdAt: "desc" },
      }).finally(() => {
      rowsDuration = performance.now() - rowsStartedAt;
    });
    const [total, actionPlans] = await Promise.all([totalPromise, actionPlansPromise]);
    const dbDuration = performance.now() - dbStartedAt;

    return withServerTiming(
      response.success(actionPlans, undefined, getPaginationMeta(pagination, total)),
      [
        { name: "count", durationMs: countDuration, description: "Prisma count query" },
        { name: "rows", durationMs: rowsDuration, description: "Prisma rows query" },
        { name: "db", durationMs: dbDuration, description: "Prisma list queries" },
        { name: "total", durationMs: performance.now() - startedAt, description: "Route handler" },
      ]
    );
  } catch (error) {
    console.error("GET Action Plans Error:", error);
    return response.error("Internal server error", 500);
  }
}
