# ADR-002 - API Response Contract

## Trạng Thái

Đã chấp nhận

## Quyết Định

API phục vụ UI phải trả DTO ổn định, không trả raw Prisma model.

List endpoint phải có pagination metadata.

Relation mà UI cần hiển thị phải có display fields, không chỉ id.

## Relation Ref Bắt Buộc

- Store: `id`, `code`, `name`
- Brand: `id`, `code`, `name`
- User: `id`, `fullName`, `email`
- Checklist: `id`, `name`, `version`, `status`
- Criteria group: `id`, `code`, `name`, `weight`

## Hệ Quả

Frontend không cần gọi thêm lookup API chỉ để render tên, mã hoặc label phổ biến.
