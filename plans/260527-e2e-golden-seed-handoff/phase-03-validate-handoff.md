---
phase: 3
title: "Validate Handoff"
status: completed
priority: P2
effort: "0.5h"
dependencies: [1, 2]
---

# Phase 3: Validate Handoff

## Overview

Kiem tra tai lieu sau khi cap nhat: seed mapping ton tai, image convention khop reverse proxy, cleanup command khong gay nham lan.

## Requirements

- Functional: docs phai du cho FE viet golden E2E ma khong hoi lai BE.
- Non-functional: khong chay cleanup that trong validation; chi dry-run.

## Related Code Files

- Read/verify: `docs/audit-results-action-plans-fe-handoff.md`
- Read/verify: `plans/260527-e2e-portfolio-cleanup/plan.md`

## Implementation Steps

1. Run Supabase/Prisma query again to verify mapping still exists.
2. Run `npm.cmd run e2e:cleanup:dry` only.
3. Run `git diff --check`.
4. Confirm docs contain:
   - `Golden E2E Seed Mapping`;
   - `E2E Portfolio `;
   - `/uploads/evidence/...`;
   - warning not to cleanup while E2E is running.
5. Do not run guarded cleanup unless user explicitly asks.

## Success Criteria

- [ ] Supabase mapping query returns QAM/QC/SM/store/checklist.
- [ ] Dry-run cleanup works and deletes nothing.
- [ ] Docs have no DB secret.
- [ ] `git diff --check` passes.

## Risk Assessment

| Risk | Mitigation |
| --- | --- |
| Cleanup true accidentally run | Validation only uses dry-run; guarded cleanup needs explicit user command. |
| Mapping becomes stale | Treat mapping as demo seed snapshot; re-run before final recording. |
| FE assumes dashboard totals stable | Docs should say dashboard is smoke only, not golden pass condition. |
