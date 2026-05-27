---
phase: 3
title: Update Docs
status: completed
priority: P2
effort: 1h
dependencies:
  - 2
---

# Phase 3: Update Docs

## Overview

Cập nhật tài liệu handoff để FE biết chính xác response runtime của Dashboard AM, tránh phải đoán field hoặc fake data.

## Requirements

- Functional: docs mô tả đúng endpoint, filter, summary, chart, table.
- Non-functional: docs ngắn, đủ dùng, đồng bộ style với SM dashboard docs.

## Architecture

Docs chính cho FE là `docs/dashboard-am-fe-handoff.md`. File tổng hợp `docs/dashboard-fe-handoff.md` chỉ cần giữ link role nếu chưa đổi endpoint.

## Related Code Files

- Modify: `docs/dashboard-am-fe-handoff.md`
- Modify if needed: `docs/dashboard-fe-handoff.md`

## Implementation Steps

1. Viết rõ endpoint:
   ```txt
   GET /api/dashboard/am
   ```
2. Ghi rõ query params hỗ trợ:
   `from`, `to`, `brandId`, `storeId`, `planId`, `checklistId`, `assignmentStatus`, `actionPlanStatus`, `grade`, `riskOnly`, `overdueOnly`.
3. Ghi rõ `scoreTrend` lấy 5 tháng mới nhất và không theo `from/to`.
4. Ghi schema cho:
   - `charts.scoreTrend[]`
   - `charts.errorsByGroup[]`
   - `charts.actionPlanStatus`
   - `tables.storeRanking[]`
   - `tables.actionPlansByStore[]`
5. Ghi FE notes:
   - AM read-only.
   - `F-CCP` map vào `autoCcpViolationCount`.
   - Link từ dashboard sang detail store/audit/AP.

## Success Criteria

- [ ] FE đọc docs là biết render mockup AM không cần hỏi thêm field.
- [ ] Docs không mâu thuẫn với response runtime.
- [ ] Không ghi field chưa được BE trả thật.

## Risk Assessment

- Rủi ro: docs viết trước code dễ lệch runtime. Phase này chạy sau phase 2 để ghi đúng field đã implement.
