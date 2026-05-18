# Test Report - QAM Audit Plan Draft Workflow

Ngay test: 2026-05-18

## Ket Qua

| Hang muc | Ket qua | Ghi chu |
|---|---:|---|
| Route/unit tests | Pass | `37/37 tests passed` |
| Prisma validate | Pass | `prisma/schema.prisma` hop le |
| Prisma migration | Pass | `20260518025101_qam_audit_plan_draft_workflow` da apply |
| Build/typecheck | Pass | `npm.cmd run build` thanh cong |

## Test Case Moi

| Nhom | Case |
|---|---|
| Create | `POST /api/audit-plans` tao plan `draft` |
| Publish | `POST /api/audit-plans/:id/publish` chuyen `draft -> open` |
| Publish guard | Chan publish plan khong co assignment |
| Patch draft | `PATCH /api/audit-plans/:id` sua full assignments khi `draft` |
| Patch open guard | Chan doi checklist khi plan da `open` |
| Patch open window | Cho sua `startDate/endDate` khi plan `open` |
| Assignment update | Cho doi QC khi assignment `pending` |
| Assignment update guard | Chan doi QC khi assignment `in_progress` |
| Assignment delete guard | Chan xoa assignment cuoi cung khi plan `open` |
| Assignment delete | Cho xoa assignment `pending` khi plan `draft` |
| QC visibility | `/api/audit-plans/my-assignments` chi tra assignment thuoc plan `open` |

## Ket Luan

Workflow QAM audit plan da du nen cho FE lam:

```txt
luu nhap -> publish/giao viec -> sua window -> doi QC pending -> xoa store pending -> close
```

Chua cover audit execution/scoring vi nam o role QC/task sau.
