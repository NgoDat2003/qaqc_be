---
phase: 4
title: "Document FE Workflow"
status: completed
priority: P2
effort: "0.5h"
dependencies: [2, 3]
---

# Phase 4: Document FE Workflow

## Overview

Cap nhat docs de FE biet cach dat prefix, luc nao chay cleanup, va nhung gi cleanup khong xoa.

## Requirements

- Functional:
  - FE doc duoc quy uoc plan name.
  - FE biet command dry-run va cleanup.
  - FE biet khong can tu cleanup tung API.
- Non-functional:
  - Tai lieu ngan, tap trung golden flow.
  - Khong lap lai toan bo docs audit/AP.

## Architecture

Docs update target:

- Primary: `docs/audit-results-action-plans-fe-handoff.md`
- Optional: `docs/qc-fe-handoff.md` neu can nhac prefix trong QC E2E.

Add a section:

```md
## E2E Portfolio Cleanup

Golden flow E2E phai tao audit plan voi prefix:

`E2E Portfolio <timestamp>`

BE cleanup command:

`npm.cmd run e2e:cleanup:dry`
`$env:ALLOW_E2E_CLEANUP="YES"; npm.cmd run e2e:cleanup`

Cleanup chi xoa du lieu sinh tu audit plan prefix nay:
- audit plan / assignment / audit
- violation / group score
- action plan / item
- evidence da attach
- notification link audit/AP

Cleanup khong xoa:
- user / store / brand
- checklist / criteria
- analytics demo data khac
- evidence da upload nhung chua attach vao loi/AP item
- file vat ly trong public/uploads/evidence
```

## Related Code Files

- Modify: `docs/audit-results-action-plans-fe-handoff.md`
- Optional modify: `docs/qc-fe-handoff.md`

## Implementation Steps

1. Add section near E2E Fix Guide in `audit-results-action-plans-fe-handoff.md`.
2. Mention FE must not create master data in golden flow.
3. Mention cleanup should run:
   - before rerun after failed/debug test;
   - before recording final portfolio video;
   - not after final successful video if user wants to keep demo result.
4. Mention FE should assert by `planName`/status, not global dashboard totals.
5. Keep command examples Windows-first because current workspace is Windows.
6. Warn that a wrong prefix will intentionally no-op, not fallback to broad cleanup.

## Success Criteria

- [ ] Docs contain exact prefix `E2E Portfolio `.
- [ ] Docs contain dry-run and real cleanup commands.
- [ ] Docs say cleanup does not delete master data.
- [ ] Docs say FE does not need to call cleanup API.
- [ ] Docs say golden flow excludes Admin CRUD and Checklist CRUD.

## Risk Assessment

| Risk | Mitigation |
| --- | --- |
| FE uses wrong prefix | Put prefix in code block and repeat exact trailing space meaning. |
| FE expects cleanup via HTTP | State CLI only, no public endpoint. |
| Docs too long | Add one compact section, link existing flow docs. |
| FE expects uploaded-but-unattached images to disappear | State that only attached evidence DB rows are cleaned. |
