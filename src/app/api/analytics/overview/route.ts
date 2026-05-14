import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { canReadAllQaData, getReadableStoreIds, getRequestUser } from "@/lib/scope";

export async function GET(request: NextRequest) {
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

    // 1. openAuditPlans
    // "open" plans don't have storeId directly on the plan, they have assignments.
    const openAuditPlansCount = await prisma.auditPlan.count({
      where: {
        status: "open",
        ...(storeIds ? {
          assignments: { some: { storeId: { in: storeIds } } }
        } : {})
      }
    });

    // 2. pendingActionPlans & overdueActionPlans
    const actionPlans = await prisma.actionPlan.findMany({
      where: storeFilter,
    });
    const pendingActionPlans = actionPlans.filter(ap => ap.status === "draft" || ap.status === "submitted" || ap.status === "rejected").length;
    const overdueActionPlans = actionPlans.filter(ap => ap.deadline && ap.deadline < now && ap.status !== "closed").length;

    // 3. completionRate this month
    const totalAssignments = await prisma.auditAssignment.count({
      where: {
        ...storeFilter,
        scheduledDate: { gte: startOfMonth, lte: endOfMonth }
      }
    });
    const completedAssignments = await prisma.auditAssignment.count({
      where: {
        ...storeFilter,
        scheduledDate: { gte: startOfMonth, lte: endOfMonth },
        status: "completed"
      }
    });
    const completionRate = totalAssignments > 0 ? (completedAssignments / totalAssignments) * 100 : 0;

    // 4. recentAudits & averageScore & gradeDistribution
    const auditsThisMonth = await prisma.audit.findMany({
      where: {
        ...storeFilter,
        submittedAt: { gte: startOfMonth, lte: endOfMonth }
      },
      include: {
        store: { select: { id: true, name: true } },
      },
      orderBy: { submittedAt: "desc" }
    });

    let totalScore = 0;
    const gradeDistribution = {
      excellent: 0,
      good: 0,
      pass: 0,
      fail: 0,
      alarm: 0
    };

    auditsThisMonth.forEach(a => {
      totalScore += a.finalScore;
      if (a.grade in gradeDistribution) {
        gradeDistribution[a.grade as keyof typeof gradeDistribution]++;
      }
    });

    const averageScore = auditsThisMonth.length > 0 ? totalScore / auditsThisMonth.length : 0;
    
    const recentAudits = auditsThisMonth.slice(0, 5).map(a => ({
      id: a.id,
      storeName: a.store.name,
      finalScore: a.finalScore,
      grade: a.grade,
      submittedAt: a.submittedAt,
    }));

    // 5. topStores & bottomStores (aggregate scores per store)
    const storeScores = new Map<string, { name: string, total: number, count: number }>();
    
    auditsThisMonth.forEach(a => {
      const current = storeScores.get(a.store.id) || { name: a.store.name, total: 0, count: 0 };
      current.total += a.finalScore;
      current.count += 1;
      storeScores.set(a.store.id, current);
    });

    const storeAverages = Array.from(storeScores.values()).map(s => ({
      name: s.name,
      average: s.total / s.count
    }));

    storeAverages.sort((a, b) => b.average - a.average);

    const topStores = storeAverages.slice(0, 3);
    const bottomStores = storeAverages.slice().reverse().slice(0, 3);

    return response.success({
      openAuditPlans: openAuditPlansCount,
      pendingActionPlans,
      overdueActionPlans,
      completionRate: Number(completionRate.toFixed(2)),
      averageScore: Number(averageScore.toFixed(2)),
      gradeDistribution,
      recentAudits,
      topStores,
      bottomStores,
    });
  } catch (error) {
    console.error("GET Analytics Overview Error:", error);
    return response.error("Internal server error", 500);
  }
}
