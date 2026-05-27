import { prisma } from "./prisma";
import { getScopedStoreIds } from "./audit-workflow";

export type DashboardScope = "admin" | "qam" | "qc" | "am" | "sm";

type DashboardFilters = {
  from: Date;
  to: Date;
  brandId?: string;
  storeId?: string;
  planId?: string;
  checklistId?: string;
  qcId?: string;
  amId?: string;
  status?: string;
  assignmentStatus?: string;
  actionPlanStatus?: string;
  grade?: string;
  riskOnly?: boolean;
  overdueOnly?: boolean;
};

type DashboardContext = {
  scope: DashboardScope;
  userId: string;
  roles: string[];
  filters: DashboardFilters;
  scopedStoreIds?: string[];
};

const ACTION_PLAN_STATUSES = ["draft", "submitted", "rejected", "closed"] as const;
const ASSIGNMENT_STATUSES = ["pending", "in_progress", "completed"] as const;
const DASHBOARD_GRADES = ["excellent", "good", "pass", "fail", "alarm"] as const;

export const DASHBOARD_ROLE_BY_SCOPE: Record<DashboardScope, string[]> = {
  admin: ["company_admin"],
  qam: ["qa_manager"],
  qc: ["qc_auditor"],
  am: ["am"],
  sm: ["store_manager"],
};

const DASHBOARD_SCOPES = new Set(Object.keys(DASHBOARD_ROLE_BY_SCOPE));

export function isDashboardScope(value: string): value is DashboardScope {
  return DASHBOARD_SCOPES.has(value);
}

export function userCanReadDashboardScope(roles: string[], scope: DashboardScope) {
  return roles.some((role) => DASHBOARD_ROLE_BY_SCOPE[scope].includes(role));
}

export function getDefaultDashboardScopeForRoles(roles: string[]): DashboardScope | null {
  if (userCanReadDashboardScope(roles, "admin")) return "admin";
  if (userCanReadDashboardScope(roles, "qam")) return "qam";
  if (userCanReadDashboardScope(roles, "qc")) return "qc";
  if (userCanReadDashboardScope(roles, "am")) return "am";
  if (userCanReadDashboardScope(roles, "sm")) return "sm";
  return null;
}

function startOfCurrentMonth() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function endOfCurrentDay() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
}

function parseDate(value: string | null, fallback: Date) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function parseBoolean(value: string | null) {
  return value === "true" || value === "1";
}

export function parseDashboardFilters(searchParams: URLSearchParams): DashboardFilters {
  return {
    from: parseDate(searchParams.get("from"), startOfCurrentMonth()),
    to: parseDate(searchParams.get("to"), endOfCurrentDay()),
    brandId: searchParams.get("brandId") || undefined,
    storeId: searchParams.get("storeId") || undefined,
    planId: searchParams.get("planId") || undefined,
    checklistId: searchParams.get("checklistId") || undefined,
    qcId: searchParams.get("qcId") || undefined,
    amId: searchParams.get("amId") || undefined,
    status: searchParams.get("status") || undefined,
    assignmentStatus: searchParams.get("assignmentStatus") || undefined,
    actionPlanStatus: searchParams.get("actionPlanStatus") || undefined,
    grade: searchParams.get("grade") || undefined,
    riskOnly: parseBoolean(searchParams.get("riskOnly")),
    overdueOnly: parseBoolean(searchParams.get("overdueOnly")),
  };
}

async function buildDashboardContext(
  scope: DashboardScope,
  userId: string,
  roles: string[],
  filters: DashboardFilters
): Promise<DashboardContext> {
  if (scope === "am" || scope === "sm") {
    return {
      scope,
      userId,
      roles,
      filters,
      scopedStoreIds: await getScopedStoreIds(userId, roles),
    };
  }

  return { scope, userId, roles, filters };
}

function scopedStoreWhere(ctx: DashboardContext) {
  const and: any[] = [];
  const { filters } = ctx;

  if (ctx.scopedStoreIds) {
    and.push(ctx.scopedStoreIds.length > 0 ? { id: { in: ctx.scopedStoreIds } } : { id: "__no_access__" });
  }

  if (filters.storeId) and.push({ id: filters.storeId });
  if (filters.brandId) and.push({ brandId: filters.brandId });
  if (filters.amId) and.push({ amId: filters.amId });

  return and.length > 0 ? { AND: and } : {};
}

function scopedStoreIdWhere(ctx: DashboardContext) {
  const and: any[] = [];
  const { filters } = ctx;

  if (ctx.scopedStoreIds) {
    and.push(ctx.scopedStoreIds.length > 0 ? { storeId: { in: ctx.scopedStoreIds } } : { storeId: "__no_access__" });
  }

  if (filters.storeId) and.push({ storeId: filters.storeId });
  if (filters.brandId || filters.amId) {
    and.push({
      store: {
        ...(filters.brandId ? { brandId: filters.brandId } : {}),
        ...(filters.amId ? { amId: filters.amId } : {}),
      },
    });
  }

  return and;
}

function auditWhere(ctx: DashboardContext) {
  const and = scopedStoreIdWhere(ctx);
  const { filters } = ctx;

  if (ctx.scope === "qc") and.push({ auditorId: ctx.userId });
  if (filters.qcId) and.push({ auditorId: filters.qcId });
  if (filters.checklistId) and.push({ formId: filters.checklistId });
  if (filters.planId) and.push({ assignment: { planId: filters.planId } });
  if (filters.grade || filters.status) and.push({ grade: filters.grade ?? filters.status });
  if (filters.riskOnly) and.push({ isRiskTriggered: true });

  return {
    submittedAt: {
      not: null,
      gte: filters.from,
      lte: filters.to,
    },
    ...(and.length > 0 ? { AND: and } : {}),
  };
}

function auditTrendWhere(ctx: DashboardContext) {
  const and = scopedStoreIdWhere(ctx);
  const { filters } = ctx;

  if (ctx.scope === "qc") and.push({ auditorId: ctx.userId });
  if (filters.qcId) and.push({ auditorId: filters.qcId });
  if (filters.checklistId) and.push({ formId: filters.checklistId });
  if (filters.planId) and.push({ assignment: { planId: filters.planId } });
  if (filters.grade || filters.status) and.push({ grade: filters.grade ?? filters.status });
  if (filters.riskOnly) and.push({ isRiskTriggered: true });

  return {
    submittedAt: { not: null },
    ...(and.length > 0 ? { AND: and } : {}),
  };
}

function buildLatestMonthScoreTrend(audits: Array<{ finalScore: number; submittedAt: Date | null }>, limit = 5) {
  const monthKeys = Array.from(
    new Set(
      audits
        .map((audit) => audit.submittedAt?.toISOString().slice(0, 7))
        .filter((value): value is string => Boolean(value))
    )
  )
    .sort()
    .slice(-limit);
  const allowedMonths = new Set(monthKeys);

  return aggregateScoreTrend(
    audits
      .filter((audit) => {
        const month = audit.submittedAt?.toISOString().slice(0, 7);
        return month ? allowedMonths.has(month) : false;
      })
      .map((audit) => ({
        key: audit.submittedAt!.toISOString().slice(0, 7),
        score: audit.finalScore,
      }))
  ).sort((a, b) => (a.date ?? a.label).localeCompare(b.date ?? b.label));
}

