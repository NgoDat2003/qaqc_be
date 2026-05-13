# Roadmap Backend

Đây là thứ tự triển khai, không phải chia phase release.

## 1. Đúng Nghiệp Vụ

- Kiểm tra ownership assignment khi lưu draft và submit audit.
- Dùng một scoring engine cho preview và submit.
- Backend tự tính lỗi lặp.
- QC không sửa audit sau submit.
- Tự tạo Action Plan khi audit submit có lỗi.

## 2. Luồng Kế Hoạch Hành Động

- Thống nhất status: `draft`, `submitted`, `rejected`, `closed`.
- SM cập nhật và submit AP trong scope store của mình.
- QAM reject hoặc close AP.
- Lưu thông tin người close/review nhất quán.

## 3. RBAC Scope

- Tạo helper scope dùng chung.
- QAM xem toàn hệ thống.
- QC chỉ thấy assignment/audit của mình.
- SM chỉ thấy dữ liệu store của mình.
- AM xem store được gán, mặc định read-only.
- Executive viewer chỉ xem report/dashboard.

## 4. Hợp Đồng API

- Thêm pagination/meta cho list endpoint.
- Trả relation display fields cho UI.
- Hạn chế raw Prisma model, chuyển dần sang DTO.
- Chuẩn hóa error shape trong middleware.

## 5. Kiến Trúc Và Performance

- Tách service cho audit và action plan.
- Tạo DTO mapper.
- Tạo pagination helper.
- Giảm `include: true` quá rộng.
- Tránh N+1 query.
- Chuyển analytics aggregate dần về DB query.

## 6. Bảo Mật Và Upload

- Validate MIME và dung lượng file upload.
- Lưu metadata file.
- Tránh evidence orphan lâu dài.
- Bỏ fallback CORS hardcode ở production.

## 7. Kiểm Thử

- Test scoring.
- Test RBAC ownership.
- Test Action Plan workflow.
- Test API contract: pagination và relation display fields.
