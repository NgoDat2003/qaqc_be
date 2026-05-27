---
phase: 1
title: Research Contract
status: completed
priority: P1
effort: 0.5h
dependencies: []
---

# Phase 1: Research Contract

## Overview

Xác nhận lại contract AM hiện tại và đối chiếu với yêu cầu FE trước khi sửa code. Phase này chỉ đọc code/docs/test, không thay đổi behavior.

## Requirements

- Functional: xác định chính xác field AM đang có, field thiếu, field cần chuẩn hóa.
- Non-functional: không làm drift contract các dashboard role khác.

## Architecture

`GET /api/dashboard/am` đi qua route dashboard chung, gọi `getAmDashboard()` trong `src/lib/dashboard.ts`. AM dùng lõi operational dashboard và bổ sung bảng riêng cho store scope AM.

## Related Code Files

- Read: `src/lib/dashboard.ts`
- Read: `src/app/api/dashboard/[scope]/route.ts`
- Read: `docs/dashboard-am-fe-handoff.md`
- Read: `docs/dashboard-sm-fe-handoff.md`
- Read: `tests/run-tests.ts`

## Implementation Steps

1. Kiểm tra `getAmDashboard()` hiện đang bổ sung field nào so với base dashboard.
2. Kiểm tra helper chung cho `errorsByGroup`, `actionPlanStatus`, `scoreTrend`.
3. Xác nhận `getDashboardFilters()` đã trả option đúng cho `scope=am`.
4. Ghi rõ các gap cần sửa trước khi chuyển phase 2.

## Success Criteria

- [ ] Có danh sách field AM cần bổ sung/chuẩn hóa.
- [ ] Không còn câu hỏi nghiệp vụ mở cho `scoreTrend`.
- [ ] Xác nhận không cần đổi schema DB.

## Risk Assessment

- Rủi ro: sửa helper chung có thể ảnh hưởng QAM/QC/SM. Giảm thiểu bằng test smoke cho các scope chính.
