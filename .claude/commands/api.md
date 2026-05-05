Tạo API endpoint mới cho QA/QC Backend theo đúng chuẩn project.

Khi nhận tên resource (ví dụ: "notifications"), hãy:

1. Đọc `src/lib/api-response.ts` để hiểu response pattern
2. Đọc `src/lib/rbac.ts` để hiểu RBAC pattern
3. Đọc route tương tự trong `src/app/api/` để học pattern
4. Tạo đúng cấu trúc:
   - GET list: filter theo role scope
   - POST: validate input với Zod, dùng `response.created()`
   - GET [id]: check ownership
   - PATCH [id]: check quyền trước khi sửa
5. Sau khi tạo chạy `npm run lint` để verify

Không dùng `response.success(data, msg, 201)` — dùng `response.created(data, msg)`.
Báo cáo khi xong: endpoints đã tạo, test curl command để verify.
