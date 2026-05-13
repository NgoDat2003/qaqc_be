# Hướng Dẫn Cho Codex

Áp dụng các quy tắc này khi chỉnh backend.

## Nên Làm

- Luôn đọc `AGENTS.md` trước.
- Dùng `response.success()` cho 200 và `response.created()` cho 201.
- Dùng `response.error()`, `response.unauthorized()`, `response.forbidden()` cho lỗi.
- Backend phải tự kiểm tra RBAC, scope store và ownership assignment; không dựa vào UI.
- Endpoint phục vụ UI phải trả DTO/select rõ ràng.
- Relation mà UI cần hiển thị phải có field đọc được như `code`, `name`, `fullName`.
- List API phải có pagination metadata.
- `src/lib/scoring.ts` là nguồn sự thật của scoring.
- Backend tự tính lỗi lặp từ lịch sử audit đã submit.

## Không Làm

- Không sửa tay `prisma/migrations/`.
- Không sửa `.env`; biến mới đưa vào `.env.example`.
- Không sửa `src/lib/auth.ts` nếu không được yêu cầu rõ.
- Không trả raw Prisma model ở endpoint chính cho UI.
- Không cho QC chọn `repeatCount`.
- Không đưa lại cơ chế Franchise/NQ.
- Không dùng trạng thái Action Plan `confirmed` hoặc `in_review`.

## Phong Cách Backend

Route nên mỏng:

```txt
route -> parse/validate -> service -> dto -> response
```

Ưu tiên helper/service dùng chung cho pagination, scope, DTO mapping và scoring.
