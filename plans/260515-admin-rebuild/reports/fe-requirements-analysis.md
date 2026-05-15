# Bao Cao Phan Tich Yeu Cau FE - Admin Setup

## Tong Ket

Tai lieu FE da du de BE bat dau implement lai module `company_admin`.

Huong kien truc duoc chot trong spec:

- BE tra full dataset cho list Admin.
- FE tu search / filter / sort / pagination.
- Dataset du kien:
  - brands khoang 10
  - stores khoang 300
  - users khoang 250
- Gioi han chap nhan hien tai: khoang 1000 record, vuot nguong nay moi revisit server-side pagination.

## Quyet Dinh Nen Chot Truoc Khi Code

| Hang muc | Quyet dinh de xuat |
|---|---|
| List strategy | `brands`, `stores`, `users` tra full dataset cho trang Admin |
| Picker strategy | `users?role=` giu lai de FE load dropdown nhe hon |
| Detail strategy | `stores/[id]` van giu neu FE mo drawer/detail rieng |
| Pagination | Khong tra `meta` cho full-list endpoints |
| Search/sort/filter | FE xu ly client-side cho trang Admin |
| Dataset threshold | Revisit khi payload, latency, hoac toc do tang truong khong con hop ly; khong dung mot moc record cung |
| Database | Giu nguyen, khong clear/reset |

## Bang Tong Hop Endpoint

| Nhom | Endpoint | FE dung de lam gi | Kieu response | Full fetch? | Ghi chu |
|---|---|---|---|---|---|
| Auth | `POST /api/auth/login` | Dang nhap | session object | Khong ap dung | Can thong nhat loi inactive la `403` |
| Auth | `GET /api/auth/me` | Khoi phuc session | session object | Khong ap dung | Dung fresh roles tu DB la hop ly |
| Auth | `POST /api/auth/logout` | Dang xuat | `null` | Khong ap dung | Khong can auth |
| Brand | `GET /api/brands` | Table + metric card | array | Co | Rat phu hop full fetch |
| Brand | `POST /api/brands` | Tao brand | entity | Khong ap dung | Normalize `code.toUpperCase()` |
| Brand | `PATCH /api/brands/[id]` | Sua brand | entity | Khong ap dung | `code` immutable |
| Store | `GET /api/stores` | Bang cua hang | array | Co | Payload day hon brands nhung 300 record van hop ly |
| Store | `GET /api/stores/[id]` | Drawer/detail | entity detail | Khong ap dung | Co the trung shape voi list neu FE dung cung field |
| Store | `POST /api/stores` | Tao cua hang | detail entity | Khong ap dung | Co rule brand isolation + role validation |
| Store | `PATCH /api/stores/[id]` | Sua cua hang | detail entity | Khong ap dung | Can validate lai khi doi `modelType` hoac `brandId` |
| Store | `PATCH /api/stores/[id]/assign-am` | Gan AM nhanh | detail entity | Khong ap dung | Co the giu neu FE co thao tac rieng |
| User | `GET /api/users` | Bang nhan su | array | Co | Full fetch hop ly voi 250 record |
| User | `GET /api/users?role=...` | Dropdown limited-scope | array | Tuy bien | Day la lookup filter, khong phai table pagination |
| User | `POST /api/users` | Tao user | entity + roles | Khong ap dung | Hash password, validate role |
| User | `PATCH /api/users/[id]` | Sua ho ten/phone | entity + roles | Khong ap dung | Email immutable |
| User | `PATCH /api/users/[id]/toggle-active` | Bat/tat user | entity + roles | Khong ap dung | FE update row ngay |

## Bang Du Lieu Va DTO Can Tra

| Resource | Field toi thieu BE nen tra | Ly do FE can |
|---|---|---|
| Brand | `id`, `code`, `name`, `isActive`, `createdAt`, `updatedAt`, `_count.stores` | table + metric card |
| Store list | `id`, `code`, `name`, `modelType`, `province`, `ward`, `address`, `isActive`, `createdAt`, `updatedAt`, `brandId`, `amId`, `managerId` | full-fetch nhanh; FE map brand/user tu cache da load |
| Store detail / mutation | store list fields + `brand`, `am`, `manager` | drawer/detail va cap nhat row sau mutation |
| User | `id`, `email`, `fullName`, `phone`, `isActive`, `createdAt`, `updatedAt`, `roleAssignments` | table + permission display; FE map `storeId` bang cache stores |

## Danh Gia Full Fetch

| Resource | Quy mo hien tai | Danh gia | Ly do |
|---|---:|---|---|
| Brands | ~10 | Rat an toan | Payload rat nho |
| Stores | ~300 | An toan | Van nhe neu select dung field, FE loc nhanh |
| Users | ~250 | An toan | Phu hop table admin, co them `role` filter cho picker |

## Ke Hoach Toi Uu Query Cho Admin

### Nguyen Tac Chung

| Nguyen tac | Ap dung |
|---|---|
| Chi select field FE can | Khong dung `include: true`, khong tra raw Prisma model |
| Mot list endpoint = mot query chinh | Khong chen them `count` khi list tra full |
| Sap xep theo cot co index/unique neu co the | `brands.name`, `stores.code`, `users.fullName` |
| Dung relation select nho | Store chi lay brand/am/manager display fields |
| Filter lookup rieng neu FE can | `users?role=` cho dropdown, khong lam nang full-list |
| Do truoc khi toi uu sau | Ghi benchmark `rows`, `payload`, `total` cho 3 endpoint Admin |

### De Xuat Theo Endpoint