async function getLatestMonthScoreTrend(ctx: DashboardContext, limit = 5) {
  const audits = await prisma.audit.findMany({
    where: auditTrendWhere(ctx),
    select: {
      finalScore: true,
      submittedAt: true,
    },
    orderBy: { submittedAt: "desc" },
    take: 120,
  });

  return buildLatestMonthScoreTrend(audits, limit);
}

function assignmentWhere(ctx: DashboardContext) {
  const and = scopedStoreIdWhere(ctx);
  const { filters } = ctx;

  if (ctx.scope === "qc") and.push({ auditorId: ctx.userId });
  if (filters.qcId) and.push({ auditorId: filters.qcId });
  if (filters.assignmentStatus || filters.status) {
    and.push({ status: filters.assignmentStatus ?? filters.status });
  }
  if (filters.planId) and.push({ planId: filters.planId });
  if (filters.checklistId) and.push({ plan: { formId: filters.checklistId } });

  and.push({
    plan: {
      startDate: { lte: filters.to },
      endDate: { gte: filters.from },
    },
  });

  return and.length > 0 ? { AND: and } : {};
}

function actionPlanWhere(ctx: DashboardContext) {
  const and = scopedStoreIdWhere(ctx);
  const { filters } = ctx;

  if (filters.actionPlanStatus || filters.status) {
    and.push({ status: filters.actionPlanStatus ?? filters.status });
  }
  if (filters.checklistId || filters.planId || filters.qcId || ctx.scope === "qc") {
    and.push({
      audit: {
        ...(filters.checklistId ? { formId: filters.checklistId } : {}),
        ...(filters.qcId ? { auditorId: filters.qcId } : {}),
        ...(ctx.scope === "qc" ? { auditorId: ctx.userId } : {}),
        ...(filters.planId ? { assignment: { planId: filters.planId } } : {}),
      },
    });
  }
  if (filters.overdueOnly) and.push(overdueActionPlanCondition());

  return {
    createdAt: { gte: filters.from, lte: filters.to },
    ...(and.length > 0 ? { AND: and } : {}),
  };
}

