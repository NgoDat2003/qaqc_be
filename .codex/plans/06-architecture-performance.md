# Plan 06 - Kiến Trúc Và Performance

## Vấn Đề Hiện Tại

- Route còn chứa business logic.
- Include nested rộng tạo payload lớn.
- Một số query có thể bị N+1.
- Analytics còn filter/aggregate bằng memory.

## Hành Vi Mục Tiêu

- Route handler mỏng.
- Business logic nằm trong service.
- DTO kiểm soát response shape.
- Query chỉ select field cần thiết.
- Bulk read thay cho N+1.

## Cách Triển Khai

- Tạo audit service cho draft/submit/repeat/scoring/AP trigger.
- Tạo action plan service cho transition.
- Tạo DTO mapper.
- Thay per-item lookup bằng bulk query khi cần.
- Thay `include: true` rộng bằng `select` rõ ràng.
- Chuyển analytics count/aggregate sang Prisma query khi phù hợp.
- Thêm validate MIME/dung lượng upload.
- Bỏ CORS fallback hardcode ở production.

## Kiểm Thử

- Submit nhiều violations vẫn ổn định.
- Analytics tôn trọng scope và date filter.
- Upload reject file sai type hoặc quá dung lượng.
