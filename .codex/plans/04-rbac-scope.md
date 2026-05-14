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

## Cập Nhật 2026-05-14

Trạng thái: đã hoàn tất phần triển khai Task 3 trên branch `codex/rbac-scope`.

Đã làm:

- Tạo `src/lib/scope.ts` làm helper scope dùng chung.
- Chặn `qc_auditor` khỏi `GET /api/audit-plans/[id]`.
- Refactor scope cho audit list/detail, action plan list/detail/submit và analytics overview.
- Store scope hiện lấy từ cả `RoleAssignment.storeId`, `Store.amId`, `Store.managerId`.
- Thêm unit tests cho RBAC scope, auth header, multi-role, null/duplicate scope, missing record và DB failure.
- Fix `getRequestUser` để validate `x-user-roles` là `string[]`.
- Fix audit list để user multi-role `qc_auditor + store_manager/am` thấy union giữa audit của mình và audit trong store scope.
- Thêm route-level integration tests cho audit plan, audit list/detail, action plan list/detail/submit và analytics overview.

Verification:

- `npm.cmd test`: pass `44/44`.
- `npm.cmd run build`: pass.
- `git diff --check`: pass.

Còn lại sau Task 3:

- Pagination/API contract cleanup vẫn là task kế tiếp riêng.
- Các thay đổi setup Codex hook/skill nên commit riêng nếu muốn giữ lịch sử sạch.
