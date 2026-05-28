---
phase: 1
title: "Research Cleanup Scope"
status: completed
priority: P1
effort: "0.5h"
dependencies: []
---

# Phase 1: Research Cleanup Scope

## Overview

Chot pham vi xoa du lieu E2E dua tren graph hien tai trong Prisma schema. Muc tieu la de phase implement khong phai doan table nao can xoa, table nao bat buoc giu.

## Requirements

- Functional: xac dinh tat ca record sinh ra tu golden flow `E2E Portfolio <timestamp>`.
- Non-functional: khong lam cham hoac anh huong dataset demo; khong dung destructive global delete.

## Architecture

Graph can cleanup:

```txt
AuditPlan(name startsWith "E2E Portfolio ")
  -> AuditAssignment(planId)
      -> Audit(auditId on assignment)
          -> GroupScore(auditId)
          -> Violation(auditId)
          -> Evidence(violationId) only when attached
              -> ActionPlanItem(violationId)
          -> ActionPlan(auditId)
              -> Evidence(actionPlanId) only when attached
              -> ActionPlanItem(actionPlanId)
                  -> Evidence(actionPlanItemId) only when attached
          -> AuditCorrectionRequest(auditId)
  -> Notification(link contains audit/action-plan ids)
```

Important schema notes:

- `AuditAssignment.planId` has `onDelete: Cascade`, but rely on explicit delete for reportable counts.
- `GroupScore.auditId`, `Violation.auditId`, `AuditCorrectionRequest.auditId` cascade from audit.
- `ActionPlanItem.actionPlanId` cascades from action plan.
- `Evidence` relations use `onDelete: SetNull`, so delete evidence before parents to avoid orphan rows.
- Evidence uploaded but never attached is intentionally not cleaned because it cannot be safely traced back to the E2E plan prefix.
- `Notification` only has user FK, no audit/AP FK, so delete by link.

## Related Code Files

- Read: `prisma/schema.prisma`
- Read: `src/app/api/audits/[id]/action-plan/route.ts`
- Read: `src/app/api/action-plans/[id]/submit/route.ts`
- Read: `src/lib/audit-workflow.ts`
- Modify later: `package.json`
- Create later: `scripts/cleanup-e2e-portfolio.mjs`
- Modify later: `tests/run-tests.ts`

## Implementation Steps

1. Confirm prefix constant:

```ts
const E2E_PLAN_PREFIX = "E2E Portfolio ";
```

2. Identify plan ids:

```ts
const plans = await prisma.auditPlan.findMany({
  where: { name: { startsWith: E2E_PLAN_PREFIX } },
  select: { id: true, name: true },
});
```

3. Identify assignment/audit ids:

```ts
const assignments = await prisma.auditAssignment.findMany({
  where: { planId: { in: planIds } },
  select: { id: true, auditId: true },
});
const auditIds = assignments.map((item) => item.auditId).filter(Boolean);
```

4. Identify violations/action plans/items/evidence/notifications from ids.
5. Define exact delete order for phase 2.
6. Confirm no master-data model is in delete list.
7. Confirm all id-list filters use safe empty-array guards.

## Success Criteria

- [ ] Plan lists every table touched by cleanup.
- [ ] Plan explicitly says which tables are never deleted.
- [ ] Evidence `SetNull` risk is addressed before implementation.
- [ ] Notification cleanup strategy is explicit.

## Risk Assessment

| Risk | Mitigation |
| --- | --- |
| Xoa nham demo data | Filter only by `auditPlan.name startsWith E2E_PLAN_PREFIX` |
| Evidence orphan | Delete evidence rows before deleting parents |
| Unattached evidence remains | Accept for now; broad cleanup is riskier than small orphan rows |
| Notification sot | Delete link matching `/audits/{id}` and `/action-plans/{id}` |
| Prefix typo from FE | Cleanup no-op is safer than broad delete |
