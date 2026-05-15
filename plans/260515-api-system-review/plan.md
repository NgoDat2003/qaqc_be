# Plan 10 - Ra Soat Va Chuan Hoa Toan Bo API Backend

## Muc Tieu

Ra soat lai toan bo API backend, khong chi list endpoints, de:

1. Moi endpoint tra dung luong du lieu dung theo muc dich:
   - list -> summary DTO
   - detail -> detail DTO
   - mutation -> entity da hydrate vua du de FE cap nhat state
2. Moi endpoint co performance budget ro rang va duoc do bang `Server-Timing`.
3. CRUD, workflow mutation, analytics, upload deu duoc danh gia lai ve:
   - query shape
   - payload
   - RBAC/scope
   - validation
   - transaction
   - index
   - error contract
4. FE co tai lieu chinh xac de biet:
   - goi API nao cho table
   - luc nao goi detail
   - field nao co o list/detail/mutation response
   - endpoint nao thay doi.

## Tien Do Hien Tai

### Da Trien Khai Trong Dot Dau

- Them `Server-Timing` cho cac list API.
- Tach `GET /api/stores` thanh summary DTO dung cho table.
- Them `GET /api/stores/:id` de lay detail khi mo row.
- Giam payload cua:
  - `GET /api/auth/me`
  - `POST /api/users`
  - `PATCH /api/users/:id`
  - `PATCH /api/stores/:id/assign-am`
- Toi uu `GET /api/analytics/overview` bang aggregate/count/groupBy o DB.
- Tao tai lieu:
  - `docs/reports/api-audit-baseline.md`
  - `docs/reports/api-performance-benchmark-2026-05-15.md`
  - `docs/api-contract-v2.md`
  - `docs/handoffs/2026-05-15-fe-api-contract-v2.md`
- Them script benchmark:
  - `scripts/benchmark-api.mjs`

### Con Lai

- Xu ly latency nen DB da duoc benchmark: query nhe van khoang `1.1s`.
- Tach contract `my-assignments` sau khi FE chot flow mo checklist.
- Chay `EXPLAIN ANALYZE` va quyet dinh index.
- Ra soat tiep `notifications`, `upload`, `toggle-active`, checklist workflow.
- Ke hoach fix chi tiet da tach sang:
  - `plans/260515-api-performance-remediation/plan.md`

## Ly Do Lap Ke Hoach Moi

Du lieu thuc te tu DevTools cho thay:

| Endpoint | Metric | Gia tri |
|---|---|---:|
| `GET /api/stores?page=2&limit=20` | `count` | `1.27s` |
| `GET /api/stores?page=2&limit=20` | `rows` | `2.36s` |
| `GET /api/stores?page=2&limit=20` | `db` | `2.36s` |
| `GET /api/stores?page=2&limit=20` | `total` | `2.36s` |

Ket luan:

- FE render va content download khong phai nut that.
- `rows` cham hon `count`, nen chi toi uu pagination/count la chua du.
- Van de khong chi nam o get list. Neu detail, create/update, workflow route cung tra payload qua rong hoac query sau, sau nay FE van se cham va kho dung.

Vi vay Plan 10 cu ve rieng API list duoc thay bang plan tong the nay.

## Pham Vi

### Trong Scope

- Toan bo route trong `src/app/api/**/route.ts`
- Nhom endpoint:
  - auth/session
  - master data CRUD: brand, store, user, criteria, criteria-group, checklist
  - audit planning
  - audit execution
  - action plan workflow
  - analytics/report
  - notifications
  - upload/evidence
- Chuan hoa 4 lop contract:
  - list summary DTO
  - detail DTO
  - mutation response DTO
  - error/meta response
- Ra soat:
  - performance
  - payload
  - Prisma query
  - transaction
  - RBAC/scope
  - validation
  - index
  - FE consumption pattern
- Cap nhat tai lieu handoff FE sau moi nhom thay doi.

### Ngoai Scope

- Khong doi nghiep vu QA/QC da chot.
- Khong viet lai framework hay doi Next.js/Prisma.
- Khong doi auth mechanism tru khi benchmark chung minh no la nut that.
- Khong lam UI FE trong task nay, chi viet contract/handoff cho FE.

## Nguyen Tac Thiet Ke API Moi

### 1. Tach Summary Va Detail

Khong dung mot response cho ca table va man chi tiet.

Vi du stores:

```ts
// GET /api/stores
type StoreListItem = {
  id: string
  code: string
  name: string
  modelType: string
  isActive: boolean
  brand: { id: string; code: string; name: string }
  am: { id: string; fullName: string } | null
  manager: { id: string; fullName: string } | null
}

// GET /api/stores/:id
type StoreDetail = StoreListItem & {
  region: string | null
  province: string | null
  district: string | null
  ward: string | null
  address: string | null
  am?: { id: string; fullName: string; email: string } | null
  manager?: { id: string; fullName: string; email: string } | null
}
```

Rule:

- List endpoint chi tra field dung de render list/table/filter badge.
- Detail endpoint moi tra nested relation va field dai.
- FE vao chi tiet row moi goi detail API.

