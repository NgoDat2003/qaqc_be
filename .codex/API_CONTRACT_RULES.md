# Quy Ước Hợp Đồng API

## Response Envelope

Thành công:

```json
{
  "success": true,
  "data": {},
  "message": "optional",
  "meta": {}
}
```

Lỗi:

```json
{
  "success": false,
  "error": {
    "statusCode": 400,
    "message": "Validation failed",
    "code": "OPTIONAL_CODE",
    "details": {}
  }
}
```

Lỗi auth từ middleware cũng phải dùng cùng shape.

## Pagination

Mọi list endpoint phải hỗ trợ pagination.

Query mặc định:

- `page=1`
- `limit=20`
- max `limit=100`

Response:

```json
{
  "success": true,
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 0
  }
}
```

## Display Fields Cho Relation

API phục vụ UI không được chỉ trả foreign key khi UI cần label.

Shape dùng chung:

```ts
type StoreRef = { id: string; code: string; name: string }
type BrandRef = { id: string; code: string; name: string }
type UserRef = { id: string; fullName: string; email: string }
type ChecklistRef = { id: string; name: string; version: string; status: string }
type CriteriaGroupRef = { id: string; code: string; name: string; weight: number }
```

## Repeat Info Của Audit

Audit preview và submit phải trả repeat detail cho từng violation:

```ts
type RepeatInfo = {
  criteriaId: string
  numErrors: number
  repeatCount: number
  repeatLabel: "first" | "second" | "third" | "auto_ccp" | "reset"
  isCriticalTriggered: boolean
}
```

## Create Và Update

Create/update nên trả DTO đã hydrate đủ để UI render ngay.

Tránh:

- raw Prisma model
- relation chỉ có id
- response chỉ có message mà thiếu dữ liệu UI cần
