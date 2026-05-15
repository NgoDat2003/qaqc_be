# Bao Cao Benchmark API - 2026-05-15

## Cach Do

- Goi HTTP that vao `http://localhost:3000/api`
- Moi endpoint GET chay `3` lan lien tiep
- Dang nhap bang tai khoan seed admin va QC
- Ghi:
  - wall time tu client
  - `Server-Timing` neu endpoint co header
- Script de chay lai:

```txt
node scripts/benchmark-api.mjs
```

## Ket Qua Chinh

| Endpoint | Avg client | Server timing gan nhat | Danh gia |
|---|---:|---|---|
| `POST /auth/login` | `2809ms` | chua co timing | Cham |
| `GET /auth/me` | `1794ms` | chua co timing | Cham |
| `GET /brands` | `1193ms` | `count 1113ms`, `rows 1105ms` | Cham nen DB |
| `GET /stores` | `2536ms` | `count 1338ms`, `rows 2441ms` | P1 |
| `GET /users` | `1617ms` | `count 1115ms`, `rows 1590ms` | P2 |
| `GET /criteria-groups` | `1194ms` | chua co timing | Cham nen DB |
| `GET /criteria` | `1690ms` | `count 1319ms`, `rows 1543ms` | P2 |
| `GET /checklists` | `1136ms` | `count 1130ms`, `rows 1127ms` | Cham nen DB |
| `GET /audit-plans` | `1575ms` | `count 1105ms`, `rows 1559ms` | P2 |
| `GET /audits` | `2632ms` | `count 1090ms`, `rows 2654ms` | P1 |
| `GET /action-plans` | `2031ms` | `count 1096ms`, `rows 1972ms` | P1 |
| `GET /notifications` | `1171ms` | chua co timing | Cham nen DB |
| `GET /stores/:id` | `2532ms` | chua co timing | P1 detail |
| `GET /checklists/:id` | `1729ms` | chua co timing | P2 detail |
| `GET /audit-plans/:id` | `1948ms` | chua co timing | P2 detail |
| `GET /audits/:id` | `2727ms` | chua co timing | P1 detail nang nhat |
| `GET /action-plans/:id` | `1682ms` | chua co timing | P2 detail |
| `GET /audit-plans/my-assignments` | `665ms` | chua co timing | payload can review |
| `GET /analytics/overview` | `2449ms` | `db 1116ms`, `total 2278ms` | P1 |

## Ket Luan

### 1. Co latency nen cua DB khoang 1.1s moi query

Nhieu endpoint rat nhe van co:

- `count` khoang `1087-1096ms`
- `rows` rat nhe cung khoang `1093-1104ms`

Dieu nay cho thay van de khong chi nam o DTO. Co mot latency nen ro rang o tang DB/network/connection.

### 2. Route co nested relation cong them rat nhieu chi phi

Nhung route sau vuot xa muc nen:

- `stores list`: `rows 2402ms`
- `audits list`: `rows 2419ms`
- `action plans list`: `rows 1955ms`
- `audit detail`: `2727ms`
- `store detail`: `2532ms`
- `audit plan detail`: `1948ms`

### 3. Detail endpoints hien chua co `Server-Timing`

Ta biet chung cham, nhung chua tach duoc:

- lookup
- relation join
- scope check
- serialization

Can them timing vao detail routes truoc khi toi uu tiep.

### 4. `analytics/overview` timing chua do du tat ca query

`total` cao hon `db` khoang `1.1s`, nghia la instrumentation hien tai chua gom het query cuoi lay ten store. Can sua timing truoc khi so sanh lan sau.

## Cap Nhat Sau Lan Ra Soat Tiep Theo

- Da them `Server-Timing` cho:
  - `auth/login`
  - `auth/me`
  - cac detail route uu tien
  - `notifications`
  - `criteria-groups`
  - `my-assignments`
- Da sua `analytics/overview` de `db` bao gom ca query lay ten store.
- Da cat them payload table:
  - `GET /api/audits`: bo `assignment.plan`
  - `GET /api/action-plans`: bo `remediation`, `closedAt`, `closedBy`
- Da chan `Server-Timing` o production theo mac dinh; chi bat lai khi `ENABLE_SERVER_TIMING=true`.
- Da hydrate `roleAssignments[].store` trong users response de UI hien `code/name` thay vi raw `storeId`.
- Da fix `GET /api/checklists?status=published`: truoc do route bo qua `status`, nen van query toan bo checklist.

### Ghi Chu Ve `analytics/overview`

Route nay hien van can them mot query lay ten store sau khi da tinh top/bottom bang `groupBy`.

- Day la chi phi that, nhung khong phai bug correctness.
- Cach bo round-trip sach se nhat can mot query reporting chuyen biet hoac raw SQL theo dialect.
- Vi project dang chay ca SQLite dev va PostgreSQL prod, viec doi route nay can duoc lam thanh mot task rieng de tranh mot ban va tam bo.

### Dau Hieu Tu Log FE Moi

Log moi cho thay 3 mau:

1. Endpoint rat nhe van cham:
   - `auth/me`: `1.6s` den `3.2s`
   - `brands`: `1.1s` den `2.8s`
   - `checklists`: `1.1s` den `2.7s`
2. Endpoint co relation nang cham hon nen:
   - `audit-plans`: `1.8s` den `2.9s`
   - `stores`: `2.6s` den `4.3s`
3. Gan nhu moi request deu xuat hien thanh cap lien tiep:
   - day la dau hieu FE/dev dang goi trung, khong phai BE tu dong retry.

Them nua, `limit=200` hien bi cap ve `100` boi `MAX_LIMIT`, nen nhom request nay vua khong lay dung 200 nhu FE nghi, vua dang dung list endpoint nang cho nhu cau gan voi picker/dropdown. Nen tach lookup endpoints nhe rieng cho:

- brands
- stores
- users
- published checklists

Lan benchmark moi sau instrumentation bi chan boi moi truong dev dang bi loi cache `.next` (`vendor-chunks/next.js` bi thieu khi server dev dang song song voi build), nen chua dung duoc de so sanh truoc/sau. Can restart server sach roi chay lai script benchmark.

## Endpoint Chua Benchmark Bang Duong Thanh Cong

Khong benchmark success-path cho mutation endpoints vi se tao/sua du lieu that tren DB dang dung chung:

- create/update/delete brand/store/user/criteria/checklist
- submit/close workflow
- upload evidence

Can tao **performance fixture rieng** hoac **test database rieng** truoc khi do success-path mutation.

## Nhan Dinh Cuoi

Neu chi toi uu query application ma khong xu ly latency nen DB, he thong van se co cam giac cham. Thu tu fix dung:

1. kiem tra connection/region/pooling DB
2. them timing cho detail routes
3. cat relation va payload theo list/detail
4. chay `EXPLAIN ANALYZE`
5. moi them index
