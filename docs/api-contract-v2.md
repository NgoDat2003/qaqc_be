# API Contract V2

## Nguyen Tac Chung

### List

List endpoint dung cho table va picker. Chi tra field can de render row:

```ts
{
  success: true
  data: TSummary[]
  meta: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}
```

### Detail

Detail endpoint duoc goi khi user mo mot row:

```ts
{
  success: true
  data: TDetail
}
```

Detail moi la noi tra:

- dia chi day du
- relation day du
- nested children
- audit trail / evidence / sections / violations

### Mutation

Mutation khong tra raw Prisma model. Response phai du de FE cap nhat man hinh hien tai:

- create list item -> tra summary vua tao
- update detail -> tra detail hoac mutation summary ro rang
- workflow transition -> tra `id`, `status`, cac display field vua thay doi

## Stores

### `GET /api/stores`

Dung cho table.

```ts
type StoreListItem = {
  id: string
  code: string
  name: string
  modelType: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  brand: { id: string; code: string; name: string }
  am: { id: string; fullName: string } | null
  manager: { id: string; fullName: string } | null
}
```

Khong con tra trong list:

- `region`
- `province`
- `district`
- `ward`
- `address`
- `am.email`
- `manager.email`

### `GET /api/stores/:id`

Dung khi mo row chi tiet.

```ts
type StoreDetail = StoreListItem & {
  region: string | null
  province: string | null
  district: string | null
  ward: string | null
  address: string | null
  am: { id: string; fullName: string; email: string } | null
  manager: { id: string; fullName: string; email: string } | null
}
```

## Users

### `POST /api/users`

Response khong bao gio tra `password`.

```ts
{
  id
  email
  fullName
  phone
  isActive
  createdAt
  updatedAt
  roleAssignments: Array<{
    id
    roleKey
    storeId
    store: { id; code; name } | null
  }>
}
```

### `PATCH /api/users/:id`

Tra cung safe DTO nhu create.

## Auth

### `GET /api/auth/me`

Chi select cac field can thiet:

```ts
{
  user: { id; email; fullName }
  activeRole: string
  availableRoles: string[]
}
```

## Analytics

### `GET /api/analytics/overview`

Contract response khong doi, nhung backend tinh bang aggregate query thay vi fetch toan bo du lieu roi tinh tren RAM.

## Audits

### `GET /api/audits`

Dung cho table audit.

Khong con tra trong list:

- `assignment.plan`

Neu man chi tiet can thong tin plan, goi `GET /api/audits/:id`.

## Action Plans

### `GET /api/action-plans`

Dung cho table AP.

Khong con tra trong list:

- `remediation`
- `closedAt`
- `closedBy`

Neu can noi dung xu ly hoac nguoi dong AP, goi `GET /api/action-plans/:id`.

## Performance Header

Trong development, list APIs tra `Server-Timing`:

- `count`
- `rows`
- `db`
- `total`

Dung trong Chrome DevTools de tach loi FE/BE/DB.

Production mac dinh khong expose header nay. Chi bat khi can debug co chu dich bang:

```txt
ENABLE_SERVER_TIMING=true
```
