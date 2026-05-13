# ADR-005 - Mô Hình RBAC Scope

## Trạng Thái

Đã chấp nhận

## Quyết Định

Backend phải tự enforce scope theo role.

## Scope

| Role | Scope |
|---|---|
| company_admin | quản trị master data |
| qa_manager | toàn bộ dữ liệu nghiệp vụ QA/QC |
| qc_auditor | assignment và audit của chính mình |
| store_manager | audit result và AP của store được gán |
| am | audit result và AP của store được gán, mặc định read-only |
| executive_viewer | dashboard/report read-only |

## Hệ Quả

Cần helper scope dùng chung để tránh copy-paste check mong manh trong route.