function countBy<T extends string | number | boolean>(
  rows: Array<Record<string, any>>,
  field: string,
  fallback = "unknown"
) {
  return rows.reduce<Record<string, number>>((counts, row) => {
    const key = String(row[field] ?? fallback);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function aggregateAverage(rows: Array<{ key: string; score: number }>) {
  const grouped = new Map<string, { key: string; total: number; count: number }>();
  for (const row of rows) {
    const current = grouped.get(row.key) ?? { key: row.key, total: 0, count: 0 };
    current.total += row.score;
    current.count += 1;
    grouped.set(row.key, current);
  }

  return Array.from(grouped.values()).map((item) => ({
    key: item.key,
    auditCount: item.count,
    averageScore: Number((item.total / item.count).toFixed(2)),
  }));
}

function aggregateScoreTrend(rows: Array<{ key: string; score: number }>) {
  return aggregateAverage(rows).map((item) => {
    const match = item.key.match(/^(\d{4})-(\d{2})$/);
    const month = match?.[2];
    return {
      label: month ? `T${month}` : item.key,
      date: month ? `${item.key}-01T00:00:00.000Z` : null,
      averageScore: item.averageScore,
      auditCount: item.auditCount,
    };
  });
}

export function percentage(value: number, total: number) {
  if (total <= 0) return 0;
  return Number(((value / total) * 100).toFixed(1));
}

function delta(current: number, previous: number) {
  return Number((current - previous).toFixed(2));
}

function previousPeriod(ctx: DashboardContext): DashboardContext {
  const currentMs = ctx.filters.to.getTime() - ctx.filters.from.getTime();
  const previousTo = new Date(ctx.filters.from.getTime() - 1);
  const previousFrom = new Date(previousTo.getTime() - currentMs);

  return {
    ...ctx,
    filters: {
      ...ctx.filters,
      from: previousFrom,
      to: previousTo,
    },
  };
}

function toCountMap(groupRows: Array<{ status?: string; roleKey?: string; isActive?: boolean; _count: any }>, key: string) {
  return Object.fromEntries(
    groupRows.map((row) => [String((row as any)[key]), row._count?._all ?? row._count?.id ?? 0])
  );
}

function withActionPlanStatusDefaults(counts: Record<string, number>) {
  return ACTION_PLAN_STATUSES.reduce<Record<string, number>>((result, status) => {
    result[status] = counts[status] ?? 0;
    return result;
  }, {});
}

function countMapToRows(counts: Record<string, number>, keyName = "key") {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return Object.entries(counts).map(([key, count]) => ({
    [keyName]: key,
    count,
    percentage: percentage(count, total),
  }));
}

async function getOverdueActionPlanCount(where: any) {
  return prisma.actionPlan.count({
    where: {
      ...where,
      ...overdueActionPlanCondition(),
    },
  });
}

function overdueActionPlanCondition() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return {
    status: { not: "closed" },
    OR: [
      { deadline: { lt: new Date() } },
      { deadline: null, createdAt: { lt: sevenDaysAgo } },
    ],
  };
}

const ACTION_PLAN_FALLBACK_DUE_DAYS = 7;

export function getActionPlanDueDate(item: { deadline: Date | null; createdAt: Date }) {
  return item.deadline ?? new Date(
    item.createdAt.getTime() + ACTION_PLAN_FALLBACK_DUE_DAYS * 24 * 60 * 60 * 1000
  );
}

export function getActionPlanOverdueDays(
  item: { status: string; deadline: Date | null; createdAt: Date },
  now = new Date()
) {
  if (item.status === "closed") return 0;
  const dueDate = getActionPlanDueDate(item);
  return Math.max(0, Math.ceil((now.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000)));
}

async function getViolationAnalytics(ctx: DashboardContext) {
  const grouped = await prisma.violation.groupBy({
    by: ["criteriaId"],
    where: {
      numErrors: { gt: 0 },
      audit: auditWhere(ctx),
    },
    _count: { _all: true },
    _sum: { numErrors: true },
  });

  const criteria = await prisma.criteria.findMany({
    where: { id: { in: grouped.map((item) => item.criteriaId) } },
    select: {
      id: true,
      code: true,
      name: true,
      flag: true,
      group: { select: { id: true, code: true, name: true } },
    },
  });
  const criteriaById = new Map(criteria.map((item) => [item.id, item]));
  const byGroup = new Map<string, { groupCode: string; groupName: string; violationCount: number; errorCount: number }>();

  const totalViolationCount = grouped.reduce((sum, item) => sum + item._count._all, 0);
  const totalErrorCount = grouped.reduce((sum, item) => sum + (item._sum.numErrors ?? 0), 0);

  const topCriteria = grouped
    .map((item) => {
      const criterion = criteriaById.get(item.criteriaId);
      const groupCode = criterion?.flag === "risk" ? "RISK" : criterion?.group?.code ?? "UNKNOWN";
      const groupName = criterion?.flag === "risk" ? "Risk" : criterion?.group?.name ?? "Unknown";
      const current = byGroup.get(groupCode) ?? {
        groupCode,
        groupName,
        violationCount: 0,
        errorCount: 0,
      };
      current.violationCount += item._count._all;
      current.errorCount += item._sum.numErrors ?? 0;
      byGroup.set(groupCode, current);

      return {
        criteriaId: item.criteriaId,
        code: criterion?.code ?? item.criteriaId,
        name: criterion?.name ?? "",
        flag: criterion?.flag ?? "none",
        groupCode,
        violationCount: item._count._all,
        errorCount: item._sum.numErrors ?? 0,
      };
    })
    .sort((a, b) => b.errorCount - a.errorCount)
    .slice(0, 10);

  const [repeatCount, criticalCount, autoCcpCount, riskCount, repeatedViolations, topRepeatGroups, violationTrendRows] = await Promise.all([
    prisma.violation.count({
      where: {
        numErrors: { gt: 0 },
        repeatCount: { gt: 0 },
        audit: auditWhere(ctx),
      },
    }),
    prisma.violation.count({
      where: {
        numErrors: { gt: 0 },
        criteria: { flag: "critical" },
        audit: auditWhere(ctx),
      },
    }),
    prisma.violation.count({
      where: {
        numErrors: { gt: 0 },
        isCriticalTriggered: true,
        criteria: { flag: { not: "critical" } },
        audit: auditWhere(ctx),
      },
    }),
    prisma.violation.count({
      where: {
        numErrors: { gt: 0 },
        isRiskTriggered: true,
        audit: auditWhere(ctx),
      },
    }),
    prisma.violation.findMany({
      where: {
        numErrors: { gt: 0 },
        repeatCount: { gt: 0 },
        audit: auditWhere(ctx),
      },
      select: {
        id: true,
        numErrors: true,
        audit: { select: { submittedAt: true } },
      },
    }),
    prisma.violation.groupBy({
      by: ["criteriaId"],
      where: {
        numErrors: { gt: 0 },
        repeatCount: { gt: 0 },
        audit: auditWhere(ctx),
      },
      _count: { _all: true },
      _sum: { numErrors: true },
    }),
    prisma.violation.findMany({
      where: {
        numErrors: { gt: 0 },
        audit: auditWhere(ctx),
      },
      select: {
        id: true,
        numErrors: true,
        audit: { select: { submittedAt: true } },
      },
    }),
  ]);
  const topRepeatItems = topRepeatGroups
    .sort((a, b) => (b._sum.numErrors ?? 0) - (a._sum.numErrors ?? 0))
    .slice(0, 5);
  const topRepeatCriteriaIds = topRepeatItems.map((item) => item.criteriaId);
  const topRepeatCriteriaRows = await prisma.criteria.findMany({
    where: { id: { in: topRepeatCriteriaIds } },
    select: {
      id: true,
      code: true,
      name: true,
      flag: true,
      group: { select: { id: true, code: true, name: true } },
    },
  });
  const topRepeatCriteriaById = new Map(topRepeatCriteriaRows.map((item) => [item.id, item]));
  const repeatTrendMap = new Map<string, { period: string; repeatViolationCount: number; repeatErrorCount: number }>();
  for (const violation of repeatedViolations) {
    const period = violation.audit.submittedAt?.toISOString().slice(0, 7) ?? "unknown";
    const current = repeatTrendMap.get(period) ?? {
      period,
      repeatViolationCount: 0,
      repeatErrorCount: 0,
    };
    current.repeatViolationCount += 1;
    current.repeatErrorCount += violation.numErrors;
    repeatTrendMap.set(period, current);
  }
  const errorTrendMap = new Map<string, { period: string; violationCount: number; errorCount: number }>();
  for (const violation of violationTrendRows) {
    const period = violation.audit.submittedAt?.toISOString().slice(0, 7) ?? "unknown";
    const current = errorTrendMap.get(period) ?? {
      period,
      violationCount: 0,
      errorCount: 0,
    };
    current.violationCount += 1;
    current.errorCount += violation.numErrors;
    errorTrendMap.set(period, current);
  }

  return {
    byGroup: Array.from(byGroup.values())
      .map((item) => ({
        ...item,
        count: item.errorCount,
        percentage: percentage(item.errorCount, totalErrorCount),
      }))
      .sort((a, b) => a.groupCode.localeCompare(b.groupCode)),
    topCriteria,
    totalViolationCount,
    totalErrorCount,
    repeatCount,
    repeatRate: percentage(repeatCount, totalViolationCount),
    repeatTrend: Array.from(repeatTrendMap.values()).sort((a, b) => a.period.localeCompare(b.period)),
    errorTrend: Array.from(errorTrendMap.values()).sort((a, b) => a.period.localeCompare(b.period)),
    topRepeatCriteria: topRepeatItems.map((item) => {
      const criterion = topRepeatCriteriaById.get(item.criteriaId);
      return {
        criteriaId: item.criteriaId,
        code: criterion?.code ?? item.criteriaId,
        name: criterion?.name ?? "",
        flag: criterion?.flag ?? "none",
        groupCode: criterion?.flag === "risk" ? "RISK" : criterion?.group?.code ?? "UNKNOWN",
        violationCount: item._count._all,
        errorCount: item._sum.numErrors ?? 0,
      };
    }),
    criticalCount,
    autoCcpCount,
    riskCount,
  };
}

async function getAuditScoreAnalytics(ctx: DashboardContext) {
  const audits = await prisma.audit.findMany({
    where: auditWhere(ctx),
    select: {
      id: true,
      finalScore: true,
      grade: true,
      isRiskTriggered: true,
      submittedAt: true,
      store: {
        select: {
          id: true,
          code: true,
          name: true,
          province: true,
          brand: { select: { id: true, code: true, name: true } },
          am: { select: { id: true, fullName: true, email: true } },
        },
      },
      violations: {
        where: {
          numErrors: { gt: 0 },
          OR: [
            { isCriticalTriggered: true },
            { criteria: { flag: "critical" } },
          ],
        },
        select: { id: true },
      },
    },
  });

  const averageScore = audits.length
    ? Number((audits.reduce((sum, item) => sum + item.finalScore, 0) / audits.length).toFixed(2))
    : 0;
  const storeIds = new Set(audits.map((item) => item.store.id));
  const scoreRows = audits.map((item) => ({
    auditId: item.id,
    store: item.store,
    finalScore: item.finalScore,
    grade: item.grade,
    isRiskTriggered: item.isRiskTriggered,
    hasCritical: item.violations.length > 0,
    submittedAt: item.submittedAt,
  }));

  const storeAverages = Array.from(
    scoreRows.reduce((map, row) => {
      const current = map.get(row.store.id) ?? {
        store: row.store,
        total: 0,
        count: 0,
        riskCount: 0,
        criticalCount: 0,
        latestAuditDate: null as Date | null,
        latestScore: null as number | null,
        latestGrade: null as string | null,
      };
      current.total += row.finalScore;
      current.count += 1;
      if (row.isRiskTriggered) current.riskCount += 1;
      if (row.hasCritical) current.criticalCount += 1;
      if (!current.latestAuditDate || (row.submittedAt && row.submittedAt > current.latestAuditDate)) {
        current.latestAuditDate = row.submittedAt;
        current.latestScore = row.finalScore;
        current.latestGrade = row.grade;
      }
      map.set(row.store.id, current);
      return map;
    }, new Map<string, any>()).values()
  ).map((item) => ({
    store: item.store,
    auditCount: item.count,
    averageScore: Number((item.total / item.count).toFixed(2)),
    riskCount: item.riskCount,
    criticalCount: item.criticalCount,
    latestAuditDate: item.latestAuditDate,
    latestScore: item.latestScore,
    grade: item.latestGrade,
  }));

  const averageByBrandMap = new Map<
    string,
    { key: string; total: number; auditCount: number; storeIds: Set<string> }
  >();
  const averageByAMMap = new Map<
    string,
    { key: string; total: number; auditCount: number; storeIds: Set<string> }
  >();

  for (const item of scoreRows) {
    const brandKey = item.store.brand.name;
    const brandCurrent = averageByBrandMap.get(brandKey) ?? {
      key: brandKey,
      total: 0,
      auditCount: 0,
      storeIds: new Set<string>(),
    };
    brandCurrent.total += item.finalScore;
    brandCurrent.auditCount += 1;
    brandCurrent.storeIds.add(item.store.id);
    averageByBrandMap.set(brandKey, brandCurrent);

    const amKey = item.store.am?.fullName ?? "Chua gan AM";
    const amCurrent = averageByAMMap.get(amKey) ?? {
      key: amKey,
      total: 0,
      auditCount: 0,
      storeIds: new Set<string>(),
    };
    amCurrent.total += item.finalScore;
    amCurrent.auditCount += 1;
    amCurrent.storeIds.add(item.store.id);
    averageByAMMap.set(amKey, amCurrent);
  }

  return {
    averageScore,
    auditCount: audits.length,
    auditedStoreCount: storeIds.size,
    riskAuditCount: audits.filter((item) => item.isRiskTriggered).length,
    criticalAuditCount: audits.filter((item) => item.violations.length > 0).length,
    topStores: [...storeAverages].sort((a, b) => b.averageScore - a.averageScore).slice(0, 10),
    bottomStores: [...storeAverages].sort((a, b) => a.averageScore - b.averageScore).slice(0, 10),
    averageByBrand: Array.from(averageByBrandMap.values()).map((item) => ({
      key: item.key,
      auditCount: item.auditCount,
      storeCount: item.storeIds.size,
      averageScore: Number((item.total / item.auditCount).toFixed(2)),
    })),
    averageByAM: Array.from(averageByAMMap.values()).map((item) => ({
      key: item.key,
      auditCount: item.auditCount,
      storeCount: item.storeIds.size,
      averageScore: Number((item.total / item.auditCount).toFixed(2)),
    })),
    averageByProvince: aggregateAverage(
      scoreRows.map((item) => ({
        key: item.store.province ?? "Chua co khu vuc",
        score: item.finalScore,
      }))
    ),
    trendByMonth: aggregateScoreTrend(
      scoreRows.map((item) => ({
        key: item.submittedAt ? item.submittedAt.toISOString().slice(0, 7) : "unknown",
        score: item.finalScore,
      }))
    ).sort((a, b) => (a.date ?? a.label).localeCompare(b.date ?? b.label)),
  };
}

async function getAssignmentAnalytics(ctx: DashboardContext) {
  const where = assignmentWhere(ctx);
  const [statusRows, planStatusRows, auditorStatusRows, assignedStores] = await Promise.all([
    prisma.auditAssignment.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    }),
    prisma.auditAssignment.groupBy({
      by: ["planId", "status"],
      where,
      _count: { _all: true },
    }),
    prisma.auditAssignment.groupBy({
      by: ["auditorId", "status"],
      where,
      _count: { _all: true },
    }),
    ctx.scope === "qc" ? prisma.auditAssignment.findMany({
      where,
      select: {
        id: true,
        status: true,
        auditId: true,
        plan: {
          select: {
            id: true,
            name: true,
            status: true,
            startDate: true,
            endDate: true,
            form: { select: { id: true, name: true, version: true, status: true } },
          },
        },
        auditor: { select: { id: true, fullName: true, email: true } },
        store: { select: { id: true, code: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }) : Promise.resolve([]),
  ]);

  const planIds = Array.from(new Set(planStatusRows.map((item) => item.planId)));
  const auditorIds = Array.from(new Set(auditorStatusRows.map((item) => item.auditorId)));
  const [plans, auditors] = await Promise.all([
    prisma.auditPlan.findMany({
      where: { id: { in: planIds } },
      select: { id: true, name: true, status: true, startDate: true, endDate: true },
    }),
    prisma.user.findMany({
      where: { id: { in: auditorIds } },
      select: { id: true, fullName: true, email: true },
    }),
  ]);
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const auditorById = new Map(auditors.map((auditor) => [auditor.id, auditor]));

  const byPlan = Array.from(
    planStatusRows.reduce((map, item) => {
      const current = map.get(item.planId) ?? {
        plan: planById.get(item.planId) ?? { id: item.planId },
        total: 0,
        pending: 0,
        in_progress: 0,
        completed: 0,
        completionRate: 0,
      };
      current.total += item._count._all;
      current[item.status as "pending" | "in_progress" | "completed"] =
        (current[item.status as "pending" | "in_progress" | "completed"] ?? 0) + item._count._all;
      current.completionRate = percentage(current.completed, current.total);
      map.set(item.planId, current);
      return map;
    }, new Map<string, any>()).values()
  );

  const byAuditor = Array.from(
    auditorStatusRows.reduce((map, item) => {
      const current = map.get(item.auditorId) ?? {
        auditor: auditorById.get(item.auditorId) ?? { id: item.auditorId },
        total: 0,
        pending: 0,
        in_progress: 0,
        completed: 0,
        completionRate: 0,
      };
      current.total += item._count._all;
      current[item.status as "pending" | "in_progress" | "completed"] =
        (current[item.status as "pending" | "in_progress" | "completed"] ?? 0) + item._count._all;
      current.completionRate = percentage(current.completed, current.total);
      map.set(item.auditorId, current);
      return map;
    }, new Map<string, any>()).values()
  );

  const statusCounts = toCountMap(statusRows as any, "status");
  const total = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);

  return {
    total,
    statusCounts,
    byPlan,
    byAuditor,
    assignedStores: assignedStores.map((item) => ({
      assignmentId: item.id,
      auditId: item.auditId,
      status: item.status,
      plan: item.plan,
      checklist: item.plan.form,
      store: item.store,
      canStart: item.status === "pending",
      canContinue: item.status === "in_progress",
      canViewResult: item.status === "completed" && Boolean(item.auditId),
    })),
  };
}

async function getActionPlanAnalytics(ctx: DashboardContext) {
  const where = actionPlanWhere(ctx);
  const [statusRows, overdueCount, total, withEvidence, followUps] = await Promise.all([
    prisma.actionPlan.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    }),
    getOverdueActionPlanCount(where),
    prisma.actionPlan.count({ where }),
    prisma.actionPlanItem.count({
      where: {
        actionPlan: where,
        OR: [
          { rootCause: { not: null } },
          { remediation: { not: null } },
          { evidences: { some: {} } },
        ],
      },
    }),
    prisma.actionPlan.findMany({
      where: {
        ...where,
        status: { not: "closed" },
      },
      select: {
        id: true,
        status: true,
        deadline: true,
        createdAt: true,
        store: { select: { id: true, code: true, name: true } },
        audit: {
          select: {
            id: true,
            finalScore: true,
            grade: true,
            submittedAt: true,
            auditorId: true,
          },
        },
        items: {
          select: {
            id: true,
            fixedAt: true,
            assigneeName: true,
            status: true,
          },
          take: 1,
        },
        _count: { select: { items: true } },
      },
      orderBy: [{ deadline: "asc" }, { createdAt: "asc" }],
      take: 10,
    }),
  ]);
  const statusCounts = withActionPlanStatusDefaults(toCountMap(statusRows as any, "status"));
  const openCount = (statusCounts.draft ?? 0) + (statusCounts.submitted ?? 0) + (statusCounts.rejected ?? 0);
  const now = new Date();

  return {
    total,
    statusCounts,
    openCount,
    closedCount: statusCounts.closed ?? 0,
    overdueCount,
    withEvidenceOrNoteCount: withEvidence,
    followUps: followUps.map((item) => {
      const dueDate = getActionPlanDueDate(item);
      return {
        id: item.id,
        status: item.status,
        store: item.store,
        audit: item.audit,
        itemCount: item._count.items,
        assigneeName: item.items[0]?.assigneeName ?? null,
        dueDate,
        overdueDays: getActionPlanOverdueDays(item, now),
      };
    }),
  };
}

