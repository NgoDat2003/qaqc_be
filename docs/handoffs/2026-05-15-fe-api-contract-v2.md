# FE Handoff - API Contract V2 Va Dot Toi Uu API

## Thay Doi FE Can Biet

### 1. Store list da thanh summary DTO

`GET /api/stores` khong con tra cac field detail:

- `region`
- `province`
- `district`
- `ward`
- `address`
- `am.email`
- `manager.email`

Table store nen chi dung field row-level:

- `code`
- `name`
- `modelType`
- `brand`
- `am`
- `manager`
- `isActive`

### 2. Them store detail endpoint

Khi user click row store, goi:

```txt
GET /api/stores/:id
```

Endpoint nay moi tra dia chi va email quan ly day du.

### 3. User mutation response an toan hon

`POST /api/users` va `PATCH /api/users/:id` tra DTO khong co `password`. FE khong can xu ly strip password nua.

`GET /api/users`, `POST /api/users`, `PATCH /api/users/:id` deu tra them display field cho store scope:

```ts
roleAssignments: Array<{
  id: string
  roleKey: string
  storeId: string | null
  store: { id: string; code: string; name: string } | null
}>
```

FE nen hien `roleAssignments[].store?.name` thay vi dua `storeId` thang len UI.

### 4. Analytics response khong doi shape

`GET /api/analytics/overview` giu nguyen response body, nhung backend da toi uu noi bo.

### 5. Audit list da gon hon

`GET /api/audits` khong con tra `assignment.plan` trong list response.

Neu man chi tiet audit can plan, hay goi:

```txt
GET /api/audits/:id
```

### 6. Action Plan list da gon hon

`GET /api/action-plans` khong con tra:

- `remediation`
- `closedAt`
- `closedBy`

Nhung field nay nam o detail response:

```txt
GET /api/action-plans/:id
```

## Pattern FE Nen Dung Tu Gio

| Man hinh | API nen goi |
|---|---|
| Table/list | list endpoint |
| Mo drawer/detail | detail endpoint theo id |
| Sau create/update | dung response mutation de update state neu du |
| Can nested sau | goi detail, khong doi list tra day du |

## API Con Dang Can Tach Sau

`GET /api/audit-plans/my-assignments` hien tai van tra nguyen checklist nested. Chua cat trong dot nay de tranh vo luong audit QC. FE va BE can chot contract moi truoc khi tach:

- list assignment summary
- endpoint rieng de lay checklist khi mo assignment

## Debug Performance

Trong DevTools development, cac API list co `Server-Timing`:

- `count`
- `rows`
- `db`
- `total`

Neu `rows` cao, loi nam o query lay du lieu. Neu `count` cao, loi nam o dem tong. Neu `db` thap ma `total` cao, moi nghi den code ngoai DB.

Production mac dinh khong expose header nay tru khi backend bat debug bang `ENABLE_SERVER_TIMING=true`.

## Luu Y Ve Picker / Dropdown

Hien tai FE dang co luc goi `limit=200`, nhung BE cap toi da `100`.

Voi picker/dropdown, tam thoi dung:

- `GET /api/checklists?status=published`
- `GET /api/brands`
- `GET /api/stores`
- `GET /api/users`

nhung day van la list endpoint cho table, chua phai lookup endpoint toi uu. Can tach lookup API nhe rieng o dot sau de tranh tai thua.
