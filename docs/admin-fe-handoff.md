# Admin FE Handoff

## Bối cảnh

Backend Admin đã được chuyển sang Supabase Singapore và API list đã được chỉnh lại để FE có đủ display fields khi render table, drawer, dropdown.

FE không cần hiện ID thô cho Brand, Store, AM, Store Manager nữa.

## Base Rules

- Base URL local BE: `http://localhost:3000`
- Auth dùng cookie `qo_token` httpOnly.
- List API Admin trả full dataset, không có `meta` pagination.
- FE tự search, filter, sort, pagination ở client.
- Response success:

```ts
{
  success: true
  data: T
  message?: string
}
```

- Response error hiện tại:

```ts
{
  success: false
  error: {
    statusCode: number
    message: string
    code?: string
    details?: unknown
  }
}
```

## Auth

### `POST /api/auth/login`

Body:

```ts
{
  email: string
  password: string
}
```

Response:

```ts
{
  success: true
  data: {
    user: {
      id: string
      email: string
      fullName: string
    }
    activeRole: string
    availableRoles: string[]
  }
}
```

Seed admin hiện tại:

```txt
email: admin@qualityops.com
password: Test@1234
```

### `GET /api/auth/me`

Response giống login, dùng để restore session.

### `POST /api/auth/logout`

Clear cookie, response:

```ts
{
  success: true
  data: null
}
```

## Brands

### `GET /api/brands`

Auth: `company_admin`, `qa_manager`

Trả full list brand:

```ts
type BrandListItem = {
  id: string
  code: string
  name: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  _count: {
    stores: number
  }
}
```

FE dùng:

- `name` để hiển thị brand name
- `code` cho badge/code
- `_count.stores` cho metric số cửa hàng

### `POST /api/brands`

Auth: `company_admin`

Body:

```ts
{
  code: string
  name: string
}
```

Response trả brand vừa tạo.

### `PATCH /api/brands/[id]`

Auth: `company_admin`

Body:

```ts
{
  name?: string
  isActive?: boolean
}
```

Không cho sửa `code` sau khi tạo.

## Stores

### `GET /api/stores`

Auth: `company_admin`, `qa_manager`

Trả full list store và đã có relation display fields:

```ts
type StoreListItem = {
  id: string
  code: string
  name: string
  modelType: "standard" | "cloud_kitchen"
  province: string | null
  ward: string | null
  address: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string

  brandId: string
  amId: string | null
  managerId: string | null

  brand: {
    id: string
    code: string
    name: string
  }
  am: {
    id: string
    fullName: string
    email: string
  } | null
  manager: {
    id: string
    fullName: string
    email: string
  } | null
}
```

FE nên dùng trực tiếp:

- `store.brand.name` thay vì tự map `brandId`
- `store.am.fullName` thay vì hiển thị `amId`
- `store.manager.fullName` thay vì hiển thị `managerId`
- vẫn có `brandId`, `amId`, `managerId` để filter hoặc update payload

### `GET /api/stores/[id]`

Auth: `company_admin`, `qa_manager`

Response cùng shape với `StoreListItem`, dùng cho detail drawer nếu FE muốn refetch row detail.

### `POST /api/stores`

Auth: `company_admin`

Body:

```ts
{
  code: string
  name: string
  modelType: "standard" | "cloud_kitchen"
  brandId: string
  province?: string
  ward?: string
  address?: string
  amId?: string
  managerId?: string
}
```

Response trả `StoreListItem` đã hydrate `brand`, `am`, `manager`.

Validation quan trọng:

- `standard` không được dùng brand code `CLOUD`
- `cloud_kitchen` bắt buộc dùng brand code `CLOUD`
- `amId` phải là user đang active và có role `am`
- `managerId` phải là user đang active và có role `store_manager`

### `PATCH /api/stores/[id]`

Auth: `company_admin`

Body:

```ts
{
  name?: string
  modelType?: "standard" | "cloud_kitchen"
  brandId?: string
  province?: string | null
  ward?: string | null
  address?: string | null
  amId?: string | null
  managerId?: string | null
  isActive?: boolean
}
```

Response trả store đã hydrate.

### `PATCH /api/stores/[id]/assign-am`

Auth: `company_admin`

Body:

```ts
{
  amId: string
}
```

Response trả store đã hydrate.

