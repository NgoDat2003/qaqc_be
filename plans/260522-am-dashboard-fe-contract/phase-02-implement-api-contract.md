---
phase: 2
title: Implement API Contract
status: completed
priority: P1
effort: 2h
dependencies:
  - 1
---

# Phase 2: Implement API Contract

## Overview

Sửa runtime `GET /api/dashboard/am` để trả đủ dữ liệu FE cần cho mockup AM, đặc biệt là trend 5 tháng mới nhất và bảng Action Plan theo store.

## Requirements

- Functional: AM chỉ xem dữ liệu trong store scope của mình.
- Functional: `charts.scoreTrend` lấy tối đa 5 tháng mới nhất trong scope AM, không bị giới hạn bởi `from/to`.
- Functional: `tables.actionPlansByStore[]` có đủ số liệu mở/quá hạn/đã đóng/tổng.
- Non-functional: không thêm query quá nặng, ưu tiên tái dùng helper hiện có.

## Architecture

Luồng dữ liệu:

```txt
GET /api/dashboard/am
  -> role guard am
  -> buildDashboardContext(scope=am)
  -> getOperationalDashboard()
  -> getAmDashboard() bổ sung AM-specific data
```

## Related Code Files

- Modify: `src/lib/dashboard.ts`
- Modify if needed: `tests/run-tests.ts`

## Implementation Steps

1. Thêm hoặc tái dùng helper trend để query audit theo `auditTrendWhere(ctx)` cho AM.
2. Trong `getAmDashboard()`, override `charts.scoreTrend` bằng trend 5 tháng mới nhất.
3. Đảm bảo shape của mỗi item:
   ```ts
   { label: string; date: string | null; averageScore: number; auditCount: number }
   ```
4. Mở rộng `getActionPlansByStore()` để trả:
   ```ts
   {
     store: { id: string; code: string; name: string }
     openCount: number
     overdueCount: number
     closedCount: number
     totalCount: number
     maxOverdueDays: number
     latestDueDate: string | null
   }
   ```
5. Kiểm tra `charts.errorsByGroup[]` có `count` alias và `charts.actionPlanStatus` đủ 4 key.
6. Giữ nguyên filter date cho summary/table ngoài `scoreTrend`.

## Success Criteria

- [ ] AM score trend không rỗng khi filter `from/to` hẹp nhưng store có audit lịch sử.
- [ ] Action Plan theo store đủ field mới.
- [ ] Không làm thay đổi quyền đọc dữ liệu ngoài AM scope.

## Risk Assessment

- Rủi ro: `auditTrendWhere()` bỏ date filter nhưng vẫn phải tôn trọng store/brand/checklist/plan/grade/risk filters. Cần review kỹ query where.
- Rủi ro: quá nhiều audit lịch sử có thể query chậm. Nếu benchmark chậm, giới hạn select field tối thiểu và aggregate trong memory theo tháng.
