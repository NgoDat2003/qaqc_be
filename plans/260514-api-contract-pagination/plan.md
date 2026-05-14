# Plan 09 - API Contract Va Pagination

## Muc Tieu

Chuan hoa cac list API de FE khong phai doan response shape, khong phai hien thi ID tho, va khong bi tai toan bo du lieu khi so luong store/audit/action plan tang.

Task nay di sau Task 3 RBAC Scope. Muc tieu la giu nguyen nghiep vu/RBAC da chot, chi chuan hoa hop dong API va query performance co ban cho list endpoints.

## Pham Vi

### Trong Scope

- Tao helper pagination dung chung.
- Chuan hoa response list ve dang:

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

- Them pagination cho list routes uu tien:
  - `GET /api/audits`
  - `GET /api/action-plans`
  - `GET /api/audit-plans`
  - `GET /api/stores`
  - `GET /api/users`
  - `GET /api/checklists`
  - `GET /api/criteria`
  - `GET /api/brands`
- Tra relation display fields can cho FE:
  - Store: `id`, `code`, `name`
  - Brand: `id`, `code`, `name`
  - User: `id`, `fullName`, `email`
  - Checklist: `id`, `name`, `version`, `status`
  - Criteria group: `id`, `code`, `name`, `weight`
- Giam `include` qua rong o list route, uu tien `select`.
- Bo sung tests cho pagination/meta/DTO display fields.

### Ngoai Scope

- Khong doi Prisma schema.
- Khong sua pagination cho detail route.
- Khong refactor service layer lon.
- Khong xu ly upload/security/CORS trong task nay.
- Khong doi workflow audit/AP/RBAC da ship.
- Khong doi response cua mutation neu chua can cho FE.

## Hien Trang Code

| Route | Van de chinh | Ghi chu |
|---|---|---|
| `GET /api/audits` | Khong pagination, tra array, dung `findMany` toan bo theo scope. | Da co RBAC scope tu Task 3. |
| `GET /api/action-plans` | Khong pagination, tra array, count chua theo scope. | Da co store scope va filter status/storeId. |
| `GET /api/audit-plans` | Khong pagination, include assignments rong. | Chi admin/QAM. |
| `GET /api/stores` | Khong pagination, include relation tuong doi on. | Can meta va DTO on dinh. |
| `GET /api/users` | Khong pagination, include roleAssignments toan bo. | Da remove password thu cong. |
| `GET /api/checklists` | Khong pagination, include sau sections/items/criteria. | List nen tra summary, detail route tra nested. |
| `GET /api/criteria` | Khong pagination, group thieu `id/weight`. | Can display field group day du hon. |
| `GET /api/brands` | Khong pagination. | Co `_count.stores`. |

## Thiet Ke De Xuat

### 1. Pagination Helper

Tao file:

```txt
src/lib/pagination.ts
```

API de xuat:

```ts
export type PaginationParams = {
  page: number
  limit: number
  skip: number
  take: number
}

export type PaginationMeta = {
  page: number
  limit: number
  total: number
  totalPages: number
}

export function getPaginationParams(searchParams: URLSearchParams): PaginationParams
export function getPaginationMeta(params: PaginationParams, total: number): PaginationMeta
```

Rule:

- `page` mac dinh `1`.
- `limit` mac dinh `20`.
- `limit` toi da `100`.
- `page < 1`, khong phai so, rong -> fallback `1`.
- `limit < 1`, khong phai so, rong -> fallback `20`.
- `totalPages = Math.ceil(total / limit)`.

### 2. List Query Pattern

Pattern cho moi list route:

```ts
const { searchParams } = new URL(request.url)
const pagination = getPaginationParams(searchParams)
const where = buildWhere(searchParams, user)
const [total, rows] = await prisma.$transaction([
  prisma.model.count({ where }),
  prisma.model.findMany({ where, skip: pagination.skip, take: pagination.take, orderBy, select }),
])
return response.success(rows, undefined, getPaginationMeta(pagination, total))
```

Yeu cau quan trong:

- `count.where` phai dung cung `where` voi `findMany`.
- Voi route co RBAC scope, scope phai ap dung truoc khi count.
- Neu ngoai scope tra rong, van tra `meta.total = 0`.

### 3. DTO Mapper Nhe

Khong can service layer lon trong task nay. Chi tao mapper/helper khi giup tranh lap.

File co the tao:

```txt
src/lib/api-dto.ts
```

Hoac de mapper local trong route neu chi dung mot noi.

DTO uu tien:

```ts
type StoreRef = { id: string; code: string; name: string }
type BrandRef = { id: string; code: string; name: string }
type UserRef = { id: string; fullName: string; email: string }
type ChecklistRef = { id: string; name: string; version: string; status: string }
type CriteriaGroupRef = { id: string; code: string; name: string; weight: number }
```

### 4. Khong Lam Vo FE Dot Ngot

Day la breaking change voi list route neu FE dang doc truc tiep array tu `data`.

Truoc khi merge, can cap nhat docs/contract:

- List API van dung `response.success`.
- Data van la array o `data`.
- FE can doc them `meta`.
- Khong doi detail/mutation ngoai phan can hydrate.

## Thu Tu Trien Khai

### Buoc 1 - Helper Va Test Nen

Files:

- `src/lib/pagination.ts`
- `tests/run-tests.ts`
- `tsconfig.test.json` neu can include da du.

Viec lam:

- Tao helper parse pagination.
- Test default page/limit.
- Test invalid query fallback.
- Test max limit cap 100.
- Test totalPages.

