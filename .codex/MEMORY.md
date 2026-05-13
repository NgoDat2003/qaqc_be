# Bộ Nhớ Codex

## Quyết Định Nghiệp Vụ Đã Chốt

- Backend chỉ hỗ trợ một cơ chế QA/QC nội bộ C/H/P/E.
- Trọng số nhóm: C 30%, H 15%, P 15%, E 40%.
- Lỗi Critical/CCP làm điểm nhóm liên quan về 0.
- Lỗi RISK làm điểm toàn bài về 0 và grade là `alarm`.
- Lỗi lặp do backend tự tính từ lịch sử audit đã submit.
- QC không được chọn `repeatCount`.
- Scope lỗi lặp là `storeId + criteriaId`, chỉ tính audit đã submit và violation có `numErrors > 0`.
- Chuỗi lỗi lặp: x1, x2, x3, auto CCP, reset về x1.
- Trạng thái Action Plan: `draft`, `submitted`, `rejected`, `closed`.
- SM không tự close Action Plan. QAM là người close.
- Không có Franchise/NQ, không có bài test kiến thức, không có scoring 187 điểm.

## Vùng Rủi Ro Hiện Tại

- Một số endpoint còn thiếu scope/RBAC dùng chung.
- Action Plan workflow còn cần chuẩn hóa toàn bộ route liên quan.
- List API phần lớn chưa có pagination.
- Một số response còn thiếu display field hoặc trả relation quá rộng.
- Upload endpoint cần validate loại file và dung lượng.

## Ưu Tiên Làm Việc

Sửa đúng nghiệp vụ trước, sau đó chuẩn hóa API contract, rồi mới dọn kiến trúc/performance.
