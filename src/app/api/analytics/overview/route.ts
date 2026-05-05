import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { getRoles } from "@/lib/rbac";

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get("x-user-id");
    const roles = getRoles(request);
    if (!userId || roles.length === 0) return response.unauthorized();

    if (roles.includes("qc_auditor") && !roles.includes("company_admin") && !roles.includes("qa_manager")) {
      return response.success({ message: "QC Auditors do not have analytics overview" });
    }

    // Determine scoped stores
    let storeIds: string[] | undefined = undefined;

    if (roles.includes("store_manager") && !roles.includes("company_admin") && !roles.includes("qa_manager")) {
      const smStores = await prisma.roleAssignment.findMany({
        where: { userId, roleKey: "store_manager" },
        select: { storeId: true }
      });
      storeIds = smStores.map(s => s.storeId).filter(Boolean) as string[];
    } else if (roles.includes("am") && !roles.includes("company_admin") && !roles.includes("qa_manager")) {
      const amStores = await prisma.store.findMany({
        where: { amId: userId },
        select: { id: true }
      });
      storeIds = amStores.map(s => s.id);
    }

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
