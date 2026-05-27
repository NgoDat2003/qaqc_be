---
title: AM Dashboard FE Contract
description: Bổ sung contract Dashboard AM để FE render đủ mockup khu vực AM
status: completed
priority: P2
branch: codex/dashboard-role-specific-v2
tags:
  - dashboard
  - am
  - fe-contract
  - api
blockedBy: []
blocks: []
created: '2026-05-22T08:50:44.454Z'
createdBy: 'ck:plan'
source: skill
---

# AM Dashboard FE Contract

## Overview

Mục tiêu là hoàn thiện `GET /api/dashboard/am` cho màn Dashboard khu vực AM: đủ summary, chart, table, filter contract cho FE; dữ liệu vẫn bị giới hạn theo store AM phụ trách. Không đổi schema database, không thêm endpoint mới.

Quyết định đã chốt: `charts.scoreTrend` của AM lấy tối đa 5 tháng audit mới nhất trong scope AM, không bị giới hạn bởi `from/to`. Các card/table còn lại vẫn theo filter ngày.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Research Contract](./phase-01-research-contract.md) | Completed |
| 2 | [Implement API Contract](./phase-02-implement-api-contract.md) | Completed |
| 3 | [Update Docs](./phase-03-update-docs.md) | Completed |
| 4 | [Test And Validate](./phase-04-test-and-validate.md) | Completed |

## Dependencies

- Source chính: `src/lib/dashboard.ts`
- Route hiện có: `src/app/api/dashboard/[scope]/route.ts`
- Docs FE hiện có: `docs/dashboard-am-fe-handoff.md`
- Test runner hiện có: `tests/run-tests.ts`

## Non-goals

- Không đổi Prisma schema.
- Không thêm migration.
- Không thêm endpoint dashboard mới.
- Không sửa UI FE.
- Không thay đổi contract Admin/QAM/QC/SM ngoài helper chung nếu cần giữ output đồng nhất.
