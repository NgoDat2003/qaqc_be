# Journal - 2026-05-14 - RBAC Scope

## Tóm Tắt

Task 3 RBAC Scope đã được triển khai trên branch `codex/rbac-scope`.

Thay đổi chính:

- Tạo `src/lib/scope.ts` làm helper scope dùng chung.
- Refactor audit, action plan và analytics routes dùng scope helper.
- Chặn QC khỏi full audit plan detail.
- Store scope lấy từ cả `RoleAssignment.storeId`, `Store.amId`, `Store.managerId`.
- Bổ sung edge tests cho RBAC scope và route-level integration tests cho API routes chính.
- Fix review findings về validate role header và audit list union scope cho user multi-role.

## Verification

- `npm.cmd test`: pass `44/44`.
- `npm.cmd run build`: pass.
- `git diff --check`: pass.

## Review Findings

Code review phát hiện 2 điểm và đã xử lý:

1. `getRequestUser` cần validate `x-user-roles` là `string[]`.
2. `GET /api/audits` cần union scope cho user có `qc_auditor + store_manager/am` để list/detail nhất quán.

## Bước Tiếp Theo

Thứ tự đề xuất:

1. Ship Task 3 RBAC Scope.
2. Bắt đầu task kế tiếp: pagination/API contract cleanup hoặc performance/security cơ bản theo roadmap.
3. Nếu muốn giữ lịch sử sạch, tách riêng commit setup Codex hook/skill khỏi commit nghiệp vụ RBAC.

## Ghi Chú

Working tree còn có thay đổi setup Codex hook/skill ở `.codex/README.md`, `.codex/hooks.json`, `AGENTS.md`, `.codex/hooks/`. Các thay đổi này không thuộc Task 3 RBAC Scope và nên được stage/commit riêng nếu muốn giữ lịch sử sạch.
