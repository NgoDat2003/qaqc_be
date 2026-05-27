# Dashboard FE Handoff

File này là mục lục cho dashboard theo role. Chi tiết từng role đã được tách riêng để FE dễ đọc và triển khai theo đúng màn hình.

## Files Theo Role

| Role | File | Endpoint |
| --- | --- | --- |
| Admin | [dashboard-admin-fe-handoff.md](./dashboard-admin-fe-handoff.md) | `GET /api/dashboard/admin` |
| QC | [dashboard-qc-fe-handoff.md](./dashboard-qc-fe-handoff.md) | `GET /api/dashboard/qc` |
| AM | [dashboard-am-fe-handoff.md](./dashboard-am-fe-handoff.md) | `GET /api/dashboard/am` |
| SM | [dashboard-sm-fe-handoff.md](./dashboard-sm-fe-handoff.md) | `GET /api/dashboard/sm` |

QAM vẫn dùng dashboard nghiệp vụ tổng hợp qua `GET /api/dashboard/qam`; phần nghiệp vụ QAM chính nằm ở [qam-fe-handoff.md](./qam-fe-handoff.md).

## Endpoints Chung

```txt
GET /api/dashboard/admin
GET /api/dashboard/qam
GET /api/dashboard/qc
GET /api/dashboard/am
GET /api/dashboard/sm
GET /api/dashboard/filters?scope=admin
GET /api/dashboard/export?scope=admin
GET /api/dashboard/export?scope=qam
GET /api/dashboard/export?scope=sm
```

## Query Params Chung

```txt
from=2026-05-01
to=2026-05-31
brandId=
storeId=
planId=
checklistId=
qcId=
amId=
status=
assignmentStatus=
actionPlanStatus=
grade=
riskOnly=true
overdueOnly=true
```

Nếu không truyền `from/to`, BE dùng tháng hiện tại.

## Response Pattern Chung

```ts
type DashboardResponse = {
  success: true
  data: {
    summary: Record<string, unknown>
    charts: Record<string, unknown>
    tables: Record<string, unknown[]>
    filters: Record<string, unknown>
    generatedAt: string
  }
}
```

FE nên render dashboard từ một endpoint chính theo role, không tự fetch list audit/action plan lớn rồi tự aggregate lại ở client.

## Ghi Chú Chung

- `assignmentStatus`: `pending | in_progress | completed`.
- `actionPlanStatus`: `draft | submitted | rejected | closed`.
- `grade`: `excellent | good | pass | fail | alarm`.
- `riskOnly=true`: chỉ tính audit có RISK.
- `overdueOnly=true`: chỉ tính Action Plan quá hạn/chưa đóng.
- `F-CCP` trên UI map vào `autoCcpViolationCount`, không phải Franchise.
- BE đã enforce scope theo role, FE không cần tự lọc lại dữ liệu vượt quyền ở client.
- Export dashboard hiện hỗ trợ mọi scope hợp lệ theo đúng role hiện tại, gồm cả `scope=sm`.
