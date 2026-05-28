---
phase: 1
title: "Supabase Seed Mapping"
status: completed
priority: P1
effort: "0.5h"
dependencies: []
---

# Phase 1: Supabase Seed Mapping

## Overview

Ghi lai bo data co dinh trong Supabase dev de FE E2E khong phai tu do account/store/checklist. Muc tieu la golden flow chay on dinh va de quay portfolio.

## Requirements

- Functional: docs phai co QAM, QC, SM, AM, store, checklist published co san.
- Non-functional: khong doc/ghi password tu database; khong expose connection string; khong reset data.

## Architecture

FE E2E se dung mapping:

```txt
QAM login -> tao audit plan E2E Portfolio <timestamp>
QC login -> cham assignment cua store CH0001
QAM login -> xem audit result + tao AP
SM login -> update + submit AP cua CH0001
QAM login -> close AP
```

Verified Supabase data:

```txt
QAM: ngoclam.le3@gmail.com / Tran Van An
QC: gianguyen.7kang28@gmail.com / Vu Van An
SM: store-manager-152@qualityops.demo / Pham Gia Chi
AM: thanh7ke55@yahoo.com / Phan Gia An
Store: CH0001 / Bep Trung Tam Ngo Quyen / storeId cmpewvhat011rwdgnmoh5qsfd
Checklist: cmpccz5ax0025p3fyqqlf1bhj / Checklist van hanh cua hang - Demo / v6.0.0
```

## Related Code Files

- Modify: `docs/audit-results-action-plans-fe-handoff.md`
- Optional read: `docs/qc-fe-handoff.md`
- Optional read: `docs/qam-fe-handoff.md`

## Implementation Steps

1. Add section `Golden E2E Seed Mapping`.
2. Include account emails and display names.
3. Include store id/code/name, brand, manager, AM.
4. Include checklist id/name/version/status.
5. State `E2E_PASSWORD = "Test@1234"` if FE uses current E2E constants.
6. State relation guarantees:
   - store is active;
   - store has SM manager;
   - store has AM;
   - checklist is published;
   - QC account is active and has `qc_auditor`.
7. State FE should not create/update master data in golden flow.

## Success Criteria

- [ ] FE can copy mapping directly into E2E constants.
- [ ] Docs do not include DB URL or real password hash.
- [ ] Mapping references active existing data.
- [ ] Golden flow prefix remains `E2E Portfolio `.

## Risk Assessment

| Risk | Mitigation |
| --- | --- |
| Seed data later deleted/changed | Re-run Supabase query before final video; update mapping if needed. |
| FE uses wrong SM/store pair | Docs explicitly list store.manager = SM account. |
| Test data polluted by old runs | Run `npm.cmd run e2e:cleanup:dry` then guarded cleanup when user approves. |
