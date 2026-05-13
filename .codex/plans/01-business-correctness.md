# Plan 01 - Đúng Nghiệp Vụ

## Vấn Đề Hiện Tại

- QC từng có thể draft/submit assignment không thuộc mình.
- Audit sau submit cần khóa với QC.
- AP cần được tạo rõ ràng sau audit submit có lỗi.

## Hành Vi Mục Tiêu

- QC chỉ thao tác assignment có `assignment.auditorId` bằng user hiện tại.
- Draft chỉ sửa được trước submit.
- Submit khóa assignment và audit.
- Audit submit có violation `numErrors > 0` thì backend tạo Action Plan `draft`.

## Cách Triển Khai

- Thêm ownership check cho draft và submit.
- Reject submit nếu assignment đã `completed`.
- Giữ draft write trong transaction.
- Submit ghi audit, group scores, violations, assignment completed và AP creation trong một transaction.

## Kiểm Thử

- QC không draft assignment của người khác.
- QC không submit assignment của người khác.
- Assignment completed không submit lại được.
- Audit có lỗi tạo AP.
- Audit không lỗi không tạo AP.
