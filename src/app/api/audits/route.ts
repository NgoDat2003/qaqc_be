import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import {
  canReadOwnAudits,
  getReadableStoreIds,
  getRequestUser,
} from "@/lib/scope";
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

    const where: any = {};
    if (storeId) where.storeId = storeId;

    const readableStoreIds = await getReadableStoreIds(prisma, user.userId, user.roles);

    if (readableStoreIds !== undefined) {
      if (readableStoreIds.length > 0) {
        if (canReadOwnAudits(user.roles)) {
          if (storeId) {
            const scopedStoreFilter = readableStoreIds.includes(storeId) ? [{ storeId }] : [];
            where.OR = [...scopedStoreFilter, { auditorId: user.userId, storeId }];
            delete where.storeId;
          } else {
            where.OR = [
              { storeId: { in: readableStoreIds } },
              { auditorId: user.userId },
            ];
          }
        } else {
          if (storeId && !readableStoreIds.includes(storeId)) {
            return response.success([], undefined, getPaginationMeta(pagination, 0));
          }
          if (!storeId) where.storeId = { in: readableStoreIds };
        }
      } else if (canReadOwnAudits(user.roles)) {
        where.auditorId = user.userId;
      } else {
        return response.success([], undefined, getPaginationMeta(pagination, 0));
      }
    }

    let countDuration = 0;
    let rowsDuration = 0;
    const dbStartedAt = performance.now();
    const countStartedAt = performance.now();
    const totalPromise = prisma.audit.count({ where }).finally(() => {
      countDuration = performance.now() - countStartedAt;
    });
    const rowsStartedAt = performance.now();
    const auditsPromise = prisma.audit.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        select: {
          id: true,
          finalScore: true,
          grade: true,
          isRiskTriggered: true,
          submittedAt: true,
          createdAt: true,
          store: { select: { id: true, name: true, code: true } },
        },
        orderBy: { submittedAt: "desc" },
      }).finally(() => {
      rowsDuration = performance.now() - rowsStartedAt;
    });
    const [total, audits] = await Promise.all([totalPromise, auditsPromise]);
    const dbDuration = performance.now() - dbStartedAt;

    return withServerTiming(
      response.success(audits, undefined, getPaginationMeta(pagination, total)),
      [
        { name: "count", durationMs: countDuration, description: "Prisma count query" },
        { name: "rows", durationMs: rowsDuration, description: "Prisma rows query" },
        { name: "db", durationMs: dbDuration, description: "Prisma list queries" },
        { name: "total", durationMs: performance.now() - startedAt, description: "Route handler" },
      ]
    );
  } catch (error) {
    console.error("GET Audits List Error:", error);
    return response.error("Internal server error", 500);
  }
}
