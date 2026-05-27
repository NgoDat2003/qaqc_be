---
title: "E2E Golden Seed Handoff"
description: "Bo sung seed mapping co dinh cho FE E2E portfolio va chuan hoa quy uoc render upload image qua reverse proxy."
status: completed
priority: P1
branch: "codex/e2e-portfolio-cleanup"
tags: ["e2e", "fe-handoff", "supabase", "portfolio"]
blockedBy: []
blocks: []
created: "2026-05-27T04:13:08.035Z"
createdBy: "ck:plan"
source: skill
---

# E2E Golden Seed Handoff

## Overview

Bo sung tai lieu handoff cho FE de chay golden E2E portfolio on dinh: dung account/store/checklist co san trong Supabase dev, khong tu do data, khong tao master data moi, va render image bang relative URL qua Next proxy.

## Supabase Data Snapshot

Du lieu da query tu Supabase dev bang Prisma hien tai:

| Type | Value |
| --- | --- |
| Users | 962 |
| QAM | 6 |
| QC | 30 |
| SM | 876 |
| AM | 45 |
| Stores | 500 |
| Published checklist | 1 |

Golden seed de xuat:

| Role/Data | ID/Email/Code | Display |
| --- | --- | --- |
| Admin | `admin@qualityops.com` | Quan Tri He Thong |
| QAM | `ngoclam.le3@gmail.com` | Tran Van An |
| QC | `gianguyen.7kang28@gmail.com` | Vu Van An |
| SM | `store-manager-152@qualityops.demo` | Pham Gia Chi |
| AM | `thanh7ke55@yahoo.com` | Phan Gia An |
| Executive | `executive-viewer-1@qualityops.demo` | Do Thanh Nam |
| Store | `CH0001` | Bep Trung Tam Ngo Quyen |
| Store ID | `cmpewvhat011rwdgnmoh5qsfd` | active, manager + AM assigned |
| Brand | `CLOUD` | Bep Trung Tam |
| Checklist | `cmpccz5ax0025p3fyqqlf1bhj` | Checklist van hanh cua hang - Demo v6.0.0 |

Assumption cho FE E2E: password demo van dung `Test@1234` nhu cac docs/account constants hien co.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Supabase Seed Mapping](./phase-01-supabase-seed-mapping.md) | Completed |
| 2 | [Update FE Image Convention](./phase-02-update-fe-image-convention.md) | Completed |
| 3 | [Validate Handoff](./phase-03-validate-handoff.md) | Completed |

## Dependencies

- Existing cleanup plan: `plans/260527-e2e-portfolio-cleanup/plan.md`.
- Existing FE handoff doc: `docs/audit-results-action-plans-fe-handoff.md`.
- Supabase dev data currently available via Prisma connection.

## Out Of Scope

- Khong reset/reseed DB.
- Khong tao migration/schema.
- Khong tao API moi.
- Khong dua correction request vao golden flow dau tien.
- Khong bat dashboard global count lam dieu kien pass E2E.

## Definition Of Done

- Docs co block "Golden E2E Seed Mapping" voi QAM/QC/SM/store/checklist co dinh.
- Docs sua image convention: browser FE dung `/uploads/...` relative khi co Next proxy; chi prefix BE origin neu khong proxy.
- Docs chot golden flow happy path va nhung gi khong test trong vong dau.
- Chay dry-run cleanup va query Supabase mapping de verify data van ton tai.
- `git diff --check` pass.
