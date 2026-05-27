import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "url";

export const E2E_PLAN_PREFIX = "E2E Portfolio ";

const EMPTY_GRAPH = Object.freeze({
  planIds: [],
  assignmentIds: [],
  auditIds: [],
  violationIds: [],
  actionPlanIds: [],
  actionPlanItemIds: [],
  evidenceIds: [],
  notificationIds: [],
});

export function parseArgs(argv) {
  return {
    dryRun: argv.includes("--dry-run") || argv.includes("--dry"),
  };
}

export function idsOf(rows) {
  return [...new Set(rows.map((row) => row?.id).filter(Boolean))];
}

export function hasIds(ids) {
  return Array.isArray(ids) && ids.length > 0;
}

function createEmptyGraph(prefix) {
  return {
    prefix,
    plans: [],
    ...EMPTY_GRAPH,
    counts: createCounts(EMPTY_GRAPH),
  };
}

function createCounts(graph) {
  return {
    plans: graph.planIds.length,
    assignments: graph.assignmentIds.length,
    audits: graph.auditIds.length,
    violations: graph.violationIds.length,
    actionPlans: graph.actionPlanIds.length,
    actionPlanItems: graph.actionPlanItemIds.length,
    evidences: graph.evidenceIds.length,
    notifications: graph.notificationIds.length,
  };
}

async function deleteByIds(model, ids) {
  if (!hasIds(ids)) return { count: 0 };
  return model.deleteMany({ where: { id: { in: ids } } });
}

async function findActionPlanItems(prisma, actionPlanIds, violationIds) {
  const conditions = [];
  if (hasIds(actionPlanIds)) {
    conditions.push({ actionPlanId: { in: actionPlanIds } });
  }
  if (hasIds(violationIds)) {
    conditions.push({ violationId: { in: violationIds } });
  }
  if (!conditions.length) return [];

  return prisma.actionPlanItem.findMany({
    where: { OR: conditions },
    select: { id: true },
  });
}

async function findEvidences(prisma, violationIds, actionPlanIds, actionPlanItemIds) {
  const conditions = [];
  if (hasIds(violationIds)) {
    conditions.push({ violationId: { in: violationIds } });
  }
  if (hasIds(actionPlanIds)) {
    conditions.push({ actionPlanId: { in: actionPlanIds } });
  }
  if (hasIds(actionPlanItemIds)) {
    conditions.push({ actionPlanItemId: { in: actionPlanItemIds } });
  }
  if (!conditions.length) return [];

  return prisma.evidence.findMany({
    where: { OR: conditions },
    select: { id: true },
  });
}

async function findNotifications(prisma, auditIds, actionPlanIds) {
  const conditions = [
    ...auditIds.flatMap((id) => [
      { link: { contains: `/audits/${id}` } },
      { link: { contains: `/audits/${id}/` } },
    ]),
    ...actionPlanIds.flatMap((id) => [
      { link: { contains: `/action-plans/${id}` } },
      { link: { contains: `/action-plans/${id}/` } },
    ]),
  ];

  if (!conditions.length) return [];

  return prisma.notification.findMany({
    where: { OR: conditions },
    select: { id: true },
  });
}

export async function collectE2eCleanupGraph(prisma, prefix = E2E_PLAN_PREFIX) {
  const plans = await prisma.auditPlan.findMany({
    where: { name: { startsWith: prefix } },
    select: { id: true, name: true },
  });
  const planIds = idsOf(plans);

  if (!hasIds(planIds)) {
    return createEmptyGraph(prefix);
  }

  const assignments = await prisma.auditAssignment.findMany({
    where: { planId: { in: planIds } },
    select: { id: true, auditId: true },
  });
  const assignmentIds = idsOf(assignments);
  const auditIds = [...new Set(assignments.map((item) => item.auditId).filter(Boolean))];

  const actionPlans = hasIds(auditIds)
    ? await prisma.actionPlan.findMany({
        where: { auditId: { in: auditIds } },
        select: { id: true },
      })
    : [];
  const actionPlanIds = idsOf(actionPlans);

  const violations = hasIds(auditIds)
    ? await prisma.violation.findMany({
        where: { auditId: { in: auditIds } },
        select: { id: true },
      })
    : [];
  const violationIds = idsOf(violations);

  const actionPlanItems = await findActionPlanItems(
    prisma,
    actionPlanIds,
    violationIds
  );
  const actionPlanItemIds = idsOf(actionPlanItems);

  const evidences = await findEvidences(
    prisma,
    violationIds,
    actionPlanIds,
    actionPlanItemIds
  );
  const evidenceIds = idsOf(evidences);

  const notifications = await findNotifications(prisma, auditIds, actionPlanIds);
  const notificationIds = idsOf(notifications);

  const graph = {
    prefix,
    plans,
    planIds,
    assignmentIds,
    auditIds,
    violationIds,
    actionPlanIds,
    actionPlanItemIds,
    evidenceIds,
    notificationIds,
  };

  return {
    ...graph,
    counts: createCounts(graph),
  };
}

