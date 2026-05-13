# Danh Sách Kiểm Thử

Chạy các kiểm tra liên quan trước khi kết thúc task backend.

## Static Checks

- `npm run lint`
- `npm run build`

## Test Scoring

- Deduction thường dùng đúng trọng số group.
- CCP làm điểm group về 0.
- RISK làm final score về 0 và grade `alarm`.
- Lỗi lặp lần 1 dùng x1.
- Lỗi lặp lần 2 dùng x2.
- Lỗi lặp lần 3 dùng x3.
- Lỗi lặp lần 4 auto CCP.
- Lỗi lặp lần 5 reset về x1.
- Draft audit không ảnh hưởng lịch sử repeat.
- Store khác hoặc criteria khác không ảnh hưởng repeat.

## Test RBAC

- QC không được draft/submit assignment của auditor khác.
- QC không được xem full audit plan management ngoài scope cần thiết.
- SM không được xem/cập nhật AP store khác.
- AM chỉ xem store được gán.
- QAM xem toàn bộ dữ liệu QA/QC.

## Test Action Plan

- SM chuyển `draft -> submitted`.
- QAM chuyển `submitted -> rejected`.
- SM chuyển `rejected -> submitted`.
- QAM chuyển `submitted -> closed`.
- SM không được close.
- Company admin không close nếu nghiệp vụ không đổi.

## Test Hợp Đồng API

- List endpoint trả pagination meta.
- Relation ref có display fields.
- Middleware auth error cùng response envelope.
- Audit preview/submit trả repeat info.