### 2. Mutation Tra Ve Du De UI Cap Nhat

Mutation response khong nen raw Prisma model, cung khong nen tra qua it field lam FE phai refetch ngay lap tuc.

Rule:

- Create/update master data -> tra DTO vua du de chen/cap nhat row hien tai.
- Workflow mutation -> tra status moi + field display can hien ngay.
- Mutation co nhieu entity lien quan -> dung transaction.

### 3. Moi Endpoint Co Budget

| Loai endpoint | Budget warm muc tieu |
|---|---:|
| Auth/session | `< 250ms` |
| List summary | `< 500ms` |
| Detail | `< 700ms` |
| Simple mutation | `< 700ms` |
| Workflow mutation | `< 1000ms` |
| Analytics overview | `< 1200ms` |
| Upload | phu thuoc file, tach rieng |

Neu khong dat:

- phai co `Server-Timing`
- phai biet cham o `count`, `rows`, `scope`, `db`, `transaction`, hay `file I/O`
- neu loi ha tang DB remote/free tier, phai ghi ro.

### 4. Count La Option, Khong Phai Gan Nang Bat Buoc Moi Luc

Mac dinh list van co:

```ts
meta: { page, limit, total, totalPages }
```

Nhung sau khi FE da co contract ro, co the them:

```txt
?includeTotal=false
```

cho cac thao tac:

- doi trang lien tiep
- infinite scroll
- table ma UI khong can total ngay

Khong duoc dung no de che giau query rows cham.

### 5. Index Theo Query That

Khong them index doan mo.

Quy trinh:

1. benchmark endpoint
2. doc query shape
3. chay `EXPLAIN ANALYZE`
4. them composite index neu planner can
5. benchmark lai

## Ma Tran Danh Gia Endpoint

| Nhom | Endpoint | Kieu | Van de can kiem tra |
|---|---|---|---|
| Auth | `/api/auth/login` | mutation | bcrypt cost, response, cookie |
| Auth | `/api/auth/me` | detail/session | co can query DB moi lan, DTO toi thieu |
| Brand | `/api/brands` | list/create | summary vs detail, `_count`, count |
| Brand | `/api/brands/:id` | detail/update | field nao can detail, unique checks |
| Store | `/api/stores` | list/create | rows cham, relation, field dai, filters |
| Store | `/api/stores/:id` | detail/update | nested relation, detail DTO |
| Store | `/api/stores/:id/assign-am` | workflow mutation | validation, hydrate response |
| User | `/api/users` | list/create | roleAssignments payload, bcrypt create |
| User | `/api/users/:id` | detail/update | role mutation, raw include |
| User | `/api/users/:id/toggle-active` | mutation | response DTO, side effect |
| Criteria | `/api/criteria` | list/create | summary DTO, filter/index |
| Criteria | `/api/criteria/:id` | detail/update | group relation |
| Criteria group | `/api/criteria-groups` | list/create | co can pagination khong |
| Criteria group | `/api/criteria-groups/:id` | detail/update/delete | delete guard/count |
| Checklist | `/api/checklists` | list/create | summary DTO da co, count |
| Checklist | `/api/checklists/:id` | detail/update | nested sections/items |
| Checklist | publish/archive/sections/items | workflow mutation | transaction, snapshot rule |
| Audit plan | `/api/audit-plans` | list/create | summary vs assignment detail |
| Audit plan | `/api/audit-plans/:id` | detail | nested assignments |
| Audit plan | close/my-assignments | workflow/list | payload QC, relation sau |
| Audit | `/api/audits` | list | scope + rows/count |
| Audit | `/api/audits/:id` | detail | nested violations/evidence |
| Audit | calculate/draft/submit/checklist | workflow | transaction, repeat, payload |
| Action plan | `/api/action-plans` | list | status/store filters, count/rows |
| Action plan | detail/update/submit/confirm/close | workflow | RBAC, DTO, transition |
| Analytics | `/api/analytics/overview` | aggregate | fetch-all vs aggregate DB |
| Notification | `/api/notifications` | list/mutation | take 50, unread count, pagination |
| Upload | `/api/upload/evidence` | file mutation | file size, validation, I/O, URL |

## Ke Hoach Thuc Thi

### Phase 1 - Lap Baseline Toan He Thong

Tao bang inventory cho tat ca endpoint:

- method
- route
- actor
- response shape hien tai
- query pattern
- nested relation
- co transaction khong
- co validation khong
- performance timing
- FE screen su dung

Them `Server-Timing` theo loai:

- list: `count`, `rows`, `scope`, `db`, `total`
- detail: `lookup`, `relations`, `scope`, `total`
- mutation: `validate`, `lookup`, `transaction`, `total`
- analytics: tung aggregate rieng
- upload: `validate`, `write`, `total`

Output:

- `docs/reports/api-audit-baseline.md`
- bang benchmark warm/cold cho endpoint uu tien.

### Phase 2 - Chot Contract Pattern Moi

