---
title: "E2E Portfolio Cleanup"
description: "Them CLI cleanup chi xoa du lieu golden flow E2E theo AuditPlan prefix, khong reset database demo."
status: completed
priority: P1
branch: "codex/e2e-portfolio-cleanup"
tags: ["e2e", "cleanup", "portfolio", "database"]
blockedBy: []
blocks: []
created: "2026-05-27T02:44:11.230Z"
createdBy: "ck:plan"
source: skill
---

# E2E Portfolio Cleanup

## Overview

Them script noi bo de don du lieu auto testing sinh ra tu golden flow FE. Script chi xoa cac record bat dau tu `audit_plans.name` co prefix `E2E Portfolio `, giu nguyen users, stores, brands, checklist, criteria va analytics/demo data hien co.

## Scope

- In scope: cleanup audit plan E2E, assignments, audits, violations, group scores, action plans/items, correction requests, evidences da attach, notifications lien quan.
- Out of scope: reset/reseed database, xoa master data, tao API reset public, them cot `testRunId`, cleanup evidence chua attach, cleanup anh vat ly tren disk.
- Guard: run that bat buoc `ALLOW_E2E_CLEANUP=YES`; dry-run khong can guard.

## Scenario Evaluation Decisions

| Scenario | Decision | Reason |
| --- | --- | --- |
| Xoa nham users/stores/brands/checklist/criteria | Fix in plan | High blast radius; phase 3 bat buoc test forbidden master-data deletes. |
| Empty id arrays trong Prisma `in: []` | Fix in plan | De tranh query/delete thua hoac behavior kho doan; phase 2 them safe helper. |
| Dry-run mutate database | Fix in plan | Dry-run la safety gate; phase 3 assert khong co `deleteMany/updateMany`. |
| FK giua assignment va audit chan delete | Fix in plan | Phase 2 dung `auditAssignment.updateMany({ auditId: null })` truoc khi xoa audit. |
| Notification link thay doi format | Fix in plan | Chi xoa notification match audit/AP link; khong xoa theo text mo ho. |
| FE dat sai prefix | Fix in docs | Cleanup no-op la dung; docs bat buoc exact prefix `E2E Portfolio `. |
| Partial failed E2E chi co plan/assignment, chua co audit/AP | Fix in tests | Day la case hay gap khi FE test fail giua chung. |
| Evidence upload nhung chua attach vao violation/AP item | Not in scope | Khong co duong truy vet an toan tu plan prefix; broad delete se nguy hiem hon viec de lai orphan. |
| Cleanup file vat ly trong `public/uploads/evidence` | Not in scope | DB cleanup la muc tieu hien tai; file cleanup can flag rieng neu that su phinh dung luong. |
| Batch cleanup cho hang ngan E2E records | Not needed now | Golden flow E2E nho; neu sau nay record lon moi tach batching. |
| In log DB URL/env secret | Fix in plan | CLI chi duoc in count/model/prefix, khong in connection string. |

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Research Cleanup Scope](./phase-01-research-cleanup-scope.md) | Completed |
| 2 | [Implement Cleanup Script](./phase-02-implement-cleanup-script.md) | Completed |
| 3 | [Test Cleanup Safety](./phase-03-test-cleanup-safety.md) | Completed |
| 4 | [Document FE Workflow](./phase-04-document-fe-workflow.md) | Completed |

## Target Commands

```bash
npm run e2e:cleanup:dry
ALLOW_E2E_CLEANUP=YES npm run e2e:cleanup
```

PowerShell:

```powershell
npm.cmd run e2e:cleanup:dry
$env:ALLOW_E2E_CLEANUP="YES"; npm.cmd run e2e:cleanup
```

## Dependencies

- Prisma Client from `@prisma/client`.
- Existing schema in `prisma/schema.prisma`.
- Existing test runner `npm.cmd run test`.

## Definition Of Done

- Dry-run prints counts and deletes nothing.
- Real run deletes only graph rooted at `E2E Portfolio ` audit plans.
- No delete calls target `user`, `store`, `brand`, `checklistForm`, `criteria`, `criteriaGroup`, `roleAssignment`.
- Tests cover dry-run, guard, graph collection, empty id guards, partial failed flow, notification/evidence cleanup, no-plan safe no-op.
- `npm.cmd run test`, `npx.cmd tsc --noEmit`, `npm.cmd run build` pass.

## Open Questions

None.
