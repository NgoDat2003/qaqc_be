---
phase: 2
title: "Implement Cleanup Script"
status: completed
priority: P1
effort: "1.5h"
dependencies: [1]
---

# Phase 2: Implement Cleanup Script

## Overview

Tao CLI script noi bo de dry-run va cleanup du lieu E2E theo prefix. Khong tao API endpoint, khong them migration.

## Requirements

- Functional:
  - `npm run e2e:cleanup:dry` chi in report.
  - `npm run e2e:cleanup` xoa du lieu khi co `ALLOW_E2E_CLEANUP=YES`.
  - Script tra exit code `0` khi khong tim thay plan E2E.
- Non-functional:
  - Khong xoa master data.
  - Output ro rang cho FE/BE biet xoa bao nhieu record.
  - Code de test duoc bang dependency injection hoac export helper.

## Architecture

Create `scripts/cleanup-e2e-portfolio.mjs` with structure:

```js
import { PrismaClient } from "@prisma/client";

export const E2E_PLAN_PREFIX = "E2E Portfolio ";

export function parseArgs(argv) {
  return { dryRun: argv.includes("--dry-run") || argv.includes("--dry") };
}

export async function collectE2eCleanupGraph(prisma, prefix = E2E_PLAN_PREFIX) {
  // returns ids + counts, no deletes
}

export async function deleteE2eCleanupGraph(prisma, graph) {
  // deletes in safe order inside transaction
}

export async function runCleanup({ prisma, dryRun, env }) {
  // guard, collect, report, optionally delete
}
```

Use CommonJS/ESM compatible with current script style. Current `scripts/benchmark-analytics.mjs` uses ESM, so use `.mjs`.

Safe helper required:

```js
function idsOf(rows) {
  return rows.map((row) => row.id).filter(Boolean);
}

function hasIds(ids) {
  return Array.isArray(ids) && ids.length > 0;
}

async function findByIds(model, ids, select = { id: true }) {
  if (!hasIds(ids)) return [];
  return model.findMany({ where: { id: { in: ids } }, select });
}

async function deleteByIds(model, ids) {
  if (!hasIds(ids)) return { count: 0 };
  return model.deleteMany({ where: { id: { in: ids } } });
}
```

## Related Code Files

- Create: `scripts/cleanup-e2e-portfolio.mjs`
- Modify: `package.json`
- Optional modify: `.gitignore` only if script creates local report files, but preferred no files.

## Implementation Steps

1. Add scripts to `package.json`:

```json
{
  "e2e:cleanup:dry": "node scripts/cleanup-e2e-portfolio.mjs --dry-run",
  "e2e:cleanup": "node scripts/cleanup-e2e-portfolio.mjs"
}
```

2. Implement `parseArgs(argv)`:

```js
function parseArgs(argv) {
  return {
    dryRun: argv.includes("--dry-run") || argv.includes("--dry"),
  };
}
```

3. Implement guard:

```js
function assertCanDelete({ dryRun, env }) {
  if (dryRun) return;
  if (env.ALLOW_E2E_CLEANUP !== "YES") {
    throw new Error('Refusing cleanup. Set ALLOW_E2E_CLEANUP="YES".');
  }
}
```

4. Implement graph collection:

```js
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
const auditIds = assignments.map((item) => item.auditId).filter(Boolean);

const actionPlans = await prisma.actionPlan.findMany({
  where: { auditId: { in: auditIds } },
  select: { id: true },
});
const actionPlanIds = idsOf(actionPlans);

const violations = await prisma.violation.findMany({
  where: { auditId: { in: auditIds } },
  select: { id: true },
});
const violationIds = idsOf(violations);

const actionPlanItems = await prisma.actionPlanItem.findMany({
  where: {
    OR: [
      { actionPlanId: { in: actionPlanIds } },
      { violationId: { in: violationIds } },
    ],
  },
  select: { id: true },
});
const actionPlanItemIds = idsOf(actionPlanItems);

const evidences = await prisma.evidence.findMany({
  where: {
    OR: [
      { violationId: { in: violationIds } },
      { actionPlanId: { in: actionPlanIds } },
      { actionPlanItemId: { in: actionPlanItemIds } },
    ],
  },
  select: { id: true },
});
```

Every query after plans must short-circuit when its source id list is empty. Do not issue `OR: []` or `in: []` queries.

5. Implement notification matching:

```js
const notificationOr = [
  ...auditIds.flatMap((id) => [
    { link: { contains: `/audits/${id}` } },
    { link: { contains: `/audits/${id}/` } },
  ]),
  ...actionPlanIds.flatMap((id) => [
    { link: { contains: `/action-plans/${id}` } },
    { link: { contains: `/action-plans/${id}/` } },
  ]),
];
const notifications = notificationOr.length
  ? await prisma.notification.findMany({ where: { OR: notificationOr }, select: { id: true } })
  : [];
```

6. Implement delete order in a single transaction:

```js
await prisma.$transaction(async (tx) => {
  await deleteByIds(tx.evidence, evidenceIds);
  await deleteByIds(tx.notification, notificationIds);
  await deleteByIds(tx.actionPlanItem, actionPlanItemIds);
  await deleteByIds(tx.actionPlan, actionPlanIds);
  if (hasIds(auditIds)) {
    await tx.auditCorrectionRequest.deleteMany({ where: { auditId: { in: auditIds } } });
    await tx.groupScore.deleteMany({ where: { auditId: { in: auditIds } } });
  }
  await deleteByIds(tx.violation, violationIds);
  if (hasIds(assignmentIds)) {
    await tx.auditAssignment.updateMany({
      where: { id: { in: assignmentIds } },
      data: { auditId: null },
    });
  }
  await deleteByIds(tx.audit, auditIds);
  await deleteByIds(tx.auditAssignment, assignmentIds);
  await deleteByIds(tx.auditPlan, planIds);
});
```

Do not call delete helpers for these models: `user`, `store`, `brand`, `roleAssignment`, `checklistForm`, `checklistSection`, `checklistSectionItem`, `criteria`, `criteriaGroup`.

7. Print report:

```txt
E2E cleanup prefix: E2E Portfolio
Mode: dry-run | delete
Plans: 2
Assignments: 2
Audits: 2
Violations: 4
ActionPlans: 1
ActionPlanItems: 4
Evidences: 6
Notifications: 3
```

## Success Criteria

- [ ] New CLI script exists and exports helper functions for tests.
- [ ] `package.json` has dry-run and delete commands.
- [ ] Running without guard in delete mode fails before any delete.
- [ ] Dry-run never calls `deleteMany` or `updateMany`.
- [ ] Delete mode does not target master data models.
- [ ] Empty id lists do not call Prisma with `in: []` or `OR: []`.
- [ ] Console output does not print database URLs or secrets.

## Risk Assessment

| Risk | Mitigation |
| --- | --- |
| Prisma transaction too large | E2E flow is tiny; acceptable. If many records, still under reasonable size. |
| Cyclic audit-assignment relation blocks delete | Null `AuditAssignment.auditId` before deleting audits. |
| Empty `in: []` queries behave oddly | Helper should short-circuit no ids, or use safe wrappers. |
| Console output exposes DB URL | Do not print `DATABASE_URL`; only print counts and prefix. |
| Evidence uploaded but not attached | Do not cleanup; no safe link to E2E plan exists. |
