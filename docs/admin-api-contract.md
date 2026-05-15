# Admin API Contract

## Nguyen Tac Chung

- Admin list endpoints tra full dataset.
- FE tu search / filter / sort / pagination.
- List endpoints khong tra `meta`.
- Mutation endpoints tra entity vua cap nhat de FE cap nhat state ngay.
- Error dung format co cau truc:

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

## Full-Fetch Strategy

| Resource | Endpoint | Shape |
|---|---|---|
| Brands | `GET /api/brands` | Full list, kem `_count.stores` |
| Stores | `GET /api/stores` | Full list kem `brand`, `am`, `manager` display fields |
| Users | `GET /api/users` | Full list kem `roleAssignments.store` display fields neu co `storeId` |
| User lookup | `GET /api/users?role=...` | Full list da filter theo role |

FE co the dung truc tiep display fields:

- `store.brand.name`, `store.brand.code`
- `store.am.fullName`, `store.am.email`
- `store.manager.fullName`, `store.manager.email`
- `user.roleAssignments[].store.name`, `store.code`

## Endpoints

| Method | Path | Auth | Ghi chu |
|---|---|---|---|
| `POST` | `/api/auth/login` | none | inactive account tra `403` |
| `GET` | `/api/auth/me` | token hop le | fresh roles tu DB |
| `POST` | `/api/auth/logout` | none | clear cookie |
| `GET` | `/api/brands` | CA, QAM | full fetch |
| `POST` | `/api/brands` | CA | create |
| `PATCH` | `/api/brands/[id]` | CA | update name/status |
| `GET` | `/api/stores` | CA, QAM | full fetch kem relation display |
| `GET` | `/api/stores/[id]` | CA, QAM | detail co nested relation |
| `POST` | `/api/stores` | CA | create |
| `PATCH` | `/api/stores/[id]` | CA | update |
| `PATCH` | `/api/stores/[id]/assign-am` | CA | assign AM nhanh |
| `GET` | `/api/users` | CA, QAM | full fetch kem store display cho role assignment |
| `POST` | `/api/users` | CA | create |
| `PATCH` | `/api/users/[id]` | CA | update profile |
| `PATCH` | `/api/users/[id]/toggle-active` | CA | toggle active |

## DTO Chinh

### Store list item

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
  brand: { id: string; code: string; name: string }
  am: { id: string; fullName: string; email: string } | null
  manager: { id: string; fullName: string; email: string } | null
}
```

### Store detail

```ts
type StoreDetail = StoreListItem
```

### User list item

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
    roleKey: string
    storeId: string | null
    store: { id: string; code: string; name: string } | null
  }>
}
```

## Quy Tac Nghiep Vu Da Code

- Brand code duoc uppercase khi tao.
- Brand code khong sua sau khi tao.
- Standard store khong duoc dung brand `CLOUD`.
- Cloud kitchen bat buoc dung brand `CLOUD`.
- `amId` phai thuoc user co role `am`.
- `amId` phai thuoc user active co role `am`.
- `managerId` phai thuoc user active co role `store_manager`.
- Tao user bat buoc co it nhat 1 role.
- Role `store_manager` bat buoc co `storeId`.
- Tao/sua role assignment phai dung store ton tai.
- Khong duoc tu disable tai khoan dang dang nhap.
- Khong duoc disable company_admin active cuoi cung.
- Password khong bao gio duoc tra ve response.
