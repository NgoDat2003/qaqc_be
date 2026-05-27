---
phase: 4
title: Test And Validate
status: completed
priority: P1
effort: 1h
dependencies:
  - 2
  - 3
---

# Phase 4: Test And Validate

## Overview

Thêm test để khóa contract AM dashboard và chạy bộ kiểm tra trước khi ship.

## Requirements

- Functional: test đúng scope AM, trend, chart, table.
- Non-functional: build pass, không lỗi TypeScript.

## Architecture

Test chạy bằng test runner hiện có trong `tests/run-tests.ts`. Không tạo mock rời nếu test hiện tại đã dùng data seed/in-memory pattern có sẵn.

## Related Code Files

- Modify: `tests/run-tests.ts`
- Run: `npm run test`
- Run: `npx tsc --noEmit`
- Run: `npm run build`

## Implementation Steps

1. Thêm test AM chỉ thấy store trong scope của mình.
2. Thêm test `charts.scoreTrend`:
   - tối đa 5 điểm;
   - có shape `label/date/averageScore/auditCount`;
   - không bị rỗng khi filter ngày hẹp nhưng có audit lịch sử.
3. Thêm test `charts.actionPlanStatus` luôn có `draft/submitted/rejected/closed`.
4. Thêm test `charts.errorsByGroup[].count === errorCount`.
5. Thêm test `tables.actionPlansByStore[]` có `totalCount/maxOverdueDays/latestDueDate`.
6. Chạy full validation:
   ```txt
   npm run test
   npx tsc --noEmit
   npm run build
   git diff --check
   ```

## Success Criteria

- [ ] Tất cả test pass.
- [ ] TypeScript pass.
- [ ] Build pass.
- [ ] Diff không có whitespace lỗi.

## Risk Assessment

- Rủi ro: dữ liệu test không có đủ tháng audit để kiểm tra trend. Nếu vậy, bổ sung fixture trong test theo pattern hiện có, không phụ thuộc Supabase live data.