export async function deleteE2eCleanupGraph(prisma, graph) {
  if (!hasIds(graph.planIds)) {
    return createCounts(EMPTY_GRAPH);
  }

  return prisma.$transaction(async (tx) => {
    const deleted = {};
    deleted.evidences = (await deleteByIds(tx.evidence, graph.evidenceIds)).count;
    deleted.notifications = (
      await deleteByIds(tx.notification, graph.notificationIds)
    ).count;
    deleted.actionPlanItems = (
      await deleteByIds(tx.actionPlanItem, graph.actionPlanItemIds)
    ).count;
    deleted.actionPlans = (
      await deleteByIds(tx.actionPlan, graph.actionPlanIds)
    ).count;
    deleted.correctionRequests = hasIds(graph.auditIds)
      ? (
          await tx.auditCorrectionRequest.deleteMany({
            where: { auditId: { in: graph.auditIds } },
          })
        ).count
      : 0;
    deleted.groupScores = hasIds(graph.auditIds)
      ? (
          await tx.groupScore.deleteMany({
            where: { auditId: { in: graph.auditIds } },
          })
        ).count
      : 0;
    deleted.violations = (
      await deleteByIds(tx.violation, graph.violationIds)
    ).count;

    if (hasIds(graph.assignmentIds)) {
      await tx.auditAssignment.updateMany({
        where: { id: { in: graph.assignmentIds } },
        data: { auditId: null },
      });
    }

    deleted.audits = (await deleteByIds(tx.audit, graph.auditIds)).count;
    deleted.assignments = (
      await deleteByIds(tx.auditAssignment, graph.assignmentIds)
    ).count;
    deleted.plans = (await deleteByIds(tx.auditPlan, graph.planIds)).count;

    return deleted;
  });
}

function assertCanDelete({ dryRun, env }) {
  if (dryRun) return;
  if (env.ALLOW_E2E_CLEANUP !== "YES") {
    throw new Error('Refusing cleanup. Set ALLOW_E2E_CLEANUP="YES".');
  }
}

function printReport({ logger, graph, dryRun, deleted }) {
  const lines = [
    `E2E cleanup prefix: ${graph.prefix}`,
    `Mode: ${dryRun ? "dry-run" : "delete"}`,
    `Plans: ${graph.counts.plans}`,
    `Assignments: ${graph.counts.assignments}`,
    `Audits: ${graph.counts.audits}`,
    `Violations: ${graph.counts.violations}`,
    `ActionPlans: ${graph.counts.actionPlans}`,
    `ActionPlanItems: ${graph.counts.actionPlanItems}`,
    `Evidences: ${graph.counts.evidences}`,
    `Notifications: ${graph.counts.notifications}`,
  ];

  if (deleted) {
    lines.push(`Deleted: ${JSON.stringify(deleted)}`);
  }

  for (const line of lines) {
    logger(line);
  }
}

export async function runCleanup({
  prisma,
  dryRun,
  env = process.env,
  prefix = E2E_PLAN_PREFIX,
  logger = console.log,
}) {
  assertCanDelete({ dryRun, env });

  const graph = await collectE2eCleanupGraph(prisma, prefix);
  if (dryRun || !hasIds(graph.planIds)) {
    printReport({ logger, graph, dryRun });
    return { mode: dryRun ? "dry-run" : "delete", graph, counts: graph.counts };
  }

  const deleted = await deleteE2eCleanupGraph(prisma, graph);
  printReport({ logger, graph, dryRun, deleted });
  return { mode: "delete", graph, counts: graph.counts, deleted };
}

async function main() {
  const prisma = new PrismaClient();
  const { dryRun } = parseArgs(process.argv.slice(2));

  try {
    await runCleanup({ prisma, dryRun });
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
