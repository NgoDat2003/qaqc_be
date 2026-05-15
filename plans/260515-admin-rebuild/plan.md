---
title: "Admin Rebuild Plan"
status: "planned"
created: "2026-05-15"
branchTarget: "dev"
sourceReferenceBranch: "main"
blockedBy: []
blocks: []
---

# Plan - Rebuild Luong Admin

## Tong Quan

Bat dau lai theo **role-first**, khong theo endpoint-first.

Luong dau tien duoc dung de lay lai quyen kiem soat he thong la `company_admin`, vi admin tao nen nen du lieu cho tat ca role sau:

- user
- role assignment
- brand
- store
- gan manager / AM
- cac danh muc master can cho QA/QC ve sau

Plan nay chi danh cho **Admin Foundation**. Khong dua audit, scoring, action plan, analytics vao dot nay.

Trang thai hien tai:

- Da tach nhanh `dev` tu `main`.
- **Khong don, khong reset, khong seed lai database** trong dot nay.
- Da nhan tai lieu API/flow Admin tu FE:
  - `D:\work\maycha\qaqc-build\qaqc-fe\plans\260515-1355-dev-branch-admin-first\be-requirements-full.md`
- Tren `dev`, don source ve skeleton toi thieu de khong ke thua module nghiep vu cu mot cach nua voi.

## Quyet Dinh Nhanh

| Hang muc | Quyet dinh |
|---|---|
| Baseline hien tai | `main` da gom cac thay doi V1 va la diem cat nhanh chinh thuc |
| Nhanh trien khai moi | Tao `dev` tu `main`, sau do lam moi theo role |
| Huong rebuild | Role-first, module nho, moi dot co DoD rieng |
| Tai lieu V1 | Chi dung lam reference, khong de dan duong trien khai moi |
| Database hien tai | Giu nguyen, khong dung vao neu chua co yeu cau ro |
| Dau vao bat buoc truoc khi code | Da nhan tai lieu API/flow Admin tu FE |
| Source tren `dev` | Giu infra + auth, go cac module nghiep vu cu va CRUD Admin cu |
| Khi nao sang role tiep | Chi sau khi Admin DoD dat 100% |

## Muc Tieu Cua Luong Admin

Sau dot nay, mot `company_admin` phai co the:

1. Dang nhap va xem thong tin phien hien tai.
2. Quan ly brand.
3. Quan ly store.
4. Tao user.
5. Gan role cho user.
6. Gan store scope cho `store_manager` va `am`.
7. Bat/tat user.
8. Gan AM cho store.
9. Tim thay du lieu bang ten/code, khong phai doc foreign key tran.

Neu cac viec tren chua tron ven, khong sang QAM.

## Ngoai Pham Vi Dot Nay

- reset / truncate / reseed database
- sua schema chi de phuc vu viec "lam moi"
- criteria / criteria group
- checklist
- audit plan
- audit execution
- scoring
- action plan
- dashboard / analytics
- performance tuning nang
- upload evidence

Nhung phan nay se quay lai sau khi cac role nen da dung.

## Skeleton Sau Khi Don Tren `dev`

### Giu Lai

- `prisma/` va schema hien tai
- `src/lib/prisma.ts`
- `src/lib/auth.ts`
- `src/lib/api-response.ts`
- `src/lib/rbac.ts`
- `src/middleware.ts`
- `src/app/api/auth/*`
- khung app Next.js

### Go Khoi Source Tren `dev`

- action plan
- analytics
- audit plan
- audit
- checklist
- criteria / criteria group
- notification
- upload evidence
- CRUD brand/store/user cu
- cac helper domain cu chi phuc vu nhom tren

Muc dich la de khi nhan tai lieu FE, Admin duoc dung lai theo contract moi thay vi tiep tuc chong them vao lop API cu.

## Nguyen Tac Thiet Ke Lai

### 1. Admin la mot workflow day du, khong phai mot cum CRUD roi rac

Moi API duoc tao vi no phuc vu mot thao tac admin cu the:

- tao brand de dung cho store
- tao store de gan user / lam doi tuong audit sau nay
- tao user va gan role de mo khoa cac role tiep theo

### 2. List, detail, mutation tach ro

```txt
list    -> du de ve bang
detail  -> du de mo drawer/detail
mutation -> du de FE cap nhat state ngay
```

Khong de FE phai hien ID tran khi UI can label.

### 3. Khong lay technical cleanup lam muc tieu chinh

