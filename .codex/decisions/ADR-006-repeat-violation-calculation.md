# ADR-006 - Cách Tính Lỗi Lặp

## Trạng Thái

Đã chấp nhận

## Quyết Định

Repeat violation count do backend tính. QC không được chọn.

## Rule

Scope:

- cùng `storeId`
- cùng `criteriaId`
- chỉ audit đã submit
- violation có `numErrors > 0`

Công thức:

```ts
const occurrence = (previousViolationCount % 5) + 1
```

Hành vi:

| Lần | Label | Hiệu lực |
|---:|---|---|
| 1 | `first` | x1 |
| 2 | `second` | x2 |
| 3 | `third` | x3 |
| 4 | `auto_ccp` | group critical |
| 5 | `reset` | x1 |

## Hệ Quả

Audit preview/submit phải trả repeat information cho UI. Input schema không được nhận repeat count do người dùng chọn.
