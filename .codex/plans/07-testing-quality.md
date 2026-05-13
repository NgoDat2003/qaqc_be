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