async function getStoreRanking(ctx: DashboardContext) {
  const audits = await prisma.audit.findMany({
    where: auditWhere(ctx),
    select: {
      id: true,
      finalScore: true,
      grade: true,
      submittedAt: true,
      store: { select: { id: true, code: true, name: true } },
    },
  });
  const grouped = Array.from(
    audits.reduce((map, audit) => {
      const current = map.get(audit.store.id) ?? {
        store: audit.store,
        total: 0,
        auditCount: 0,
        latestAuditDate: null as Date | null,
        latestScore: null as number | null,
        latestGrade: null as string | null,
      };
      current.total += audit.finalScore;
      current.auditCount += 1;
      if (!current.latestAuditDate || (audit.submittedAt && audit.submittedAt > current.latestAuditDate)) {
        current.latestAuditDate = audit.submittedAt;
        current.latestScore = audit.finalScore;
        current.latestGrade = audit.grade;
      }
      map.set(audit.store.id, current);
      return map;
    }, new Map<string, any>()).values()
  );

  return grouped
    .map((item) => ({
      store: item.store,
      auditCount: item.auditCount,
      averageScore: Number((item.total / item.auditCount).toFixed(2)),
      latestAuditDate: item.latestAuditDate,
      latestScore: item.latestScore,
      grade: item.latestGrade,
    }))
    .sort((a, b) => b.averageScore - a.averageScore);
}