## Users

### `GET /api/users`

Auth: `company_admin`, `qa_manager`

Trả full list user:

```ts
type UserListItem = {
  id: string
  email: string
  fullName: string
  phone: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  roleAssignments: Array<{
    id: string
    roleKey:
      | "company_admin"
      | "qa_manager"
      | "qc_auditor"
      | "am"
      | "store_manager"
      | "executive_viewer"
    storeId: string | null
    store: {
      id: string
      code: string
      name: string
    } | null
  }>
}
```

FE dùng:

- `fullName` để hiển thị người dùng
- `roleAssignments[].roleKey` để hiển thị role
- `roleAssignments[].store.name` để hiển thị cửa hàng phụ trách
- không còn cần hiện `storeId` lên UI

Lưu ý:

- User không bao giờ trả `password`
- Một số role không có store scope, lúc đó `storeId = null` và `store = null`

### `GET /api/users?role=am`

Dùng cho dropdown chọn AM.

Response vẫn là `UserListItem[]`, đã filter role `am`.

### `GET /api/users?role=store_manager`

Dùng cho dropdown chọn Store Manager.

Response vẫn là `UserListItem[]`, có `roleAssignments[].store` nếu user đang được scope vào store.

### `POST /api/users`

Auth: `company_admin`

Body:

```ts
{
  email: string
  fullName: string
  password: string
  phone?: string
  roleAssignments: Array<{
    roleKey: string
    storeId?: string
  }>
}
```

Response trả `UserListItem` đã hydrate store display.

Validation quan trọng:

- email không được trùng
- `roleAssignments` phải có ít nhất 1 role
- nếu role là `store_manager` thì bắt buộc có `storeId`

### `PATCH /api/users/[id]`

Auth: `company_admin`

Body:

```ts
{
  fullName?: string
  phone?: string | null
  roleAssignments?: Array<{
    roleKey: string
    storeId?: string | null
  }>
}
```

Response trả `UserListItem`.

Validation quan trọng:

- không được gửi trùng `roleKey`
- nếu role là `store_manager` thì bắt buộc có `storeId`
- mọi `storeId` gửi lên phải tồn tại
- response trả lại `roleAssignments[].store` đã hydrate

### `PATCH /api/users/[id]/toggle-active`

Auth: `company_admin`

Body:

```ts
{
  isActive: boolean
}
```

Response trả `UserListItem`.

Guard quan trọng:

- không được tự disable tài khoản đang đăng nhập
- không được disable `company_admin` cuối cùng còn active

## FE Implementation Notes

### Load strategy

Admin page có thể load song song:

```ts
Promise.all([
  api.get("/api/brands"),
  api.get("/api/stores"),
  api.get("/api/users"),
])
```

Sau đó FE tự xử lý:

- search
- filter
- sort
- client pagination
- metric cards

### Không cần map ID để hiển thị tên

Các field cần cho UI đã có:

```ts
store.brand.name
store.am?.fullName
store.manager?.fullName
user.roleAssignments[0]?.store?.name
```

Chỉ dùng ID cho:

- filter internal
- form submit payload
- update state sau mutation

### Update state sau mutation

Create/update response trả entity đã hydrate, FE có thể replace/upsert ngay vào cache local.

Ví dụ store update:

```ts
const updated = response.data
setStores((stores) =>
  stores.map((store) => store.id === updated.id ? updated : store)
)
```

## Performance Notes

Sau khi chuyển Supabase sang Singapore:

- `GET /api/stores` có relation display fields, cold route khoảng 300-350ms, warm cache khoảng 150-200ms HTTP local.
- `GET /api/users?role=store_manager` cold dưới 500ms, warm khoảng 200-250ms.
- `GET /api/users` warm khoảng 100-120ms.

Trong `next dev`, request đầu tiên có thể cao hơn vì route compile/hot reload. Khi kiểm tra performance, nhìn thêm header `Server-Timing`:

- `db` là thời gian query thật
- `cache` là memory cache hit
- `total` là thời gian route handler

## Known Boundaries

- Chưa có DELETE cho brand/store/user.
- Chưa có upload/avatar/logo trong Admin module.
- Chưa làm province/ward master endpoint, hiện là text field.
- Audit/Checklist/Action Plan chưa nằm trong scope rebuild Admin-first hiện tại.