Trong dot Admin:

- co pagination va contract ro
- co validation / RBAC dung
- co test route-level can thiet

Nhung khong toi uu qua sau truoc khi flow dung va de hieu.

### 4. Moi module phai co DoD rieng

Mot module chua co:

- API contract
- validation
- route test
- FE handoff ngan gon

thi chua duoc coi la xong.

## Kien Truc Dich Cho Dot Admin

```txt
src/app/api/auth/
src/app/api/brands/
src/app/api/stores/
src/app/api/users/

src/services/
  admin-user.service.ts
  admin-store.service.ts
  admin-brand.service.ts

src/dto/
  admin-user.dto.ts
  admin-store.dto.ts
  admin-brand.dto.ts

src/lib/
  api-response.ts
  pagination.ts
  rbac.ts
```

Ghi chu:

- Khong bat buoc tach service ngay o commit dau tien.
- Nhung khi business logic bat dau lap lai giua route create/update/detail, phai tach som, khong de route phinh tiep.

## Pham Vi Chuc Nang Admin

### A. Auth Co Ban

| Chuc nang | API | Ghi chu |
|---|---|---|
| Dang nhap | `POST /api/auth/login` | Tra user + roles, set cookie |
| Xem phien | `GET /api/auth/me` | Tra fresh roles |
| Dang xuat | `POST /api/auth/logout` | Xoa cookie |

### B. Brand

| Chuc nang | API | Bat buoc |
|---|---|---|
| List | `GET /api/brands` | pagination, search neu can |
| Tao | `POST /api/brands` | unique code/name |
| Chi tiet | `GET /api/brands/:id` | neu FE can drawer/detail |
| Cap nhat | `PATCH /api/brands/:id` | khong tra raw model qua rong |

### C. Store

| Chuc nang | API | Bat buoc |
|---|---|---|
| List | `GET /api/stores` | co brand display fields |
| Tao | `POST /api/stores` | validate brand, manager neu co |
| Chi tiet | `GET /api/stores/:id` | dia chi day du |
| Cap nhat | `PATCH /api/stores/:id` | validate brand/model |
| Gan AM | `PATCH /api/stores/:id/assign-am` | chi admin |

### D. User Va Role

| Chuc nang | API | Bat buoc |
|---|---|---|
| List | `GET /api/users` | co role + store display fields |
| Tao | `POST /api/users` | hash password, safe DTO |
| Cap nhat | `PATCH /api/users/:id` | update role assignments |
| Bat/tat | `PATCH /api/users/:id/toggle-active` | chi admin |

## Contract Toi Thieu Can Chot

### `UserSummary`

```ts
type UserSummary = {
  id: string
  email: string
  fullName: string
  phone: string | null
  isActive: boolean
  roleAssignments: Array<{
    id: string
    roleKey: string
    storeId: string | null
    store: { id: string; code: string; name: string } | null
  }>
}
```

### `StoreSummary`

```ts
type StoreSummary = {
  id: string
  code: string
  name: string
  modelType: "standard" | "cloud_kitchen"
  isActive: boolean
  brand: { id: string; code: string; name: string }
  am: { id: string; fullName: string } | null
  manager: { id: string; fullName: string } | null
}
```

### `BrandSummary`

```ts
type BrandSummary = {
  id: string
  code: string
  name: string
  isActive: boolean
  storeCount: number
}
```

## Trinh Tu Trien Khai

### Phase 0 - Chot Lai Nen Trien Khai

1. Xac nhan `main` la baseline hien tai sau khi da merge.
2. Tao nhanh `dev` tu `main`.
3. Giu nguyen database hien tai, khong thao tac xoa du lieu.
4. Don source tren `dev` ve skeleton toi thieu:
   - giu infra + auth
   - go module nghiep vu cu
   - go CRUD Admin cu
5. Tam dung cac plan/report V1, khong dung chung lam backlog moi.
6. Cho tai lieu API/flow Admin tu FE truoc khi chot contract cuoi cung.

## Input FE Da Nhan

Tai lieu FE hien tai chot:

1. Admin list pages dung chien luoc **full fetch**.
2. FE tu filter / sort / search / pagination.
3. Dataset hien tai du kien nho:
   - brands ~10
   - stores ~300
   - users ~250
4. Admin module gom 15 endpoint.
5. Full-fetch duoc giu cho toi khi payload/latency/toc do tang truong khong con hop ly; khong dung moc record cung.

Bao cao phan tich chi tiet:

