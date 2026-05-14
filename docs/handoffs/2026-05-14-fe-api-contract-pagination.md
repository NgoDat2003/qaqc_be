# FE Handoff - API Contract Và Pagination

## Tổng Quan

Backend branch `codex/api-contract-pagination` đã chuẩn hóa các list API chính để FE đọc dữ liệu theo cùng một contract:

```ts
{
  success: true
  data: T[]
  message?: string
  meta: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}
```

Điểm quan trọng: `data` vẫn là array như trước, backend chỉ thêm `meta`. FE cần chuyển các list screen sang đọc `response.data` và `response.meta`.

## Query Pagination

Mọi route trong scope nhận query:

```txt
page=1
limit=20
```

Rule backend:

- `page` mặc định là `1`.
- `limit` mặc định là `20`.
- `limit` tối đa là `100`.
- Query sai như `page=abc`, `page=-1`, `limit=0`, `limit=abc` sẽ fallback về default.

Ví dụ:

```txt
GET /api/audits?page=2&limit=10
```

FE nên dùng:

```ts
const rows = response.data
const { page, limit, total, totalPages } = response.meta
```

## Route Đã Có Pagination Meta

| Route | Ghi chú cho FE |
|---|---|
| `GET /api/audits` | Có scope theo role, có `store`, `assignment.plan`, score/grade/submittedAt. |
| `GET /api/action-plans` | Có filter `storeId`, `status`, có `store`, audit summary, `closedBy`. |
| `GET /api/audit-plans` | Trả plan summary, checklist summary và `_count.assignments`. |
| `GET /api/stores` | Có filter `brandId`, `isActive`, có brand/AM/manager display fields. |
| `GET /api/users` | Không trả `password`, có roleAssignments. |
| `GET /api/checklists` | Trả checklist summary + `_count`, không trả nested sections/items/criteria trong list. |
| `GET /api/criteria` | Có filter `groupId`, group trả đủ `id/code/name/weight`. |
| `GET /api/brands` | Có `_count.stores`. |

## Trước Và Sau

### Trước Task Này

List API thường trả:

```ts
{
  success: true
  data: T[]
}
```

Một số route trả relation rất rộng, ví dụ checklist list trả cả `sections/items/criteria`, audit plan list trả cả `assignments`.

### Sau Task Này

List API chính trả:

```ts
{
  success: true
  data: T[]
  meta: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}
```

FE không nên dùng `data.length` để tính tổng record nữa. Dùng `meta.total`.

## Contract Theo Endpoint

### `GET /api/audits`

Query:

```txt
page?: number
limit?: number
storeId?: string
```

Data item chính:

```ts
{
  id: string
  finalScore: number
  grade: string
  isRiskTriggered: boolean
  submittedAt: string | null
  createdAt: string
  store: {
    id: string
    code: string
    name: string
  }
  assignment: {
    plan: {
      id: string
      name: string
    } | null
  } | null
}
```

FE cần sửa:

- Table audit dùng `meta.total` cho tổng số dòng.
- Store label dùng `store.code` + `store.name`.
- Plan label dùng `assignment.plan.name` nếu có.

### `GET /api/action-plans`

Query:

```txt
page?: number
limit?: number
storeId?: string
status?: "draft" | "submitted" | "rejected" | "closed"
```

Data item chính:

```ts
{
  id: string
  status: string
  remediation: string | null
  deadline: string | null
  createdAt: string
  updatedAt: string
  closedAt: string | null
  store: {
    id: string
    code: string
    name: string
  }
  audit: {
    id: string
    finalScore: number
    grade: string
    submittedAt: string | null
  }
  closedBy: {
    id: string
    fullName: string
    email: string
  } | null
}
```

FE cần sửa:

- Status filter chỉ dùng 4 status chính thức.
- Nếu backend trả `data=[]` và `meta.total=0`, đó có thể là do ngoài store scope, không phải lỗi UI.

### `GET /api/audit-plans`

Data item chính:

```ts
{
  id: string
  name: string
  type: string
  scope: string
  status: string
  createdAt: string
  updatedAt: string
  form: {
    id: string
    name: string
    version: string
    status: string
  }
  _count: {
    assignments: number
  }
}
```

FE cần sửa:

- List screen không đọc `assignments` trực tiếp nữa.
- Muốn xem store/auditor assignment thì gọi detail route `GET /api/audit-plans/:id`.

### `GET /api/stores`

Query:

```txt
page?: number
limit?: number
brandId?: string
isActive?: "true" | "false"
```

Data item có display fields:

```ts
{
  id: string
  code: string
  name: string
  modelType: string
  region: string | null
  province: string | null
  district: string | null
  ward: string | null
  address: string | null
  isActive: boolean
  brand: { id: string; code: string; name: string }
  am: { id: string; fullName: string; email: string } | null
  manager: { id: string; fullName: string; email: string } | null
}
```

FE cần sửa:

- Store picker/table có thể hiển thị brand/AM/manager ngay, không cần lookup thêm.
- Khi dùng filter brand/active, vẫn gửi kèm `page/limit`.

