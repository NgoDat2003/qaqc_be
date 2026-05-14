import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import {
  canReadOwnAudits,
  getReadableStoreIds,
  getRequestUser,
} from "@/lib/scope";

export async function GET(request: NextRequest) {
  try {
    const user = getRequestUser(request);
    if (!user) return response.unauthorized();

    const { searchParams } = new URL(request.url);
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
          if (storeId && !readableStoreIds.includes(storeId)) return response.success([]);
          if (!storeId) where.storeId = { in: readableStoreIds };
        }
      } else if (canReadOwnAudits(user.roles)) {
        where.auditorId = user.userId;
      } else {
        return response.success([]);
      }
    }

    const audits = await prisma.audit.findMany({
      where,
      include: {
        store: { select: { id: true, name: true, code: true } },
        assignment: { select: { plan: { select: { name: true } } } },
      },
      orderBy: { submittedAt: "desc" },
    });

    return response.success(audits);
  } catch (error) {
    console.error("GET Audits List Error:", error);
    return response.error("Internal server error", 500);
  }
}