- `plans/260515-admin-rebuild/reports/fe-requirements-analysis.md`

Huong toi uu query Admin da chot:

1. List full-fetch khong chay `count`.
2. Chi `select` field FE can.
3. Dung relation select nho, khong `include: true`.
4. Giu `users?role=` lam lookup nhe cho dropdown.
5. Chua them cache/index nang neu chua co benchmark chung minh can.

Truoc khi implement can chot them:

1. response error format cuoi cung
2. token shape multi-role
3. `RoleAssignment` co can ho tro cung role tren nhieu store khong

### Phase 1 - Auth Va Khung Contract

1. Chot response envelope.
2. Chot role `company_admin`.
3. Kiem tra login / me / logout.
4. Them test auth session toi thieu.

### Phase 2 - Brand Foundation

1. Tao/list/update brand.
2. Chot unique rule `code/name`.
3. Neu FE can picker, tach lookup endpoint tu dau.
4. Them route test brand.

### Phase 3 - Store Foundation

1. Tao/list/detail/update store.
2. Brand relation tra display fields.
3. Manager/AM relation tra display fields.
4. Gan AM.
5. Them test brand isolation, manager role, detail/list contract.

### Phase 4 - User Va Role Foundation

1. Tao/list/update user.
2. Safe DTO khong bao gio tra password.
3. Role assignment tra store display fields.
4. Toggle active.
5. Them test:
   - duplicate email
   - role assignment
   - store scope display
   - SM email lock neu con giu rule nay

### Phase 5 - Admin Flow Review

1. Chay tat ca route test cua Admin.
2. Viet mot FE handoff ngan chi cho admin.
3. Review lai:
   - UI co con phai hien ID tran khong
   - co endpoint nao list/detail lon lan khong
   - co thao tac nao admin khong lam duoc khong
4. Neu pass, moi mo plan cho `qa_manager`.

## Test Matrix

| Nhom | Test bat buoc |
|---|---|
| Auth | login dung/sai, me hop le, logout |
| RBAC | non-admin khong mutate duoc brand/store/user |
| Brand | duplicate code/name, pagination/list contract |
| Store | duplicate code, brand isolation, manager role, AM assignment |
| User | duplicate email, password khong lo, role assignment, toggle active |
| Contract | relation tra display fields, khong co raw foreign key-only UI gap |

## Definition Of Done Cho Admin

Admin chi duoc coi la xong khi:

1. Tat ca API trong pham vi admin co test.
2. FE co the ve day du man admin ma khong can doan field.
3. Khong endpoint admin nao tra password.
4. Khong man nao buoc phai hien raw id thay cho label.
5. Co tai lieu admin contract duy nhat, khong chong cheo.
6. `npm test`, typecheck, build deu pass.
7. Ban than ban co the giai thich luong admin tu login den tao store/user trong 5 phut ma khong can mo 10 file.

## Rui Ro Va Cach Chan

| Rui ro | Cach chan |
|---|---|
| Rebuild lai roi lai phinh ra | Moi phase co DoD rieng, khong nhay role |
| Lai viet docs qua nhieu | Dot Admin chi giu 2 doc chinh + test |
| Lay lai code V1 qua tay | Chi copy rule/test idea, khong copy flow mot cach vo thuc |
| FE can picker nhung BE dua table API | Chot lookup contract som |
| Lai roi vao perf qua som | Chi do muc can thiet, chua toi uu sau truoc khi flow dung |

## Quan He Voi Cac Plan Cu

- `plans/260515-api-system-review/plan.md`: tai lieu tham chieu V1 da duoc merge vao baseline `main`, tam dung.
- `plans/260515-api-performance-remediation/plan.md`: tai lieu tham chieu V1, chi quay lai sau khi role flow rebuild dat den giai doan can toi uu.
- `plans/260515-api-list-performance/plan.md`: khong tiep tuc dung lam truc trien khai.

Khong plan cu nao block dot Admin moi.

## Lenh Trien Khai Goi Y

```txt
[$ck:cook](C:\Users\ACER\.codex\skills\cook\SKILL.md) Trien khai Plan Admin Rebuild trong plans/260515-admin-rebuild/plan.md
```

## Sau Admin Se Lam Gi

Neu Admin dat DoD, thu tu tiep theo la:

1. `qa_manager`
2. `qc_auditor`
3. `store_manager`
4. `am`
5. `executive_viewer`
6. performance / polish / portfolio hardening
