# Bao Cao Baseline API Backend

## Tong Quan

Ngay lap bao cao: 2026-05-15

Muc dich cua dot ra soat nay la tach ro 4 van de thuong bi tron vao nhau:

1. endpoint tra qua nhieu du lieu
2. query Prisma/DB cham
3. contract FE khong ro list/detail
4. mutation tra response qua rong hoac qua ngheo

Du lieu thuc te ban dau:

| Endpoint | count | rows | db | total | Nhan dinh |
|---|---:|---:|---:|---:|---|
| `GET /api/stores?page=2&limit=20` | `1.27s` | `2.36s` | `2.36s` | `2.36s` | Nut that chinh nam o query rows. |

## Ma Tran Endpoint

| Nhom | Endpoint | Kieu | Hien trang |
|---|---|---|---|
| Auth | `POST /api/auth/login` | mutation | dang dung cho login |
| Auth | `POST /api/auth/logout` | mutation | don cookie |
| Auth | `GET /api/auth/me` | session detail | da giam select roleAssignment ve `roleKey` |
| Brand | `GET/POST /api/brands` | list/create | list co pagination, con `_count.stores` |
| Brand | `PATCH /api/brands/:id` | update | chua co detail GET rieng |
| Store | `GET/POST /api/stores` | list/create | list da tach ve summary DTO |
| Store | `GET/PATCH /api/stores/:id` | detail/update | da co detail DTO rieng |
| Store | `PATCH /api/stores/:id/assign-am` | workflow mutation | response da gioi han select |
| User | `GET/POST /api/users` | list/create | mutation khong tra password |
| User | `PATCH /api/users/:id` | update | mutation tra safe DTO |
| User | `PATCH /api/users/:id/toggle-active` | mutation | can review tiep |
| Criteria | `GET/POST /api/criteria` | list/create | co pagination |
| Criteria | `PATCH/DELETE /api/criteria/:id` | mutation | can tach detail sau neu FE can |
| Criteria group | `GET/POST /api/criteria-groups` | list/create | list nho, chua pagination |
| Criteria group | `PATCH/DELETE /api/criteria-groups/:id` | mutation | co delete guard |
| Checklist | `GET/POST /api/checklists` | list/create | list summary da co |
| Checklist | `GET/PATCH /api/checklists/:id` | detail/update | detail nested dung cho builder |
| Checklist | publish/archive/sections/items | workflow mutation | can do timing sau |
| Audit plan | `GET/POST /api/audit-plans` | list/create | list summary da co |
| Audit plan | `GET /api/audit-plans/:id` | detail | include assignments, dung cho man chi tiet |
| Audit plan | `GET /api/audit-plans/my-assignments` | list | con payload rat sau, FE dang phu thuoc |
| Audit | `GET /api/audits` | list | co pagination + timing |
| Audit | `GET /api/audits/:id` | detail | nested violations/evidence |
| Audit | calculate/draft/submit/checklist | workflow | submit da transaction |
| Action plan | `GET /api/action-plans` | list | co pagination + timing |
| Action plan | detail/update/submit/confirm/close | workflow | contract on dinh |
| Analytics | `GET /api/analytics/overview` | aggregate | da doi tu fetch-all sang aggregate query |
| Notification | `GET/PATCH /api/notifications` | list/mutation | dang take 50 |
| Upload | `POST /api/upload/evidence` | file mutation | can audit rieng file size/type |

## Phat Hien Chinh

### Da Sua Trong Dot Nay

- `stores list` da cat field detail khoi list:
  - bo `region`, `province`, `district`, `ward`, `address`
  - bo email cua `am` va `manager`
- Them `GET /api/stores/:id` lam detail endpoint cho drill-down row.
- `auth/me` khong con include toan bo roleAssignment model.
- create/update user khong con tao raw object roi strip password thu cong.
- `analytics/overview` da chuyen tu fetch-all + JS aggregate sang DB aggregate/count/groupBy.

### Can Lam Tiep

- `my-assignments` dang tra nguyen cay checklist, nhung FE co ve dang dung truc tiep; can tach contract rieng truoc khi cat.
- `audit detail` va `checklist detail` la route detail dung nghia, payload rong la chap nhan duoc nhung can do timing.
- `notifications`, `upload`, `toggle-active` chua duoc do chi tiet.
- Chua them index moi vi chua co `EXPLAIN ANALYZE`.

## Ket Luan Baseline

He thong da co pagination va RBAC tot hon truoc, nhung can tiep tuc di theo pattern:

- list nhe
- detail day du
- mutation vua du
- analytics dung aggregate DB
- index chi them sau query plan