| Endpoint | Query shape de xuat | Ly do |
|---|---|---|
| `GET /api/brands` | `findMany({ select: { id, code, name, isActive, createdAt, updatedAt, _count: { select: { stores: true } } }, orderBy: { name: "asc" } })` | 1 query nho, `_count` du cho metric |
| `GET /api/stores` | `findMany({ select: { id, code, name, modelType, province, ward, address, isActive, createdAt, updatedAt, brandId, amId, managerId }, orderBy: { code: "asc" } })` | Full-fetch nhanh hon; FE da co brands/users nen khong can join tren list |
| `GET /api/users` | `findMany({ select: { id, email, fullName, phone, isActive, createdAt, updatedAt, roleAssignments: { select: { id, roleKey, storeId } } }, orderBy: { fullName: "asc" } })` | Khong tra password, tranh query hydrate store vi FE da co full stores |
| `GET /api/users?role=...` | `findMany({ where: { roleAssignments: { some: { roleKey } } }, select: lookup fields, orderBy: { fullName: "asc" } })` | Picker nhe hon full-list neu chi can AM/SM |

### Index Nen Co Cho Admin

| Bang | Index hien co | Danh gia | De xuat |
|---|---|---|---|
| `brands` | `code` unique, `name` unique | Du cho dot Admin | Chua can them |
| `stores` | `code` unique, `brandId`, `amId`, `managerId`, `isActive` | Tot cho filter theo quan he | Can can nhac them index cho `name` neu sau nay co server search; hien tai FE search nen chua can |
| `users` | `email` unique, `isActive` | Du cho auth va active filter | Can can nhac index `fullName` neu sau nay list rat lon hoac server sort/search; hien tai chua bat buoc |
| `role_assignments` | `userId`, `roleKey`, unique `userId+roleKey` | Du cho `users?role=` o quy mo hien tai | Neu hay query role + user, co the them composite `@@index([roleKey, userId])` sau khi benchmark |

### Dieu Chua Can Lam Ngay

| Chua can | Vi sao |
|---|---|
| Pagination server-side cho Admin | Chien luoc hien tai la full-fetch |
| Cache Redis | Dataset nho, query don gian, chua co bang chung can them |
| Materialized view | Qua som cho module Admin |
| Full-text search DB | FE dang search client-side |
| Them index hang loat | Index cung co chi phi write; chi them khi co query that su can |

### Can Do Khi Implement

| Metric | Muc dich |
|---|---|
| So row tra ve | Biet quy mo that |
| Payload KB | Biet FE tai bao nhieu |
| Thoi gian query DB | Tach DB voi route handler |
| Tong response time | Biet UX that |
| Cold vs warm run | Tranh nham connection/cold start voi query cham |

## Diem Lech Can Sua Trong Spec Truoc Khi Implement

| Van de | Vi sao dang lech | De xuat chot |
|---|---|---|
| List strategy vs verification examples | Phan kien truc noi list tra full khong meta, nhung phan verification cuoi file van test pagination/search va `meta` | Cap nhat verification theo huong full-fetch moi |
| Response helper | Spec moi de `error: string`, skeleton BE hien tai dang dung `error: { statusCode, message, code }` | Chot mot format duy nhat truoc khi code; nen giu format co cau truc |
| Auth token shape | Spec yeu cau `roleKey`, skeleton hien tai da dung `roleKeys` + `defaultRole` | Nen giu multi-role token de phu hop he thong da co |
| User list voi `role` filter | Spec noi no meta, nhung mo ta lai nhac `limit=200` | Neu la lookup, tra array don gian, khong can pagination/meta |
| `RoleAssignment @@unique([userId, roleKey])` | Khong cho cung user co cung role tren nhieu store | Neu AM/SM co the phu trach nhieu store, model nay khong du; can chot nghiep vu truoc khi build man user |
| Store schema trong spec | Spec chi co `province`, `ward`; schema BE hien tai co them `region`, `district` | Neu FE khong dung nua thi bo qua trong DTO, khong can sua schema ngay |
| `assign-am` endpoint | PATCH store da co `amId`; endpoint rieng co the trung lap | Giu neu FE co thao tac gan nhanh rieng, bo neu khong can |

## Thu Tu Trien Khai De Xuat

| Thu tu | Hang muc | Muc tieu |
|---|---|---|
| 1 | Chot contract chung | Response shape, token shape, full-fetch convention |
| 2 | Auth | Dam bao session on dinh truoc |
| 3 | Brands | Module nho nhat de chot pattern CRUD + full-fetch |
| 4 | Stores | Module trung tam, nhieu rule nhat |
| 5 | Users | Cuoi cung vi phu thuoc vao role/scope rule |
| 6 | FE handoff + tests | Chot bang contract va cac case FE can |

## Ke Hoach Test

| Nhom | Test can co |
|---|---|
| Auth | login dung/sai, inactive account, `me`, logout |
| Brand | full list, unique code/name, code immutable |
| Store | full list, brand isolation, AM role, manager role, duplicate code |
| User | full list, duplicate email, invalid role, empty roles, password hash, toggle active |
| Contract | list khong co `meta`, mutation tra entity day du, khong lo password |
| Performance | benchmark full-fetch `brands/stores/users` voi du lieu hien tai |

## Ket Luan

Spec FE nay phu hop voi huong rebuild hien tai va du de bat dau implement module Admin.

Truoc khi code, nen sua 3 diem uu tien:

1. Cap nhat lai phan verification cuoi file de khong con pagination/search cu.
2. Chot response error format duy nhat.
3. Chot nghiep vu `RoleAssignment` co can mot user cung role tren nhieu store hay khong.
