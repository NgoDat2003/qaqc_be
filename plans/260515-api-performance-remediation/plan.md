# Plan 11 - Sua Hieu Nang API Sau Benchmark

## Muc Tieu

Giam latency API theo ket qua benchmark ngay 2026-05-15, uu tien xu ly goc he thong truoc khi toi uu tung route le.

## Bang Chung

- Latency nen DB: khoang `1.1s` moi query.
- `stores rows`: `2.40s`
- `audits rows`: `2.42s`
- `action plans rows`: `1.96s`
- `audit detail`: `4.89s`
- `analytics overview`: `3.24s`

Nguon:

- `docs/reports/api-performance-benchmark-2026-05-15.md`

## Phase 1 - Xu Ly Ha Tang DB Truoc

1. Xac nhan BE va DB co cung region khong.
2. Neu BE local, DB Supabase o `ap-southeast-2`, ghi ro latency network that.
3. Kiem tra cach ket noi:
   - `DATABASE_URL` dang dung transaction pooler
   - co cold start/sleep khong
   - co the dung session/direct connection cho local benchmark hay khong
4. Benchmark rieng:
   - `SELECT 1`
   - `brand.count()`
   - 5 lan warm lien tiep
5. Muc tieu: giai thich duoc vi sao query nhe nao cung ~1.1s.

## Phase 2 - Hoan Thien Instrumentation

Them `Server-Timing` cho:

- auth:
  - login
  - me
- detail:
  - store detail
  - checklist detail
  - audit plan detail
  - audit detail
  - action plan detail
- route phu:
  - notifications
  - criteria groups
  - my assignments

Tach timing theo:

- `lookup`
- `relations`
- `scope`
- `db`
- `total`

Sua `analytics/overview` de `db` bao gom ca query lay ten store.

Trang thai: da hoan thanh trong dot hien tai.

## Phase 3 - Toi Uu Read Path P1

### `GET /api/stores`

- da tach summary/detail
- tiep tuc do lai sau khi DB baseline ro
- neu relation join van dat, can xem `EXPLAIN ANALYZE`

### `GET /api/audits`

- danh gia join `assignment.plan`
- da bo `assignment.plan` khoi list response

### `GET /api/action-plans`

- danh gia join audit + closedBy
- da cat list ve summary DTO, bo `remediation`, `closedAt`, `closedBy`

### Detail routes

- `audit detail` uu tien cao nhat
- tach audit core/detail sections neu can
- chi load evidence/criteria khi UI that su hien

## Phase 4 - Query Plan Va Index

Sau khi query shape da ro:

- chay `EXPLAIN ANALYZE`
- xet index:
  - `Audit(storeId, submittedAt)`
  - `Audit(auditorId, submittedAt)`
  - `ActionPlan(storeId, status, createdAt)`
  - `Store(brandId, isActive, code)`
  - `AuditAssignment(auditorId, status, scheduledDate)`
- chi tao migration khi query plan chung minh can.

## Phase 5 - Mutation Benchmark Rieng

Khong benchmark mutation success-path tren DB chung.

Can mot trong hai:

1. test DB rieng de benchmark create/update/delete/submit
2. fixture cleanup tu dong day du cho tung mutation

Sau do moi do:

- create/update store
- create/update user
- publish checklist
- submit audit
- submit/reject/close AP
- upload evidence

## Thu Tu Uu Tien

1. DB baseline + region/pooling
2. detail timing
3. `audit detail`
4. `stores/audits/action-plans` list
5. analytics timing fix
6. query plan + index
7. mutation benchmark

## Acceptance Criteria

- Biet chinh xac latency nen DB den tu dau.
- Moi read endpoint uu tien co `Server-Timing`.
- Co benchmark truoc/sau cho P1 routes.
- `audit detail` giam ro hoac co ly do ha tang ro rang.
- Khong them index theo cam tinh.
- Co test DB hoac fixture cleanup truoc khi benchmark mutation thanh cong.
