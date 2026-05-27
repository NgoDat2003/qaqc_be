# Scenario Report: AM Dashboard FE Contract

Target: `GET /api/dashboard/am`

## Dimensions Analyzed

- User Types
- Input Extremes
- Timing
- Scale
- State Transitions
- Error Cascades
- Authorization
- Data Integrity
- Integration
- Business Logic

## Dimensions Skipped

- Environment: BE API contract không phụ thuộc viewport/mobile.
- Compliance: không thêm dữ liệu PII mới, không đổi retention/audit log trong task này.

## Scenario Table

| # | Dimension | Scenario | Severity | Expected Behavior |
|---|---|---|---|---|
| 1 | User Types | AM có nhiều store phụ trách gọi dashboard | High | Chỉ tổng hợp dữ liệu các store thuộc scope AM đó. |
| 2 | User Types | AM không được gán store nào | High | Trả dashboard rỗng an toàn, không leak dữ liệu store khác. |
| 3 | User Types | QAM/company_admin gọi `/api/dashboard/am` | High | Trả 403 nếu role không phải `am` theo route scope hiện tại. |
| 4 | User Types | User có nhiều role trong token, bao gồm `am` | Medium | Cho phép nếu có role `am`, vẫn scope theo store AM phụ trách. |
| 5 | Input Extremes | `from/to` chỉ chọn 1 ngày hoặc 1 tháng rất hẹp | High | Card/table theo filter ngày; riêng `charts.scoreTrend` vẫn lấy tối đa 5 tháng mới nhất. |
| 6 | Input Extremes | `from` sau `to` | Medium | API không crash; response rỗng hoặc xử lý theo helper filter hiện có. |
| 7 | Input Extremes | `storeId` không thuộc scope AM | Critical | Không trả dữ liệu store đó, không bypass scope bằng query param. |
| 8 | Input Extremes | `brandId` không có store nào trong scope AM | Medium | Trả summary/chart/table rỗng, không lỗi 500. |
| 9 | Input Extremes | `assignmentStatus/actionPlanStatus/grade` không hợp lệ | Medium | Không crash; nên trả rỗng hoặc validate theo pattern dashboard hiện có. |
| 10 | Timing | FE gọi dashboard và filters song song | Medium | Hai endpoint trả nhất quán scope; không phụ thuộc thứ tự gọi. |
| 11 | Timing | Có AP vừa được close trong lúc dashboard query | Medium | Response nhất quán trong từng request, không tạo status thiếu key. |
| 12 | Scale | AM phụ trách 0 store | High | `managedStoreCount=0`, tất cả count = 0, array rỗng. |
| 13 | Scale | AM phụ trách 300 store, nhiều audit/AP | High | API vẫn dùng select tối thiểu và không N+1 theo từng store. |
| 14 | Scale | Có hơn 5 tháng audit lịch sử | High | `charts.scoreTrend` chỉ trả 5 tháng mới nhất, sort tăng dần theo tháng. |
| 15 | Scale | Chỉ có 1-2 tháng audit lịch sử | Medium | `charts.scoreTrend` trả đúng số tháng có dữ liệu, không pad dữ liệu giả. |
| 16 | State Transitions | Assignment `pending/in_progress/completed` cùng tồn tại | Medium | `charts.assignmentStatus` và summary assignment phản ánh đúng filter/scope. |
| 17 | State Transitions | AP chuyển `draft -> submitted -> closed` | High | `charts.actionPlanStatus` cập nhật đúng, đủ 4 key dù count = 0. |
| 18 | State Transitions | AP quá hạn không có `deadline` | Medium | Overdue dùng fallback due date hiện có, không trả `NaN`. |
| 19 | Error Cascades | DB không có audit nào trong filter | High | Không chia lỗi cho average/percentage; score = 0, arrays rỗng. |
| 20 | Error Cascades | Store thiếu brand/province/AM metadata | Medium | Không crash; dùng label fallback hiện có như "Chưa có khu vực". |
| 21 | Authorization | AM truyền `amId` của AM khác | Critical | Không mở rộng scope ngoài store của current AM. |
| 22 | Authorization | AM truyền `storeId` hợp lệ về format nhưng ngoài scope | Critical | Response không có dữ liệu store đó. |
| 23 | Authorization | Token hết hạn/thiếu header user | Critical | Route trả unauthorized/forbidden theo middleware hiện có. |
| 24 | Data Integrity | Audit có `submittedAt=null` | High | Không tính vào score summary/trend/result, vì dashboard chỉ dựa trên audit đã submit. |
| 25 | Data Integrity | Violation không có group vì là RISK global | High | `errorsByGroup` không crash; risk count vẫn đi vào summary risk, không cần group. |
| 26 | Data Integrity | AP không có item nào | Medium | `actionPlanFollowUps`/`actionPlansByStore` vẫn đếm AP cha hợp lệ. |
| 27 | Data Integrity | AP item có evidence nhưng thiếu remediation text | Low | Dashboard chỉ thống kê, không validate form AP tại đây. |
| 28 | Integration | FE đọc `tables.actionPlansByStore[].totalCount` | High | Field phải tồn tại runtime, không chỉ trong docs. |
| 29 | Integration | FE đọc `maxOverdueDays/latestDueDate` để render badge | High | Field có kiểu ổn định: number và ISO string/null. |
| 30 | Integration | FE dùng `charts.errorsByGroup[].count` cho chart | High | `count` luôn bằng `errorCount`. |
| 31 | Integration | FE dùng `charts.scoreTrend[].date` làm key chart | Medium | `date` là ISO đầu tháng hoặc null, không undefined. |
| 32 | Business Logic | F-CCP hiển thị trên UI | Medium | Map từ `summary.autoCcpViolationCount`, không liên quan Franchise. |
| 33 | Business Logic | Top/bottom stores trong scope AM | High | Không lấy store ngoài scope, sort đúng theo average score trong filter. |
| 34 | Business Logic | `overdueOnly=true` | Medium | Các số liệu AP/table liên quan chỉ tính AP quá hạn theo helper hiện có. |
| 35 | Business Logic | `riskOnly=true` | Medium | Audit score/table trend chỉ tính audit risk trong scope/filter tương ứng. |

## Priority Test Targets

| Priority | Scenario IDs | Why |
|---|---:|---|
| P0 | 7, 21, 22, 23 | Chống leak dữ liệu ngoài scope AM. |
| P1 | 5, 14, 17, 24, 28, 30 | Khóa contract FE và rule score trend 5 tháng mới nhất. |
| P2 | 12, 13, 18, 20, 25, 29 | Tránh crash/slow ở dữ liệu rỗng, dữ liệu lớn, dữ liệu thiếu. |
| P3 | 27, 31, 32, 34, 35 | Tăng độ ổn định UI và mapping nghiệp vụ. |

## Suggested Automated Tests

1. AM dashboard rejects non-AM role.
2. AM cannot query data outside scoped stores by `storeId`.
3. AM `scoreTrend` ignores narrow `from/to` and returns latest 5 months.
4. AM `scoreTrend` returns sorted labels with `date/averageScore/auditCount`.
5. AM `actionPlanStatus` always contains `draft/submitted/rejected/closed`.
6. AM `errorsByGroup[].count` equals `errorCount`.
7. AM `actionPlansByStore[]` includes `totalCount/maxOverdueDays/latestDueDate`.
8. AM with no scoped stores returns empty-safe response.
9. Audit draft is not counted in AM score/trend.
10. RISK criteria without group does not break AM error aggregation.

## Summary

- Critical: 5
- High: 14
- Medium: 14
- Low: 2
- Total: 35 scenarios across 10 dimensions