Acceptance:

- Unit tests pass.
- Khong dung route o buoc nay.

### Buoc 2 - Audit Va Action Plan Lists

Files:

- `src/app/api/audits/route.ts`
- `src/app/api/action-plans/route.ts`
- `tests/run-tests.ts`

Viec lam:

- Them pagination vao audit list.
- Giu nguyen RBAC union scope cua Task 3.
- Them pagination vao AP list.
- Giu filter `storeId`, `status`.
- Dung `count` cung `where`.
- Dam bao ngoai scope tra `{ data: [], meta: { total: 0 } }`.

Acceptance:

- Audit list response co `meta`.
- AP list response co `meta`.
- Multi-role scope van dung.
- `storeId` ngoai scope van khong leak.

### Buoc 3 - Master Data Lists

Files:

- `src/app/api/stores/route.ts`
- `src/app/api/users/route.ts`
- `src/app/api/brands/route.ts`
- `src/app/api/criteria/route.ts`
- `src/app/api/checklists/route.ts`
- `src/app/api/audit-plans/route.ts`

Viec lam:

- Them pagination theo pattern chung.
- Chuyen `include` rong sang `select` du UI.
- Checklist list chi tra summary va counts neu du; nested checklist detail giu cho route detail.
- Users list khong tra password, khong tra field nhay cam.

Acceptance:

- Tat ca route trong scope tra `meta`.
- Relation display fields du.
- Khong tra password.
- Khong tra checklist nested qua rong trong list neu khong can.

### Buoc 4 - API Contract Tests

Files:

- `tests/run-tests.ts`

Test can co:

- Helper pagination:
  - khong truyen query -> `page=1`, `limit=20`
  - `page=0`, `page=-1`, `page=abc` -> fallback `1`
  - `limit=0`, `limit=abc` -> fallback `20`
  - `limit=999` -> cap `100`
  - total `0` -> `totalPages=0`
  - total `41`, limit `20` -> `totalPages=3`
- Route contract:
  - `GET /api/audits?page=2&limit=10` tra meta dung.
  - Audit count dung cung scope filter.
  - `GET /api/action-plans?status=draft` tra meta dung.
  - Store/user/criteria/checklist/brand list co `meta`.
  - Relation display fields co `name/code/fullName` can thiet.

### Buoc 5 - Docs Va FE Contract

Files:

- `.codex/API_CONTRACT_RULES.md`
- `.codex/plans/05-api-contract-ui.md`
- `.codex/MEMORY.md`
- Co the tao `docs/handoffs/...` chi khi user yeu cau lai.

Viec lam:

- Cap nhat API contract da trien khai route nao.
- Cap nhat issue register `BE-008`, `BE-009` neu dong duoc.
- Khong tao handoff docs tu dong neu user khong muon.

## Rui Ro Va Cach Giam

| Rui ro | Muc | Cach giam |
|---|---|---|
| FE dang doc `data` array va chua doc `meta`. | Cao | Giu `data` van la array, chi them `meta`; bao FE contract ro. |
| Count sai scope lam lo so luong record ngoai quyen. | Cao | `count` dung cung `where` sau RBAC filter, co route tests. |
| Checklist list bi cat nested lam FE thieu data. | Trung binh | Kiem tra FE can list hay detail; neu chua chac, giu summary + counts, detail route giu nested. |
| Test file qua lon. | Trung binh | Van dung `tests/run-tests.ts` theo thoa thuan local, nhung chia section/comment ro. |
| Them helper qua truu tuong. | Thap | Chi tao pagination helper; DTO mapper chi tao neu lap ro. |

## Definition Of Done

- Branch: `codex/api-contract-pagination`.
- `GET` list routes trong scope deu co pagination meta.
- `data` van la array de FE chuyen doi nhe.
- Scope/RBAC tu Task 3 khong regression.
- Tests pass.
- Build pass.
- `.codex` docs cap nhat dung trang thai.

## Lenh Kiem Tra

```txt
npm.cmd test
npm.cmd run build
git diff --check
```

## Cook Handoff

Khi bat dau implement:

```txt
[$ck:cook] Trien khai Plan 09 API Contract Va Pagination trong plans/260514-api-contract-pagination/plan.md
```

## Cap Nhat Trien Khai 2026-05-14

Trang thai: da trien khai tren branch `codex/api-contract-pagination`.

Da lam:

- Tao `src/lib/pagination.ts`.
- Them pagination meta cho:
  - `GET /api/audits`
  - `GET /api/action-plans`
  - `GET /api/audit-plans`
  - `GET /api/stores`
  - `GET /api/users`
  - `GET /api/checklists`
  - `GET /api/criteria`
  - `GET /api/brands`
- Giu `data` la array, bo sung `meta.page`, `meta.limit`, `meta.total`, `meta.totalPages`.
- Audit/AP list dung `count` cung `where` sau RBAC/scope filter.
- Giam include rong o checklist list, chuyen sang summary + `_count`.
- Bo sung tests cho pagination helper va route-level API contract.
- Tao FE handoff tai `docs/handoffs/2026-05-14-fe-api-contract-pagination.md`.

Verification:

- `npm.cmd test`: pass `56/56`.
- `npm.cmd run build`: pass.
- `git diff --check`: pass.

Ghi chu:

- `.codex` dang bi tu choi ghi trong phien nay, nen chua sync duoc `API_CONTRACT_RULES.md`, `MEMORY.md`, `ISSUE_REGISTER.md`.
- Build van in log `Dynamic server usage` do API route doc `request.headers`, nhung exit code la 0.
