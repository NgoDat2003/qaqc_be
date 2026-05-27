# Dashboard Admin FE Handoff

Endpoint: `GET /api/dashboard/admin`

Dashboard Admin dùng cho quản trị hệ thống/master data. Role được phép gọi: `company_admin`.

## Query Params

```txt
from=2026-05-01
to=2026-05-31
brandId=
storeId=
planId=
checklistId=
role=
status=
assignmentStatus=
actionPlanStatus=
overdueOnly=true
```

## Summary Cards

| UI card | Field |
| --- | --- |
| Tổng user | `summary.totalUsers` |
| Tổng cửa hàng | `summary.totalStores` |
| Tổng thương hiệu | `summary.totalBrands` |
| Checklist | `summary.totalChecklists` |
| Audit Plan | `summary.totalAuditPlans` |
| Audit đã submit | `summary.totalSubmittedAudits` |
| Action Plan | `summary.totalActionPlans` |
| AP đang mở | `summary.actionPlansOpen` |
| AP quá hạn | `summary.actionPlansOverdue` |
| AP đã đóng | `summary.actionPlansClosed` |
| Store thiếu AM | `summary.storesMissingAM` |
| Store thiếu SM | `summary.storesMissingSM` |
| Store thiếu cả AM/SM | `summary.storesMissingBoth` |

`summary.deltas` dùng cho badge tăng/giảm so với kỳ trước nếu UI cần.

## Charts

| UI block | Field |
| --- | --- |
| User/RBAC theo vai trò | `charts.usersByRole` |
| User active/inactive | `charts.usersByStatus` |
| Store theo brand | `charts.storesByBrand` |
| Store theo tỉnh/thành | `charts.storesByProvince` |
| Checklist theo trạng thái | `charts.checklistsByStatus` |
| Audit plan theo trạng thái | `charts.auditPlansByStatus` |
| Action Plan theo trạng thái | `charts.actionPlansByStatus` |
| Phân bổ AM/SM theo khu vực | `charts.amSmByProvince` |

Các chart dạng array như `usersByRole`, `storesByBrand`, `checklistsByStatus` có `count` và `percentage`.

## Tables

| UI table | Field |
| --- | --- |
| Store thiếu dữ liệu | `tables.storesMissingData` |
| Tiến độ audit plan | `tables.auditPlanProgress` |
| Action Plan quá hạn | `tables.overdueActionPlans` |

## Filter Options

```txt
GET /api/dashboard/filters?scope=admin
```

Admin có thể dùng filter theo thời gian, brand, store, role, AM/SM và trạng thái.

## Export

```txt
GET /api/dashboard/export?scope=admin
```

Hiện export trả CSV. Chưa có XLSX/PDF thật ở task này.

## FE Notes

- Admin dashboard thiên về quản trị hệ thống, không cần hiển thị phân tích lỗi sâu như QAM.
- Nút xem chi tiết nên điều hướng sang màn master data tương ứng: Users, Stores, Brands, Checklist, Audit Plans, Action Plans.
- Không gọi thêm `GET /api/users`, `GET /api/stores`, `GET /api/action-plans` để tự tính card dashboard.