### `GET /api/users`

Data item chính:

```ts
{
  id: string
  email: string
  fullName: string
  phone: string | null
  isActive: boolean
  roleAssignments: Array<{
    id: string
    roleKey: string
    storeId: string | null
  }>
}
```

FE cần sửa:

- Không expect `password`.
- Role display đọc từ `roleAssignments`.

### `GET /api/checklists`

Data item chính:

```ts
{
  id: string
  name: string
  version: string
  status: string
  publishedAt: string | null
  createdAt: string
  updatedAt: string
  _count: {
    sections: number
    auditPlans: number
    audits: number
  }
}
```

FE cần sửa:

- Checklist list/table chỉ dùng summary.
- Checklist builder/detail phải gọi detail route.

### `GET /api/criteria`

Query:

```txt
page?: number
limit?: number
groupId?: string
```

Data item chính:

```ts
{
  id: string
  code: string
  content: string
  deductionPerError: number
  maxDeduction: number
  flag: "none" | "critical" | "risk"
  isActive: boolean
  group: {
    id: string
    code: string
    name: string
    weight: number
  }
}
```

FE cần sửa:

- Criteria table/picker dùng `group.code`, `group.name`, `group.weight`.

### `GET /api/brands`

Data item chính:

```ts
{
  id: string
  code: string
  name: string
  isActive: boolean
  _count: {
    stores: number
  }
}
```

FE cần sửa:

- Brand list dùng `_count.stores` nếu cần hiển thị số store.

## API Client Gợi Ý

FE có thể định nghĩa type chung:

```ts
type PaginationMeta = {
  page: number
  limit: number
  total: number
  totalPages: number
}

type ListResponse<T> = {
  success: true
  data: T[]
  message?: string
  meta: PaginationMeta
}
```

Với React Query/TanStack Query, query key nên đưa filter + pagination vào:

```ts
["audits", { page, limit, storeId }]
["action-plans", { page, limit, storeId, status }]
```

## Breaking Change Mềm FE Cần Chú Ý

### Checklist List

Trước đây `GET /api/checklists` trả nested sâu:

```txt
sections -> items -> criteria
```

Hiện list route chỉ trả summary:

```ts
{
  id: string
  name: string
  version: string
  status: string
  publishedAt: string | null
  createdAt: string
  updatedAt: string
  _count: {
    sections: number
    auditPlans: number
    audits: number
  }
}
```

Nếu FE cần builder/detail đầy đủ sections/items/criteria, hãy dùng detail route `GET /api/checklists/:id`.

### Audit Plan List

Trước đây `GET /api/audit-plans` include assignments rộng. Hiện list route chỉ trả summary:

```ts
{
  id: string
  name: string
  type: string
  scope: string
  status: string
  createdAt: string
  updatedAt: string
  form: {
    id: string
    name: string
    version: string
    status: string
  }
  _count: {
    assignments: number
  }
}
```

Nếu FE cần assignment list chi tiết, dùng detail route `GET /api/audit-plans/:id`.

## Display Fields Đã Đảm Bảo

Backend đã ưu tiên các display fields FE cần để không hiển thị ID thô:

- Store: `id`, `code`, `name`
- Brand: `id`, `code`, `name`
- User: `id`, `fullName`, `email`
- Checklist: `id`, `name`, `version`, `status`
- Criteria group: `id`, `code`, `name`, `weight`

## Scope Và Count

Các route có scope như audit/action plan vẫn filter theo backend:

- `qc_auditor`: audit của chính mình.
- `store_manager`: store được gán.
- `am`: store được gán.
- `qa_manager`, `company_admin`, `executive_viewer`: tùy route, thường đọc rộng.

`meta.total` được tính theo đúng scope/filter hiện tại, không phải tổng toàn hệ thống.

Ví dụ SM gọi AP store ngoài scope:

```json
{
  "success": true,
  "data": [],
  "meta": {
    "page": 2,
    "limit": 5,
    "total": 0,
    "totalPages": 0
  }
}
```

## Route Chưa Nằm Trong Scope Task Này

Các route sau chưa được chuẩn hóa pagination trong task hiện tại:

- `GET /api/criteria-groups`
- `GET /api/notifications`
- `GET /api/audit-plans/my-assignments`
- Các detail route.
- Các create/update mutation response.

## Test Backend Đã Chạy

```txt
npm.cmd test
56/56 tests passed

npm.cmd run build
pass

git diff --check
pass
```

Build vẫn có log `Dynamic server usage` do API route đọc `request.headers`, nhưng exit code là `0`.

## Checklist FE Cần Làm

- Update API client list response type để có `meta`.
- Các table/list screen dùng `meta.total` và `meta.totalPages`.
- Checklist list không đọc `sections` từ list response nữa.
- Audit plan list không đọc `assignments` từ list response nữa.
- Với detail/builder, gọi detail route riêng.
- Khi filter theo `storeId`, `status`, `brandId`, `isActive`, pagination vẫn gửi kèm `page/limit`.