Viet quy dinh chinh thuc:

- list response
- detail response
- mutation response
- error response
- pagination/count option
- display relation fields
- field nao chi detail moi co

Output:

- cap nhat `docs/handoffs/...`
- cap nhat `.codex/API_CONTRACT_RULES.md` neu ghi duoc
- tao `docs/api-contract-v2.md` neu can tach tai lieu FE.

### Phase 3 - Toi Uu Read APIs

Thu tu uu tien:

1. `stores`
2. `users`
3. `audits`
4. `action-plans`
5. `audit-plans`
6. `brands`
7. `criteria`
8. `checklists`
9. `my-assignments`
10. `analytics`

Voi moi endpoint:

1. tach summary/detail neu can
2. cat field thua khoi list
3. doi include -> select
4. benchmark lai
5. them index neu query plan can
6. viet test contract

### Phase 4 - Ra Soat CRUD Va Workflow Mutations

Voi moi POST/PATCH/DELETE/action route:

- input validation da du chua
- lookup co thua query khong
- mutation co transaction can thiet khong
- response co du de FE cap nhat ngay khong
- co tra raw Prisma model khong
- RBAC/scope co dung business rule khong
- conflict/duplicate/not found/status transition co format loi dong nhat khong

Uu tien:

1. store create/update/assign-am
2. user create/update/toggle
3. checklist publish/archive/sections/items
4. audit draft/submit/calculate
5. AP update/submit/reject/close

### Phase 5 - Analytics, Notifications, Upload

- `analytics/overview`:
  - bo fetch-all
  - chuyen sang aggregate/count/groupBy
- `notifications`:
  - danh gia take 50 co du
  - co can unread count/meta khong
- `upload/evidence`:
  - validation file
  - max size/type
  - response DTO
  - cleanup/orphan policy

### Phase 6 - DB Va Index Pass

Sau khi query shape da gon:

- chay query plan cho endpoint cham
- them migration index co chung cu
- benchmark truoc/sau

Index ung vien hien tai:

```prisma
Store:
  [brandId, code]
  [isActive, code]
  [brandId, isActive, code]

Audit:
  [storeId, submittedAt]
  [auditorId, submittedAt]

ActionPlan:
  [storeId, status, createdAt]
  [storeId, deadline, status]

AuditAssignment:
  [auditorId, status, scheduledDate]

RoleAssignment:
  [userId, roleKey, storeId]
```

### Phase 7 - Test, Handoff, Rule Hoa

Them test:

- list summary khong tra field detail
- detail co field day du
- mutation tra DTO dung contract
- pagination/meta/`includeTotal`
- RBAC/scope regression
- action transition regression
- benchmark smoke neu co the

Tai lieu:

- `docs/reports/api-audit-baseline.md`
- `docs/reports/api-audit-final.md`
- `docs/handoffs/<date>-fe-api-contract-v2.md`

## Thu Tu Uu Tien Lam That

### Dot 1 - Fix Roi Thay Ngay

1. Inventory endpoint + baseline timing
2. Tach `stores list` summary/detail
3. Toi uu `users list`
4. Toi uu `my-assignments`
5. Toi uu `analytics overview`

### Dot 2 - Chuan Hoa CRUD

1. store/user/brand/criteria mutations
2. checklist mutations
3. audit/AP workflow mutations

### Dot 3 - DB Pass Cuoi

1. query plan
2. index migration
3. benchmark final
4. FE handoff final

## Acceptance Criteria

- Tat ca endpoint co dong danh gia trong inventory.
- Moi list route co summary DTO ro.
- Moi detail route co detail DTO ro.
- Mutation route khong tra raw Prisma model vo toi va.
- Endpoint uu tien co `Server-Timing` tach dung lop.
- Khong con endpoint table mac dinh fetch relation/field detail khong can.
- Co bang benchmark truoc/sau.
- Co tai lieu cho FE biet ro API nao da doi.
- Tests pass, typecheck pass, build pass sau khi lam sach `.next`.

## Rui Ro Va Cach Giam

| Rui ro | Cach giam |
|---|---|
| FE dang dung field detail trong list | Viet handoff truoc, test contract, doi co kiem soat |
| Refactor qua rong | Lam theo dot, uu tien read path truoc |
| Them index khong dung | Chi them sau `EXPLAIN ANALYZE` |
| DB remote lam benchmark nhieu | Ghi warm/cold, ping DB, nhieu lan mau |
| Mutation response doi lam FE vo | Quy dinh DTO va cung cap mapping before/after |

## Quan He Voi Cac Plan Truoc

- Thay the `plans/260515-api-list-performance/plan.md`.
- Ke thua ket qua cua `plans/260514-api-contract-pagination/plan.md`.
- Khong thay doi business rules/RBAC da ship.

## Lenh Trien Khai De Xuat

```txt
[$ck:cook](C:\Users\ACER\.codex\skills\cook\SKILL.md) Trien khai Plan 10 ra soat va chuan hoa toan bo API trong plans/260515-api-system-review/plan.md
```