async function getActionPlansByStore(ctx: DashboardContext) {
  const actionPlans = await prisma.actionPlan.findMany({
    where: actionPlanWhere(ctx),
    select: {
      id: true,
      status: true,
      store: { select: { id: true, code: true, name: true } },
      deadline: true,
      createdAt: true,
    },
  });
  const now = new Date();

  return Array.from(
    actionPlans.reduce((map, item) => {
      const dueDate = getActionPlanDueDate(item);
      const overdueDays = getActionPlanOverdueDays(item, now);
      const current = map.get(item.store.id) ?? {
        store: item.store,
        openCount: 0,
        overdueCount: 0,
        closedCount: 0,
        totalCount: 0,
        maxOverdueDays: 0,
        latestDueDate: null as Date | null,
      };
      current.totalCount += 1;
      if (!current.latestDueDate || dueDate > current.latestDueDate) {
        current.latestDueDate = dueDate;
      }
      current.maxOverdueDays = Math.max(current.maxOverdueDays, overdueDays);
      if (item.status === "closed") {
        current.closedCount += 1;
      } else {
        current.openCount += 1;
        if (overdueDays > 0) current.overdueCount += 1;
      }
      map.set(item.store.id, current);
      return map;
    }, new Map<string, any>()).values()
  )
    .sort((a, b) => b.openCount + b.overdueCount - (a.openCount + a.overdueCount))
    .slice(0, 10);
}

