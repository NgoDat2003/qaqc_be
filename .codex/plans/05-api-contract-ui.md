# Kế Hoạch 05 - Hợp Đồng API Và Sẵn Sàng Cho UI

## Vấn Đề Hiện Tại

- List endpoint thường thiếu pagination.
- Một số response thiếu display field của relation.
- Một số route trả raw Prisma model.
- Middleware error shape lệch với response helper.

## Hành Vi Mục Tiêu

- Mọi list endpoint trả `meta.page`, `meta.limit`, `meta.total`, `meta.totalPages`.
- Relation phục vụ UI có `id` kèm display fields.
- Create/update trả DTO đủ để UI render ngay.
- Error shape thống nhất.

## Cách Triển Khai

- Tạo pagination helper.
- Tạo select snippets hoặc DTO mapper dùng chung.
- Ưu tiên cập nhật: audits, action-plans, audit-plans, stores, users, checklists, criteria.
- Cập nhật create/update response về UI-ready DTO.
- Sửa middleware unauthorized theo `response.unauthorized()`.

## Kiểm Thử

- List API có meta.
- Relation ref có code/name/fullName.
- Create/update response render UI được, không cần lookup phụ.
