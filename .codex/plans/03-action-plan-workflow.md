# Kế Hoạch 03 - Luồng Kế Hoạch Hành Động

## Vấn Đề Hiện Tại

- Code còn dùng status không thuộc workflow cuối.
- Không dùng `confirmed` và `in_review`.
- Một số route cũ còn cho company admin close/confirm AP.

## Hành Vi Mục Tiêu

Trạng thái hợp lệ:

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

## Rule Theo Role

- SM cập nhật và submit AP cho store mình.
- QAM reject hoặc close AP.
- SM không close AP.
- Company admin mặc định không close AP.

## Cách Triển Khai

- Sửa guard và status check ở AP routes.
- Bỏ toàn bộ usage `confirmed`.
- Dùng `rejected` khi QAM trả AP về cho SM sửa.
- Chỉ set `closedById` và `closedAt` khi AP được close.
- Có thể thêm review/reject note sau nếu schema hỗ trợ.

## Kiểm Thử

- Reject transition sai.
- SM không close được.
- QAM close AP submitted.
- QAM reject AP submitted.
- SM resubmit AP rejected.
