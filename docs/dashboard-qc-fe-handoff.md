# Dashboard QC FE Handoff

Endpoint: `GET /api/dashboard/qc`

Dashboard QC dùng cho công việc cá nhân của QC. Role được phép gọi: `qc_auditor`. BE chỉ trả assignment/audit của QC hiện tại.

## Query Params

```txt
from=2026-05-01
to=2026-05-31
planId=
checklistId=
storeId=
assignmentStatus=
grade=
riskOnly=true
```

## Summary Cards

| UI card | Field |
| --- | --- |
| Việc được giao | `summary.assignedTotal` |
| Chưa chấm | `summary.pendingCount` |
| Đang chấm | `summary.inProgressCount` |
| Đã submit | `summary.submittedCount` |
| Tỷ lệ hoàn thành | `summary.completionRate` |
| Điểm trung bình bài đã submit | `summary.averageScoreOfSubmitted` |
| Tổng lỗi đã ghi nhận | `summary.totalViolationCount` |
| Lỗi thường | `summary.normalViolationCount` |
| RISK | `summary.riskViolationCount` |
| CCP | `summary.ccpViolationCount` |
| F-CCP | `summary.autoCcpViolationCount` |
| Lỗi lặp | `summary.repeatViolationCount` |

`F-CCP` là lỗi auto CCP do lặp, map vào `autoCcpViolationCount`.

## Charts

| UI block | Field |
| --- | --- |
| Trạng thái bài chấm | `charts.assignmentStatus` |
| Tiến độ hoàn thành cá nhân | `charts.completionTrend` |
| Lỗi/lỗi lặp đã ghi nhận | `charts.errorTrend` |
| Lỗi theo nhóm C/H/P/E | `charts.errorsByGroup` |
| Xu hướng điểm bài đã submit | `charts.scoreTrend` |

## Tables

| UI table | Field |
| --- | --- |
| Danh sách store được giao | `tables.assignedStores` |
| Tiến độ theo kế hoạch | `tables.planProgress` |
| Top tiêu chí mình ghi lỗi nhiều | `tables.topCriteria` |
| Top tiêu chí lỗi lặp | `tables.topRepeatCriteria` |

`tables.assignedStores[]`:

```ts
{
  assignmentId: string
  auditId: string | null
  status: "pending" | "in_progress" | "completed"
  store: { id: string; code: string; name: string }
  plan: { id: string; name: string; status: string; startDate: string; endDate: string }
  checklist: { id: string; name: string; version: string; status: string }
  canStart: boolean
  canContinue: boolean
  canViewResult: boolean
}
```

## Button Mapping

| Condition | FE action |
| --- | --- |
| `canStart=true` | Hiển thị nút `Bắt đầu` |
| `canContinue=true` | Hiển thị nút `Tiếp tục` |
| `canViewResult=true` | Hiển thị nút `Xem kết quả` |

Khi xem kết quả, FE phải dùng `auditId`, không dùng `assignmentId`.

## Filter Options

```txt
GET /api/dashboard/filters?scope=qc
```

QC chỉ nhận option thuộc assignment của mình.

## FE Notes

- QC không xem dashboard toàn hệ thống.
- Không hiển thị dữ liệu store ngoài assignment được giao.
- Card điểm trung bình chỉ tính các bài QC đã submit.
- Nếu `auditId=null` thì chưa có bài audit để xem result.
