# ADR-004 - State Machine Của Action Plan

## Trạng Thái

Đã chấp nhận

## Quyết Định

Trạng thái Action Plan hợp lệ:

```txt
draft, submitted, rejected, closed
```

Transition hợp lệ:

```txt
draft -> submitted
submitted -> rejected
rejected -> submitted
submitted -> closed
```

## Quy Tắc Theo Role

- SM cập nhật và submit.
- QAM reject hoặc close.
- SM không tự close.
- Không dùng `confirmed` và `in_review`.

## Hệ Quả

Code cũ còn check `confirmed` hoặc ghi `in_progress` phải sửa.