async function getSmDetailAnalytics(ctx: DashboardContext) {
  const [audits, trendAudits, actionPlanItems, latestImages] = await Promise.all([
    prisma.audit.findMany({
      where: auditWhere(ctx),
      select: {
        id: true,
        finalScore: true,
        grade: true,
        submittedAt: true,
        form: { select: { id: true, name: true, version: true } },
      },
      orderBy: { submittedAt: "desc" },
      take: 10,
    }),
    prisma.audit.findMany({
      where: auditTrendWhere(ctx),
      select: {
        finalScore: true,
        submittedAt: true,
      },
      orderBy: { submittedAt: "desc" },
      take: 120,
    }),
    prisma.actionPlanItem.findMany({
      where: {
        actionPlan: {
          ...actionPlanWhere(ctx),
          status: { not: "closed" },
        },
      },
      select: {
        id: true,
        status: true,
        rootCause: true,
        remediation: true,
        fixedAt: true,
        assigneeName: true,
        violation: {
          select: {
            note: true,
            numErrors: true,
            repeatCount: true,
            isCriticalTriggered: true,
            isRiskTriggered: true,
            criteria: {
              select: {
                id: true,
                code: true,
                name: true,
                flag: true,
                group: { select: { id: true, code: true, name: true } },
              },
            },
          },
        },
        actionPlan: { select: { id: true, status: true, deadline: true, createdAt: true } },
        evidences: { select: { id: true, url: true, fileName: true, mimeType: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    prisma.evidence.findMany({
      where: {
        actionPlanItem: {
          actionPlan: actionPlanWhere(ctx),
        },
      },
      select: {
        id: true,
        url: true,
        fileName: true,
        mimeType: true,
        actionPlanId: true,
        actionPlanItemId: true,
        createdAt: true,
        actionPlanItem: {
          select: {
            violation: {
              select: {
                criteria: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);
  const requiredEvidenceCount = actionPlanItems.length;
  const evidenceCount = actionPlanItems.filter((item) => item.evidences.length > 0).length;
  const latestAudit = audits[0] ?? null;

  return {
    latestAudit,
    latestScore: latestAudit?.finalScore ?? null,
    latestGrade: latestAudit?.grade ?? null,
    remediationEvidenceRate: percentage(evidenceCount, requiredEvidenceCount),
    evidenceCount,
    requiredEvidenceCount,
    auditHistory: audits.map((audit) => ({
      auditId: audit.id,
      submittedAt: audit.submittedAt,
      checklist: audit.form,
      finalScore: audit.finalScore,
      grade: audit.grade,
    })),
    scoreTrend: buildLatestMonthScoreTrend(trendAudits, 5),
    actionPlanItemsToUpdate: actionPlanItems.map((item) => ({
      actionPlanId: item.actionPlan.id,
      itemId: item.id,
      actionPlanStatus: item.actionPlan.status,
      status: item.status,
      deadline: item.actionPlan.deadline,
      overdueDays: getActionPlanOverdueDays({
        status: item.actionPlan.status,
        deadline: item.actionPlan.deadline,
        createdAt: item.actionPlan.createdAt,
      }),
      criteria: item.violation.criteria,
      issueCause: item.violation.note,
      numErrors: item.violation.numErrors,
      repeatCount: item.violation.repeatCount,
      isCriticalTriggered: item.violation.isCriticalTriggered,
      isRiskTriggered: item.violation.isRiskTriggered,
      rootCause: item.rootCause,
      remediation: item.remediation,
      fixedAt: item.fixedAt,
      assigneeName: item.assigneeName,
      imageCount: item.evidences.length,
    })),
    latestRemediationImages: latestImages.map((image) => ({
      id: image.id,
      url: image.url,
      fileName: image.fileName,
      mimeType: image.mimeType,
      actionPlanId: image.actionPlanId,
      itemId: image.actionPlanItemId,
      criteriaName: image.actionPlanItem?.violation.criteria.name ?? null,
      createdAt: image.createdAt,
    })),
  };
}

async function getDashboardDeltas(ctx: DashboardContext, current: {
  averageScore: number;
  auditCount: number;
  riskAuditCount: number;
  criticalAuditCount: number;
  actionPlanOpen: number;
}) {
  const previousCtx = previousPeriod(ctx);
  const [previousAudits, previousActionPlans] = await Promise.all([
    prisma.audit.findMany({
      where: auditWhere(previousCtx),
      select: {
        finalScore: true,
        isRiskTriggered: true,
        violations: {
          where: {
            numErrors: { gt: 0 },
            OR: [
              { isCriticalTriggered: true },
              { criteria: { flag: "critical" } },
            ],
          },
          select: { id: true },
        },
      },
    }),
    getActionPlanAnalytics(previousCtx),
  ]);
  const previousAverageScore = previousAudits.length
    ? previousAudits.reduce((sum, audit) => sum + audit.finalScore, 0) / previousAudits.length
    : 0;

  return {
    averageScore: delta(current.averageScore, previousAverageScore),
    auditCount: current.auditCount - previousAudits.length,
    riskAuditCount: current.riskAuditCount - previousAudits.filter((audit) => audit.isRiskTriggered).length,
    criticalAuditCount: current.criticalAuditCount - previousAudits.filter((audit) => audit.violations.length > 0).length,
    actionPlanOpen: current.actionPlanOpen - previousActionPlans.openCount,
  };
}

async function getAdminDashboardDeltas(ctx: DashboardContext, current: {
  totalUsers: number;
  totalStores: number;
  totalChecklists: number;
  totalAuditPlans: number;
  actionPlansOpen: number;
}) {
  const previousCtx = previousPeriod(ctx);
  const [users, stores, checklists, auditPlans, actionPlans] = await Promise.all([
    prisma.user.count({ where: { createdAt: { gte: previousCtx.filters.from, lte: previousCtx.filters.to } } }),
    prisma.store.count({ where: { createdAt: { gte: previousCtx.filters.from, lte: previousCtx.filters.to } } }),
    prisma.checklistForm.count({ where: { createdAt: { gte: previousCtx.filters.from, lte: previousCtx.filters.to } } }),
    prisma.auditPlan.count({ where: { createdAt: { gte: previousCtx.filters.from, lte: previousCtx.filters.to } } }),
    getActionPlanAnalytics(previousCtx),
  ]);

  return {
    totalUsers: current.totalUsers - users,
    totalStores: current.totalStores - stores,
    totalChecklists: current.totalChecklists - checklists,
    totalAuditPlans: current.totalAuditPlans - auditPlans,
    actionPlansOpen: current.actionPlansOpen - actionPlans.openCount,
  };
}

async function getOverdueActionPlanRows(ctx: DashboardContext) {
  const where = actionPlanWhere(ctx);
  const rows = await prisma.actionPlan.findMany({
    where: {
      ...where,
      ...overdueActionPlanCondition(),
    },
    select: {
      id: true,
      status: true,
      deadline: true,
      createdAt: true,
      store: { select: { id: true, code: true, name: true } },
      audit: { select: { id: true, submittedAt: true, finalScore: true, grade: true } },
    },
    orderBy: [{ deadline: "asc" }, { createdAt: "asc" }],
    take: 10,
  });
  const now = new Date();

  return rows.map((item) => {
    const dueDate = getActionPlanDueDate(item);
    return {
      id: item.id,
      status: item.status,
      store: item.store,
      audit: item.audit,
      dueDate,
      overdueDays: getActionPlanOverdueDays(item, now),
    };
  });
}

export async function getAdminDashboard(userId: string, roles: string[], searchParams: URLSearchParams) {
  const ctx = await buildDashboardContext("admin", userId, roles, parseDashboardFilters(searchParams));
  const apWhere = actionPlanWhere(ctx);
  const [
    totalUsers,
    totalStores,
    totalBrands,
    totalChecklists,
    totalAuditPlans,
    totalSubmittedAudits,
    totalActionPlans,
    usersByRole,
    usersByActive,
    stores,
    checklistsByStatus,
    auditPlansByStatus,
    actionPlans,
    planAssignments,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.store.count(),
    prisma.brand.count(),
    prisma.checklistForm.count(),
    prisma.auditPlan.count(),
    prisma.audit.count({ where: { submittedAt: { not: null } } }),
    prisma.actionPlan.count(),
    prisma.roleAssignment.groupBy({ by: ["roleKey"], _count: { _all: true } }),
    prisma.user.groupBy({ by: ["isActive"], _count: { _all: true } }),
    prisma.store.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        province: true,
        address: true,
        brand: { select: { id: true, code: true, name: true } },
        am: { select: { id: true, fullName: true, email: true } },
        manager: { select: { id: true, fullName: true, email: true } },
      },
    }),
    prisma.checklistForm.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.auditPlan.groupBy({ by: ["status"], _count: { _all: true } }),
    getActionPlanAnalytics(ctx),
    prisma.auditAssignment.groupBy({
      by: ["planId", "status"],
      _count: { _all: true },
    }),
  ]);

  const planIds = Array.from(new Set(planAssignments.map((item) => item.planId)));
  const plans = await prisma.auditPlan.findMany({
    where: { id: { in: planIds } },
    select: { id: true, name: true, status: true, startDate: true, endDate: true },
  });
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const usersByRoleMap = toCountMap(usersByRole as any, "roleKey");
  const usersByStatusMap = toCountMap(usersByActive as any, "isActive");
  const storesByBrandMap = countBy(stores.map((item) => ({ brand: item.brand.name })), "brand");
  const checklistsByStatusMap = toCountMap(checklistsByStatus as any, "status");
  const actionPlansOpen = actionPlans.openCount;
  const storesMissingAM = stores.filter((store) => !store.am).length;
  const storesMissingSM = stores.filter((store) => !store.manager).length;
  const storesMissingBoth = stores.filter((store) => !store.am && !store.manager).length;
  const provinceCoverage = Array.from(
    stores.reduce((map, store) => {
      const province = store.province ?? "Chua co khu vuc";
      const current = map.get(province) ?? {
        province,
        storeCount: 0,
        amAssignedStoreCount: 0,
        smAssignedStoreCount: 0,
      };
      current.storeCount += 1;
      if (store.am) current.amAssignedStoreCount += 1;
      if (store.manager) current.smAssignedStoreCount += 1;
      map.set(province, current);
      return map;
    }, new Map<string, any>()).values()
  );
  const [deltas, overdueActionPlans] = await Promise.all([
    getAdminDashboardDeltas(ctx, {
      totalUsers,
      totalStores,
      totalChecklists,
      totalAuditPlans,
      actionPlansOpen,
    }),
    getOverdueActionPlanRows(ctx),
  ]);

  return buildDashboardResponse({
    summary: {
      totalUsers,
      totalStores,
      totalBrands,
      totalChecklists,
      totalAuditPlans,
      totalSubmittedAudits,
      totalActionPlans,
      actionPlansOpen,
      actionPlansOverdue: actionPlans.overdueCount,
      actionPlansClosed: actionPlans.statusCounts.closed ?? 0,
      storesMissingAM,
      storesMissingSM,
      storesMissingBoth,
      deltas,
    },
    charts: {
      usersByRole: countMapToRows(usersByRoleMap, "role"),
      usersByStatus: countMapToRows(usersByStatusMap, "isActive"),
      storesByBrand: countMapToRows(storesByBrandMap, "brand"),
      storesByProvince: countMapToRows(countBy(stores, "province", "Chua co khu vuc"), "province"),
      checklistsByStatus: countMapToRows(checklistsByStatusMap, "status"),
      auditPlansByStatus: toCountMap(auditPlansByStatus as any, "status"),
      actionPlansByStatus: actionPlans.statusCounts,
      amSmByProvince: provinceCoverage,
    },
    tables: {
      storesMissingData: stores
        .filter((store) => !store.am || !store.manager || !store.address || !store.province)
        .slice(0, 20)
        .map((store) => ({
          id: store.id,
          code: store.code,
          name: store.name,
          brand: store.brand,
          missingAM: !store.am,
          missingSM: !store.manager,
          missingAddress: !store.address || !store.province,
        })),
      auditPlanProgress: planIds.slice(0, 20).map((planId) => {
        const rows = planAssignments.filter((item) => item.planId === planId);
        return {
          plan: planById.get(planId),
          total: rows.reduce((sum, row) => sum + row._count._all, 0),
          pending: rows.find((row) => row.status === "pending")?._count._all ?? 0,
          in_progress: rows.find((row) => row.status === "in_progress")?._count._all ?? 0,
          completed: rows.find((row) => row.status === "completed")?._count._all ?? 0,
        };
      }),
      overdueActionPlans,
    },
  });
}

async function getOperationalDashboard(scope: DashboardScope, userId: string, roles: string[], searchParams: URLSearchParams) {
  const ctx = await buildDashboardContext(scope, userId, roles, parseDashboardFilters(searchParams));
  const [score, assignments, violations, actionPlans] = await Promise.all([
    getAuditScoreAnalytics(ctx),
    getAssignmentAnalytics(ctx),
    getViolationAnalytics(ctx),
    getActionPlanAnalytics(ctx),
  ]);
  const actionPlanOpen = actionPlans.openCount;
  const deltas = await getDashboardDeltas(ctx, {
    averageScore: score.averageScore,
    auditCount: score.auditCount,
    riskAuditCount: score.riskAuditCount,
    criticalAuditCount: score.criticalAuditCount,
    actionPlanOpen,
  });

  return buildDashboardResponse({
    summary: {
      averageScore: score.averageScore,
      auditCount: score.auditCount,
      auditedStoreCount: score.auditedStoreCount,
      assignmentTotal: assignments.total,
      assignmentPending: assignments.statusCounts.pending ?? 0,
      assignmentInProgress: assignments.statusCounts.in_progress ?? 0,
      assignmentCompleted: assignments.statusCounts.completed ?? 0,
      riskAuditCount: score.riskAuditCount,
      criticalAuditCount: score.criticalAuditCount,
      ccpViolationCount: violations.criticalCount,
      autoCcpViolationCount: violations.autoCcpCount,
      riskViolationCount: violations.riskCount,
      totalViolationCount: violations.totalViolationCount,
      totalErrorCount: violations.totalErrorCount,
      repeatViolationCount: violations.repeatCount,
      repeatRate: violations.repeatRate,
      actionPlanTotal: actionPlans.total,
      actionPlanOpen,
      actionPlanOverdue: actionPlans.overdueCount,
      actionPlanClosed: actionPlans.statusCounts.closed ?? 0,
      deltas,
    },
    charts: {
      assignmentStatus: assignments.statusCounts,
      actionPlanStatus: actionPlans.statusCounts,
      errorsByGroup: violations.byGroup,
      averageByBrand: score.averageByBrand,
      averageByAM: score.averageByAM,
      averageByProvince: score.averageByProvince,
      scoreTrend: score.trendByMonth,
      repeatTrend: violations.repeatTrend,
    },
    tables: {
      auditPlanProgress: assignments.byPlan.slice(0, 20),
      progressByQC: scope === "qam" ? assignments.byAuditor.slice(0, 20) : [],
      assignedStores: scope === "qc" ? assignments.assignedStores.slice(0, 50) : [],
      topStores: score.topStores,
      bottomStores: score.bottomStores,
      topCriteria: violations.topCriteria,
      topRepeatCriteria: violations.topRepeatCriteria,
      actionPlanFollowUps: actionPlans.followUps,
    },
  });
}

export async function getQamDashboard(userId: string, roles: string[], searchParams: URLSearchParams) {
  return getOperationalDashboard("qam", userId, roles, searchParams);
}

export async function getQcDashboard(userId: string, roles: string[], searchParams: URLSearchParams) {
  const base = await getOperationalDashboard("qc", userId, roles, searchParams);
  const assignedTotal = Number(base.summary.assignmentTotal ?? 0);
  const submittedCount = Number(base.summary.assignmentCompleted ?? 0);

  return {
    ...base,
    summary: {
      ...base.summary,
      assignedTotal,
      pendingCount: base.summary.assignmentPending,
      inProgressCount: base.summary.assignmentInProgress,
      submittedCount,
      completionRate: percentage(submittedCount, assignedTotal),
      averageScoreOfSubmitted: base.summary.averageScore,
      normalViolationCount:
        Number(base.summary.totalViolationCount ?? 0) -
        Number(base.summary.riskViolationCount ?? 0) -
        Number(base.summary.ccpViolationCount ?? 0) -
        Number(base.summary.autoCcpViolationCount ?? 0),
    },
    charts: {
      ...base.charts,
      completionTrend: base.charts.scoreTrend,
      errorTrend: base.charts.repeatTrend,
    },
    tables: {
      ...base.tables,
      planProgress: base.tables.auditPlanProgress,
    },
  };
}

export async function getAmDashboard(userId: string, roles: string[], searchParams: URLSearchParams) {
  const ctx = await buildDashboardContext("am", userId, roles, parseDashboardFilters(searchParams));
  const [base, managedStoreCount, storeRanking, actionPlansByStore, scoreTrend] = await Promise.all([
    getOperationalDashboard("am", userId, roles, searchParams),
    prisma.store.count({ where: scopedStoreWhere(ctx) }),
    getStoreRanking(ctx),
    getActionPlansByStore(ctx),
    getLatestMonthScoreTrend(ctx, 5),
  ]);

  return {
    ...base,
    summary: {
      ...base.summary,
      managedStoreCount,
    },
    charts: {
      ...base.charts,
      scoreTrend,
    },
    tables: {
      ...base.tables,
      storeRanking,
      actionPlansByStore,
    },
  };
}

export async function getSmDashboard(userId: string, roles: string[], searchParams: URLSearchParams) {
  const ctx = await buildDashboardContext("sm", userId, roles, parseDashboardFilters(searchParams));
  const [base, detail] = await Promise.all([
    getOperationalDashboard("sm", userId, roles, searchParams),
    getSmDetailAnalytics(ctx),
  ]);

  return {
    ...base,
    summary: {
      ...base.summary,
      latestScore: detail.latestScore,
      latestGrade: detail.latestGrade,
      remediationEvidenceRate: detail.remediationEvidenceRate,
      evidenceCount: detail.evidenceCount,
      requiredEvidenceCount: detail.requiredEvidenceCount,
    },
    charts: {
      ...base.charts,
      scoreTrend: detail.scoreTrend,
      violationSeverityBreakdown: {
        risk: base.summary.riskViolationCount,
        ccp: base.summary.ccpViolationCount,
        autoCcp: base.summary.autoCcpViolationCount,
        normal:
          Number(base.summary.totalViolationCount ?? 0) -
          Number(base.summary.riskViolationCount ?? 0) -
          Number(base.summary.ccpViolationCount ?? 0) -
          Number(base.summary.autoCcpViolationCount ?? 0),
      },
    },
    tables: {
      ...base.tables,
      auditHistory: detail.auditHistory,
      actionPlanItemsToUpdate: detail.actionPlanItemsToUpdate,
      latestRemediationImages: detail.latestRemediationImages,
    },
  };
}

export async function getDashboardFilters(userId: string, roles: string[], searchParams: URLSearchParams) {
  const scopeValue = searchParams.get("scope");
  const requestedScope = scopeValue && isDashboardScope(scopeValue) ? scopeValue : null;
  const scope = requestedScope ?? getDefaultDashboardScopeForRoles(roles);
  if (!scope || !userCanReadDashboardScope(roles, scope)) {
    return null;
  }
  const ctx = await buildDashboardContext(scope, userId, roles, parseDashboardFilters(searchParams));
  const storeWhere = scopedStoreWhere(ctx);

  const [brands, stores, users, checklists, auditPlans] = await Promise.all([
    prisma.brand.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.store.findMany({
      where: storeWhere,
      select: {
        id: true,
        code: true,
        name: true,
        brand: { select: { id: true, code: true, name: true } },
      },
      orderBy: { code: "asc" },
      take: 500,
    }),
    prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        fullName: true,
        email: true,
        roleAssignments: { select: { roleKey: true } },
      },
      orderBy: { fullName: "asc" },
      take: 500,
    }),
    prisma.checklistForm.findMany({
      select: { id: true, name: true, version: true, status: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.auditPlan.findMany({
      select: { id: true, name: true, status: true, startDate: true, endDate: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    brands,
    stores,
    users: users.map((user) => ({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      roles: user.roleAssignments.map((item) => item.roleKey),
    })),
    checklists,
    auditPlans,
    actionPlanStatuses: ACTION_PLAN_STATUSES.map((status) => ({
      value: status,
      label: status,
    })),
    assignmentStatuses: ASSIGNMENT_STATUSES.map((status) => ({
      value: status,
      label: status,
    })),
    grades: DASHBOARD_GRADES.map((grade) => ({
      value: grade,
      label: grade,
    })),
  };
}

export async function getDashboard(scope: DashboardScope, userId: string, roles: string[], searchParams: URLSearchParams) {
  if (scope === "admin") return getAdminDashboard(userId, roles, searchParams);
  if (scope === "qam") return getQamDashboard(userId, roles, searchParams);
  if (scope === "qc") return getQcDashboard(userId, roles, searchParams);
  if (scope === "am") return getAmDashboard(userId, roles, searchParams);
  return getSmDashboard(userId, roles, searchParams);
}

function buildDashboardResponse({
  summary,
  charts,
  tables,
}: {
  summary: Record<string, unknown>;
  charts: Record<string, unknown>;
  tables: Record<string, unknown>;
}) {
  return {
    summary,
    charts,
    tables,
    filters: {},
    generatedAt: new Date().toISOString(),
  };
}

function escapeCsv(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function dashboardToCsv(data: any) {
  const rows: string[][] = [["Section", "Metric", "Value"]];
  for (const [key, value] of Object.entries(data.summary ?? {})) {
    rows.push(["summary", key, String(value)]);
  }

  return rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
}
