# Dashboard SM FE Handoff

Endpoint: `GET /api/dashboard/sm`

Dashboard SM dùng cho cửa hàng của Store Manager. Role được phép gọi: `store_manager`. BE chỉ trả dữ liệu cửa hàng SM quản lý.

## Query Params

```txt
from=2026-05-01
to=2026-05-31
checklistId=
actionPlanStatus=
grade=
riskOnly=true
overdueOnly=true
```

## Summary Cards

| UI card | Field |
| --- | --- |
| Điểm gần nhất | `summary.latestScore` |
| Kết quả gần nhất | `summary.latestGrade` |
| Điểm trung bình | `summary.averageScore` |
| Bài audit trong kỳ | `summary.auditCount` |
| Cửa hàng đã chấm | `summary.auditedStoreCount` |
| AP đang mở | `summary.actionPlanOpen` |
| AP quá hạn | `summary.actionPlanOverdue` |
| AP đã đóng | `summary.actionPlanClosed` |
| Tỷ lệ minh chứng khắc phục | `summary.remediationEvidenceRate` |
| Ảnh đã có | `summary.evidenceCount` |
| Ảnh yêu cầu | `summary.requiredEvidenceCount` |
| RISK | `summary.riskViolationCount` |
| CCP | `summary.ccpViolationCount` |
| F-CCP | `summary.autoCcpViolationCount` |
| Lỗi thường | `charts.violationSeverityBreakdown.normal` |

## Charts

| UI block | Field |
| --- | --- |
| Xu hướng điểm cửa hàng | `charts.scoreTrend` |
| Lỗi nghiêm trọng/RISK/CCP | `charts.violationSeverityBreakdown` |
| Lỗi theo nhóm C/H/P/E | `charts.errorsByGroup` |
| Trạng thái Action Plan | `charts.actionPlanStatus` |

`charts.scoreTrend[]`:

```ts
{
  label: string
  date: string | null
  averageScore: number
  auditCount: number
}
```

`label` hiện dùng dạng `T01`, `T02` khi trend theo tháng. `date` là ISO ngày đầu tháng nếu BE parse được kỳ dữ liệu.

Riêng SM dashboard, `charts.scoreTrend` không bị giới hạn bởi filter `from/to`. BE luôn lấy tối đa 5 tháng audit mới nhất trong scope cửa hàng của SM để line chart có đủ điểm render. Các card/table còn lại vẫn đi theo filter ngày tháng.

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

`count` là alias của `errorCount` để FE có thể dùng trực tiếp cho chart.

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

`charts.violationSeverityBreakdown`:

```ts
{
  risk: number
  ccp: number
  autoCcp: number
  normal: number
}
```

## Tables

| UI table | Field |
| --- | --- |
| Lịch sử audit cửa hàng | `tables.auditHistory` |
| Action Plan cần cập nhật | `tables.actionPlanItemsToUpdate` |
| Minh chứng khắc phục mới nhất | `tables.latestRemediationImages` |
| Top tiêu chí lỗi nhiều | `tables.topCriteria` |
| Top tiêu chí lỗi lặp | `tables.topRepeatCriteria` |
| AP cần theo dõi | `tables.actionPlanFollowUps` |

`tables.auditHistory[]`:

```ts
{
  auditId: string
  submittedAt: string | null
  checklist: { id: string; name: string; version: string }
  finalScore: number
  grade: string
}
```

`tables.actionPlanItemsToUpdate[]`:

```ts
{
  actionPlanId: string
  itemId: string
  actionPlanStatus: "draft" | "submitted" | "rejected" | "closed"
  status: string
  deadline: string | null
  overdueDays: number
  criteria: {
    id: string
    code: string
    name: string
    flag: "none" | "critical" | "risk"
    group: { id: string; code: string; name: string } | null
  }
  issueCause: string | null
  numErrors: number
  repeatCount: number
  isCriticalTriggered: boolean
  isRiskTriggered: boolean
  rootCause: string | null
  remediation: string | null
  fixedAt: string | null
  assigneeName: string | null
  imageCount: number
}
```

Mapping cho mockup:

- `issueCause`: nguyên nhân/mô tả lỗi gốc do QC nhập, chỉ hiển thị read-only.
- `rootCause`: nguyên nhân khắc phục do SM nhập trong Action Plan detail.
- `deadline`: hạn xử lý của Action Plan. Nếu BE không có deadline, dashboard dùng fallback nội bộ `createdAt + 7 ngày` để tính quá hạn.
- `overdueDays`: số ngày quá hạn; `0` nghĩa là chưa quá hạn.
- `actionPlanStatus`: trạng thái AP cha, dùng để gắn badge dòng/card.

`tables.latestRemediationImages[]`:

```ts
{
  id: string
  url: string
  fileName: string | null
  mimeType: string | null
  actionPlanId: string | null
  itemId: string | null
  criteriaName: string | null
  createdAt: string
}
```

## Filter Options

```txt
GET /api/dashboard/filters?scope=sm
```

SM chỉ nhận option liên quan cửa hàng của mình.

Response filter chính cho SM:

```ts
{
  generatedAt: string
  checklists: Array<{
    id: string
    name: string
    version: string
    status: string
  }>
  actionPlanStatuses: Array<{
    value: "draft" | "submitted" | "rejected" | "closed"
    label: string
  }>
}
```

Endpoint còn có thể trả thêm `brands`, `stores`, `users`, `auditPlans` theo response chung, nhưng màn SM chỉ cần `checklists` và `actionPlanStatuses`.

## Export

```txt
GET /api/dashboard/export?scope=sm
```

Export trả CSV theo scope SM hiện tại. BE vẫn enforce role `store_manager`, nên SM không export được dữ liệu cửa hàng khác.

## Test Data

Script analytics seed có tạo dữ liệu đủ để review màn SM:

```txt
npm run seed:analytics:reset
```

Seed này tạo store manager demo, Action Plan còn mở/quá hạn và ảnh minh chứng khắc phục. Mật khẩu mặc định của user analytics là `Test@1234`, hoặc giá trị `ANALYTICS_USER_PASSWORD` nếu môi trường có override.

## FE Notes

- SM chỉ xem dữ liệu cửa hàng của mình.
- `actionPlanItemsToUpdate` dùng cho danh sách hạng mục cần cập nhật khắc phục.
- Khi user click AP item, FE điều hướng sang Action Plan detail để nhập khắc phục.
- `latestRemediationImages` dùng cho block ảnh minh chứng gần nhất.
- Không dùng dashboard để submit/close AP; submit AP vẫn đi qua màn Action Plan detail.
