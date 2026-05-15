import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { canReadAllQaData, getReadableStoreIds, getRequestUser } from "@/lib/scope";
import { withServerTiming } from "@/lib/server-timing";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const startedAt = performance.now();

  try {
    const user = getRequestUser(request);
    if (!user) return response.unauthorized();

    if (user.roles.includes("qc_auditor") && !canReadAllQaData(user.roles)) {
      return response.forbidden("QC auditors do not have analytics overview access");
    }

    const storeIds = await getReadableStoreIds(prisma, user.userId, user.roles);
    const storeFilter = storeIds ? { storeId: { in: storeIds } } : {};

    // Get date range for current month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const auditWhere = {
      ...storeFilter,
      submittedAt: { gte: startOfMonth, lte: endOfMonth },
    };
    const assignmentWhere = {
      ...storeFilter,
      scheduledDate: { gte: startOfMonth, lte: endOfMonth },
    };

    const dbStartedAt = performance.now();
    const [
      openAuditPlansCount,
      pendingActionPlans,
      overdueActionPlans,
      totalAssignments,
      completedAssignments,
      scoreAggregate,
      gradeGroups,
      recentAudits,
      storeScoreGroups,
    ] = await Promise.all([
      prisma.auditPlan.count({
        where: {
          status: "open",
          ...(storeIds ? {
            assignments: { some: { storeId: { in: storeIds } } }
          } : {})
        }
      }),
      prisma.actionPlan.count({
        where: {
          ...storeFilter,
          status: { in: ["draft", "submitted", "rejected"] },
        },
      }),
      prisma.actionPlan.count({
        where: {
          ...storeFilter,
          deadline: { lt: now },
          status: { not: "closed" },
        },
      }),
      prisma.auditAssignment.count({ where: assignmentWhere }),
      prisma.auditAssignment.count({
        where: {
          ...assignmentWhere,
          status: "completed",
        },
      }),
      prisma.audit.aggregate({
        where: auditWhere,
        _avg: { finalScore: true },
      }),
      prisma.audit.groupBy({
        by: ["grade"],
        where: auditWhere,
        _count: { _all: true },
      }),
      prisma.audit.findMany({
        where: auditWhere,
        select: {
          id: true,
          finalScore: true,
          grade: true,
          submittedAt: true,
          store: { select: { id: true, name: true } },
        },
        orderBy: { submittedAt: "desc" },
        take: 5,
      }),
      prisma.audit.groupBy({
        by: ["storeId"],
        where: auditWhere,
        _avg: { finalScore: true },
      }),
    ]);
    const completionRate = totalAssignments > 0 ? (completedAssignments / totalAssignments) * 100 : 0;
    const gradeDistribution = {
      excellent: 0,
      good: 0,
      pass: 0,
      fail: 0,
      alarm: 0
    };

    gradeGroups.forEach((group) => {
      if (group.grade in gradeDistribution) {
        gradeDistribution[group.grade as keyof typeof gradeDistribution] = group._count._all;
      }
    });

    const averageScore = scoreAggregate._avg.finalScore ?? 0;
    const recentAuditRows = recentAudits.map(a => ({
      id: a.id,
      storeName: a.store.name,
      finalScore: a.finalScore,
      grade: a.grade,
      submittedAt: a.submittedAt,
    }));

    const storeAverages = storeScoreGroups
      .map((group) => ({
        storeId: group.storeId,
        average: group._avg.finalScore ?? 0,
      }))
      .sort((a, b) => b.average - a.average);
    const highlightedStoreIds = Array.from(new Set([
      ...storeAverages.slice(0, 3).map((store) => store.storeId),
      ...storeAverages.slice(-3).map((store) => store.storeId),
    ]));
    const highlightedStores = await prisma.store.findMany({
      where: { id: { in: highlightedStoreIds } },
      select: { id: true, name: true },
    });
    const dbDuration = performance.now() - dbStartedAt;
    const storeNameById = new Map(highlightedStores.map((store) => [store.id, store.name]));
    const topStores = storeAverages.slice(0, 3).map((store) => ({
      name: storeNameById.get(store.storeId) ?? "Unknown store",
      average: store.average,
    }));
    const bottomStores = storeAverages.slice(-3).reverse().map((store) => ({
      name: storeNameById.get(store.storeId) ?? "Unknown store",
      average: store.average,
    }));

    return withServerTiming(response.success({
      openAuditPlans: openAuditPlansCount,
      pendingActionPlans,
      overdueActionPlans,
      completionRate: Number(completionRate.toFixed(2)),
      averageScore: Number(averageScore.toFixed(2)),
      gradeDistribution,
      recentAudits: recentAuditRows,
      topStores,
      bottomStores,
    }), [
      { name: "db", durationMs: dbDuration, description: "Aggregate queries" },
      { name: "total", durationMs: performance.now() - startedAt, description: "Route handler" },
    ]);
  } catch (error) {
    console.error("GET Analytics Overview Error:", error);
    return response.error("Internal server error", 500);
  }
}
