# Plan 08 - Route-Level Integration Tests

## Mục Tiêu

Khóa hành vi API thật sau khi RBAC scope đã được gom vào `src/lib/scope.ts`.

Unit tests hiện tại xác nhận helper đúng, nhưng chưa xác nhận route thật:

- gọi đúng helper,
- trả đúng HTTP status,
- trả đúng response shape,
- không bypass scope qua query param,
- list/detail nhất quán.

## Phạm Vi Ưu Tiên

Routes cần test trước:

- `GET /api/audit-plans/[id]`
- `GET /api/audits`
- `GET /api/audits/[id]`
- `GET /api/action-plans`
- `GET /api/action-plans/[id]`
- `POST /api/action-plans/[id]/submit`
- `GET /api/analytics/overview`

## Kịch Bản Chính

Audit plan:

- QC gọi full plan detail bị `403`.
- QAM gọi full plan detail được `200`.

Audits:

- QC list chỉ thấy audit của mình.
- QC detail audit người khác bị `403`.
- SM list bị filter theo store scope.
- SM detail audit store khác bị `403`.
- AM list/detail chỉ trong store scope.
- QAM xem toàn bộ.

Action plans:

- SM list chỉ thấy AP store mình.
- SM detail AP store khác bị `403`.
- SM submit AP store khác bị `403`.
- QAM đọc được AP toàn hệ thống.

Analytics:

- QC bị `403`.
- SM/AM aggregate theo store scope.
- QAM/executive xem toàn hệ thống.

## Cần Fix Trước Khi Viết Hoặc Cùng Lúc

- `getRequestUser` phải validate roles là `string[]`, không chỉ tin `JSON.parse`.
- `GET /api/audits` cần union scope cho user có `qc_auditor + store_manager/am` để list/detail nhất quán.

## Acceptance Criteria

- Route-level tests pass cùng `npm.cmd test`. Kết quả mới nhất: pass `44/44`.
- `npm.cmd run build` pass.
- Không thêm test framework nặng nếu chưa cần; ưu tiên mock `NextRequest` và Prisma module ở mức tối thiểu.
- Nếu route test cần framework, chọn hướng nhẹ và thống nhất trước khi thêm dependency.

## Cập Nhật 2026-05-14

Trạng thái: đã triển khai trong `tests/run-tests.ts` để phục vụ local testing một lệnh.

Đã cover:

- QC bị chặn khỏi audit plan detail, QAM xem được.
- QC audit list chỉ thấy audit của mình.
- User multi-role `qc_auditor + store_manager` thấy union own audit và store scope.
- Query `storeId` ngoài scope không làm lộ audit store khác, nhưng vẫn cho thấy own audit nếu chính QC là auditor.
- QC bị chặn khỏi audit detail người khác.
- SM list/detail/submit action plan chỉ trong store scope.
- QC bị chặn analytics overview.
- SM analytics overview được filter theo store scope.
