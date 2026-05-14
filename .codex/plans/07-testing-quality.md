# Plan 07 - Kiểm Thử Và Chất Lượng

## Coverage Mục Tiêu

- Unit test scoring.
- Test tính repeat.
- Test ownership RBAC.
- Test transition Action Plan.
- Test API contract.

## Kịch Bản Test

Scoring:

- Deduction thường theo trọng số.
- CCP làm group về 0.
- RISK làm final về 0.
- Repeat lần 1/2/3/4/5.

RBAC:

- Ownership assignment của QC.
- Scope store của SM.
- Store được gán của AM.
- QAM global access.

API:

- Pagination meta.
- Relation display fields.
- Middleware error shape.

## Quality Gate

Trước khi kết thúc task:

- chạy lint
- chạy build
- chạy test liên quan
- cập nhật `.codex/MEMORY.md` nếu quyết định thay đổi
- cập nhật `.codex/ISSUE_REGISTER.md` nếu issue đã fix

## Cập Nhật 2026-05-14

Đã bổ sung test cho Task 3 RBAC Scope trong `tests/run-tests.ts`.

Nhóm test đã có:

- Auth header: thiếu `x-user-id`, `x-user-roles` sai JSON, request hợp lệ.
- Store scope: SM/AM lấy store từ `RoleAssignment.storeId` và direct field.
- Data integrity: bỏ qua `storeId = null`, dedupe store trùng.
- Authorization: role lạ không có read-all, không có store access.
- Multi-role: `qa_manager + store_manager` read-all; `qc_auditor + store_manager` union own audit/store scope ở helper.
- Access helper: audit/AP missing trả false, lookup đúng record và scope.
- Failure mode: DB scope lỗi không fallback thành read-all.

Verification:

- `npm.cmd test`: pass `44/44`.
- `npm.cmd run build`: pass.

Route-level tests đã bổ sung:

- `GET /api/audit-plans/[id]`
- `GET /api/audits`
- `GET /api/audits/[id]`
- `GET /api/action-plans`
- `GET /api/action-plans/[id]`
- `POST /api/action-plans/[id]/submit`
- `GET /api/analytics/overview`

Test gap còn lại:

- Chưa có test pagination/API contract toàn hệ thống.
- Chưa có test upload evidence/security/performance.
