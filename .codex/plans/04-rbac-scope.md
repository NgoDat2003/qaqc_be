# Plan 04 - RBAC Scope

## Vấn Đề Hiện Tại

- Scope check đang bị lặp ở nhiều route.
- Một số endpoint đọc dữ liệu rộng hơn rule nghiệp vụ.
- Quy tắc QC/SM chưa được gom về helper chung.

## Hành Vi Mục Tiêu

| Role | Scope |
|---|---|
| company_admin | quản trị master data |
| qa_manager | toàn bộ dữ liệu nghiệp vụ QA/QC |
| qc_auditor | assignment và audit của chính mình |
| store_manager | audit result và AP của store được gán |
| am | store được gán, mặc định read-only |
| executive_viewer | dashboard/report read-only |

## Cách Triển Khai

- Tạo `src/lib/scope.ts`.
- Helper lấy user id và roles.
- Helper lấy store ids được truy cập cho SM/AM.
- Thêm `assertAssignmentOwner`.
- Thêm `assertActionPlanAccess`.
- Thêm `assertAuditAccess`.

## Kiểm Thử

- QC không xem plan management detail ngoài scope.
- SM không xem AP/audit store khác.
- AM list chỉ gồm store được gán.
- QAM xem toàn bộ.
