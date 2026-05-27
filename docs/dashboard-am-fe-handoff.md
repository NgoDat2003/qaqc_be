# Dashboard AM FE Handoff

Endpoint: `GET /api/dashboard/am`

Dashboard AM dùng cho khu vực/cửa hàng AM phụ trách. Role được phép gọi: `am`. BE chỉ trả dữ liệu trong store scope của AM hiện tại.

## Query Params

```txt
from=2026-05-01
to=2026-05-31
brandId=
storeId=
planId=
checklistId=
assignmentStatus=
actionPlanStatus=
grade=
riskOnly=true
overdueOnly=true
```

Các summary/table chính đi theo filter ngày `from/to`. Riêng `charts.scoreTrend` luôn lấy tối đa 5 tháng audit mới nhất trong scope AM để biểu đồ có đủ điểm render.

## Summary Cards

| UI card | Field |
| --- | --- |
| Cửa hàng phụ trách | `summary.managedStoreCount` |
| Điểm trung bình khu vực | `summary.averageScore` |
| Cửa hàng đã chấm | `summary.auditedStoreCount` |
| Bài audit trong kỳ | `summary.auditCount` |
| Tổng assignment | `summary.assignmentTotal` |
| Chưa chấm | `summary.assignmentPending` |
| Đang chấm | `summary.assignmentInProgress` |
| Đã hoàn thành | `summary.assignmentCompleted` |
| RISK | `summary.riskViolationCount` |
| CCP | `summary.ccpViolationCount` |
| F-CCP | `summary.autoCcpViolationCount` |
| Tổng lỗi | `summary.totalErrorCount` |
| Lỗi lặp | `summary.repeatViolationCount` |
| AP đang mở | `summary.actionPlanOpen` |
| AP quá hạn | `summary.actionPlanOverdue` |
| AP đã đóng | `summary.actionPlanClosed` |

`summary.riskAuditCount` vẫn tồn tại nếu FE cần số bài audit có RISK. Riêng block mockup `Risk / CCP / F-CCP` nên dùng cùng hệ số lỗi:

- Risk: `summary.riskViolationCount`
- CCP: `summary.ccpViolationCount`
- F-CCP: `summary.autoCcpViolationCount`

`F-CCP` trên UI map vào `autoCcpViolationCount`, nghĩa là lỗi lặp tự kích hoạt CCP, không liên quan Franchise.

## Charts

| UI block | Field |
| --- | --- |
| Lỗi theo nhóm C/H/P/E | `charts.errorsByGroup` |
| Xu hướng điểm khu vực | `charts.scoreTrend` |
| Trạng thái audit | `charts.assignmentStatus` |
| Trạng thái Action Plan | `charts.actionPlanStatus` |
| Điểm trung bình theo brand | `charts.averageByBrand` |
| Điểm trung bình theo khu vực | `charts.averageByProvince` |
| Lỗi lặp theo thời gian | `charts.repeatTrend` |

`charts.scoreTrend[]`:

```ts
{
  label: string
  date: string | null
  averageScore: number
  auditCount: number
}
```

`label` hiện dùng dạng `T01`, `T02` khi trend theo tháng. `date` là ISO ngày đầu tháng nếu BE parse được kỳ dữ liệu. AM dashboard lấy tối đa 5 tháng audit mới nhất trong scope AM và không bị giới hạn bởi `from/to`.

`charts.errorsByGroup[]`:

```ts
{
  groupCode: string
  groupName: string
  violationCount: number
  errorCount: number
  count: number
  percentage: number
}
```

`count` là alias của `errorCount` để FE dùng trực tiếp cho chart.

`charts.actionPlanStatus`:

```ts
{
  draft: number
  submitted: number
  rejected: number
  closed: number
}
```

BE luôn trả đủ 4 key, kể cả khi giá trị bằng `0`.

## Tables

| UI table | Field |
| --- | --- |
| Xếp hạng cửa hàng | `tables.storeRanking` |
| Action Plan theo store | `tables.actionPlansByStore` |
| Top tiêu chí lỗi nhiều | `tables.topCriteria` |
| Top tiêu chí lỗi lặp | `tables.topRepeatCriteria` |
| AP cần theo dõi | `tables.actionPlanFollowUps` |
| Store điểm cao | `tables.topStores` |
| Store điểm thấp | `tables.bottomStores` |

`tables.storeRanking[]`:

```ts
{
  store: { id: string; code: string; name: string }
  auditCount: number
  averageScore: number
  latestAuditDate: string | null
  latestScore: number | null
  grade: string | null
}
```

`tables.topStores[]` và `tables.bottomStores[]`:

```ts
{
  store: {
    id: string
    code: string
    name: string
    province: string | null
    brand: { id: string; code: string; name: string }
    am: { id: string; fullName: string; email: string } | null
  }
  auditCount: number
  averageScore: number
  riskCount: number
  criticalCount: number
  latestAuditDate: string | null
  latestScore: number | null
  grade: string | null
}
```

`tables.actionPlansByStore[]`:

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

Mapping:

- `openCount`: AP chưa đóng, gồm `draft`, `submitted`, `rejected`.
- `overdueCount`: AP chưa đóng và đã quá hạn.
- `closedCount`: AP đã đóng.
- `totalCount`: tổng AP của store trong filter hiện tại.
- `maxOverdueDays`: số ngày quá hạn lớn nhất của store; `0` là chưa quá hạn.
- `latestDueDate`: hạn xử lý mới nhất của các AP trong store. Nếu AP không có deadline, BE dùng fallback nội bộ `createdAt + 7 ngày`.

## Filter Options

```txt
GET /api/dashboard/filters?scope=am
```

Response chính FE dùng:

```ts
{
  generatedAt: string
  brands: Array<{ id: string; code: string; name: string }>
  stores: Array<{
    id: string
    code: string
    name: string
    brand: { id: string; code: string; name: string }
  }>
  checklists: Array<{
    id: string
    name: string
    version: string
    status: string
  }>
  auditPlans: Array<{
    id: string
    name: string
    status: string
    startDate: string
    endDate: string
  }>
  actionPlanStatuses: Array<{
    value: "draft" | "submitted" | "rejected" | "closed"
    label: string
  }>
  assignmentStatuses: Array<{
    value: "pending" | "in_progress" | "completed"
    label: string
  }>
  grades: Array<{
    value: "excellent" | "good" | "pass" | "fail" | "alarm"
    label: string
  }>
}
```

AM chỉ nhận option store nằm trong phạm vi phụ trách. Brand có thể là danh sách chung, nhưng khi chọn brand thì dữ liệu dashboard vẫn bị chặn theo store scope AM.

## FE Notes

- AM là read-only dashboard, không dùng màn này để sửa audit/AP.
- Các link `Xem store`, `Xem audit`, `Xem AP` nên điều hướng sang detail tương ứng.
- `actionPlanFollowUps` dùng cho bảng AP cần xử lý ngay.
- Nếu muốn tab `Điểm cao nhất / Điểm thấp nhất`, FE dùng `tables.topStores` và `tables.bottomStores`.
- Nếu cần trend bám sát ngày filter, FE phải yêu cầu field riêng sau; hiện `scoreTrend` ưu tiên đủ 5 tháng để render.

## Export

```txt
GET /api/dashboard/export?scope=am
```

Export dùng cùng query filter với `GET /api/dashboard/am` và trả CSV:

```txt
content-type: text/csv; charset=utf-8
content-disposition: attachment; filename="dashboard-am.csv"
```
