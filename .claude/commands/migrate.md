Hỗ trợ Prisma migration workflow cho QA/QC Backend.

Khi nhận yêu cầu thay đổi schema:

1. Đọc `prisma/schema.prisma` hiện tại
2. Mô tả thay đổi cần làm và impact
3. Sửa schema theo yêu cầu
4. Hướng dẫn chạy: `npx prisma migrate dev --name ten-migration`
5. Nếu có seed data cần update → chỉ ra file `prisma/seed.ts`

Cảnh báo bắt buộc nếu migration có:
- Xóa column có dữ liệu → destructive
- Đổi tên column → Prisma tạo drop + add, mất data
- Thêm NOT NULL column → cần default value hoặc migration 2 bước

Không chạy `prisma migrate dev` trực tiếp — để người dùng tự chạy sau khi review.
