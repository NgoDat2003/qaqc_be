---
phase: 3
title: "Test Cleanup Safety"
status: completed
priority: P1
effort: "1h"
dependencies: [2]
---

# Phase 3: Test Cleanup Safety

## Overview

Them test vao runner hien co de dam bao cleanup chi xoa du lieu E2E, co guard, co dry-run, va khong goi delete master data.

## Requirements

- Functional:
  - Test dry-run report dung count.
  - Test delete mode can env guard.
  - Test graph collection tu plan prefix.
  - Test delete order co xoa evidence truoc parent.
  - Test khong xoa master data.
  - Test empty id list khong goi Prisma voi `in: []`/`OR: []`.
  - Test partial failed E2E flow van cleanup duoc.
  - Test evidence chua attach khong bi xoa broad.
- Non-functional:
  - Khong can DB thuc; dung mock Prisma pattern hien co trong `tests/run-tests.ts`.
  - Test nhanh, chay chung `npm.cmd run test`.

## Architecture

Use existing test runner and fake Prisma model helpers in `tests/run-tests.ts`.

Import script helpers:

```ts
const cleanup = await import("../scripts/cleanup-e2e-portfolio.mjs");
```

Because TypeScript may complain about `.mjs` import typing, if needed use dynamic import with `as any`:

```ts
const cleanup: any = await import("../scripts/cleanup-e2e-portfolio.mjs");
```

## Related Code Files

- Modify: `tests/run-tests.ts`
- Read: `scripts/cleanup-e2e-portfolio.mjs`

## Implementation Steps

1. Add test: dry-run does not delete.

Pseudo setup:

```ts
const calls: string[] = [];
const prisma = fakeCleanupPrisma({
  plans: [{ id: "plan-e2e", name: "E2E Portfolio 202605270101" }],
  assignments: [{ id: "assignment-1", auditId: "audit-1" }],
  audits: [{ id: "audit-1" }],
  violations: [{ id: "violation-1" }],
  actionPlans: [{ id: "ap-1" }],
  actionPlanItems: [{ id: "api-1" }],
  evidences: [{ id: "img-1" }],
  notifications: [{ id: "noti-1" }],
  calls,
});
await cleanup.runCleanup({ prisma, dryRun: true, env: {} });
assert.equal(calls.some((call) => call.includes("deleteMany")), false);
```

2. Add test: delete without guard fails.

```ts
await assert.rejects(
  () => cleanup.runCleanup({ prisma, dryRun: false, env: {} }),
  /ALLOW_E2E_CLEANUP/
);
```

3. Add test: delete with guard deletes only expected models.

Expected delete/update calls:

```txt
evidence.deleteMany
notification.deleteMany
actionPlanItem.deleteMany
actionPlan.deleteMany
auditCorrectionRequest.deleteMany
groupScore.deleteMany
violation.deleteMany
auditAssignment.updateMany
audit.deleteMany
auditAssignment.deleteMany
auditPlan.deleteMany
```

Forbidden calls:

```txt
user.deleteMany
store.deleteMany
brand.deleteMany
roleAssignment.deleteMany
checklistForm.deleteMany
criteria.deleteMany
criteriaGroup.deleteMany
```

4. Add test: no E2E plans is safe no-op.

```ts
const result = await cleanup.runCleanup({ prisma: emptyPrisma, dryRun: false, env: { ALLOW_E2E_CLEANUP: "YES" } });
assert.equal(result.counts.plans, 0);
assert.equal(calls.length, 0);
```

5. Add test: wrong prefix is ignored.

Plan names:

```txt
Portfolio E2E 123
Monthly Audit
E2EPortfolio 123
```

Expected: zero plan ids selected.

6. Add test: partial failed E2E flow.

Data:

```txt
AuditPlan: E2E Portfolio 202605270101
AuditAssignment: planId set, auditId null
Audits: none
ActionPlans: none
```

Expected:

```txt
auditAssignment.deleteMany
auditPlan.deleteMany
no audit/actionPlan/violation delete calls with empty id filters
```

7. Add test: attached evidence deleted, unattached evidence ignored.

Data:

```txt
Evidence img-attached: violationId = violation-1
Evidence img-orphan: violationId/actionPlanId/actionPlanItemId = null
```

Expected:

```txt
delete evidence only img-attached
do not query or delete orphan evidence by date/path/name
```

8. Add test: notification cleanup is link-scoped.

Data:

```txt
Notification link = /audits/audit-1
Notification link = /action-plans/ap-1
Notification link = /dashboard
```

Expected:

```txt
delete first two only
keep dashboard notification
```

9. Add test: output does not expose secrets.

If tests capture logger output, assert it does not contain:

```txt
postgresql://
DATABASE_URL
DIRECT_URL
```

## Success Criteria

- [ ] `npm.cmd run test` passes.
- [ ] Tests fail if script calls delete on master data models.
- [ ] Tests prove dry-run does not mutate.
- [ ] Tests prove env guard works.
- [ ] Tests prove evidence delete happens before parent delete.
- [ ] Tests prove partial failed E2E flow is cleaned without broad deletes.
- [ ] Tests prove unattached evidence is not deleted.
- [ ] Tests prove notification cleanup is link-scoped.

## Risk Assessment

| Risk | Mitigation |
| --- | --- |
| Dynamic import `.mjs` awkward in TS runner | Keep assertions simple; use `any` import if needed. |
| Mock Prisma grows noisy | Create local fake inside tests near cleanup cases. |
| Test overfits exact order too much | Assert critical relative order: evidence before violation/AP item/AP; not every call line if brittle. |
| Too many safety tests slow runner | Keep Prisma mocked; do not hit Supabase/local DB. |
