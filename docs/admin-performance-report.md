# Admin API Performance Report

## Muc Tieu

Danh gia do tre khi FE goi full-fetch Admin APIs sau khi BE duoc viet lai theo huong:

- khong pagination server-side
- khong `count` cho list
- `select` hep
- tranh hydrate relation lap lai khi FE da co dataset can de map

## Ket Qua Da Xac Nhan Duoc

Do tren local HTTP toi BE, dung DB hien tai va du lieu dang co:

| Endpoint | Rows | Payload | DB time xap xi | Total HTTP xap xi |
|---|---:|---:|---:|---:|
| `GET /api/brands` | 4 | 0.8 KB | 1.04 - 1.11 s | 1.08 - 1.85 s |
| `GET /api/stores` ban dau co nested relation | 150 | 89 KB | 2.34 - 2.69 s | 2.58 - 4.07 s |
| `GET /api/users` ban dau co hydrate store phu | 206 | 84 KB | 2.67 - 2.89 s total route | 2.85 - 3.41 s |
| `GET /api/users` sau khi bo hydrate store | 206 | 68 KB | 1.48 - 1.49 s | 1.59 - 1.89 s |
| `GET /api/users?role=store_manager` sau khi bo hydrate store | 150 | 51 KB | 1.47 - 1.70 s | 1.58 - 1.85 s |

## Phat Hien

1. Bo hydrate store khoi `users` giup giam khoang 1.1s moi request.
2. Do tre hien tai chu yeu nam o tang DB / ket noi toi DB, khong nam o payload download.
3. `stores` list co nested relation la endpoint nang nhat; vi FE full-fetch `brands` va `users`, list store nen tra ID tham chieu va de FE map tu cache.
4. `Server-Timing` da duoc them cho cac list endpoint de FE co the doc `db` va `total` trong DevTools.
5. Cau hinh hien tai dang di qua Supabase pooler `aws-1-ap-southeast-2.pooler.supabase.com`; day la dau hieu manh cho thay cold-path latency bi anh huong boi duong mang toi DB tu xa.

## Thay Doi Toi Uu Da Lam

| Thay doi | Tac dong |
|---|---|
| Bo `count` khoi full-fetch lists | Giam query thua |
| Bo hydrate store phu khoi `users` | Giam users list tu ~2.7s ve ~1.5s DB time |
| Tach `store list` va `store detail` shape | List nhe hon, detail van day du |
| Them `Server-Timing` | De debug DB vs route nhanh |
| Them cache memory 5 phut cho `brands`, `stores`, `users` | Warm read khong can round-trip toi DB |
| Invalidate cache sau mutation | Giu full-fetch data dung sau create/update |

## Gioi Han Cua Dot Do

- Luuot benchmark sau khi toi uu `stores` list chua do lai duoc trong moi truong moi vi process moi gap loi TLS toi Supabase:
  - `Error opening a TLS connection: No credentials are available in the security package`
- Vi vay, ket qua cuoi cung cua `stores` shape moi can duoc do lai tu may anh / FE sau khi server chay binh thuong.

## Ket Luan

BE da duoc dua ve dung huong de full-fetch Admin:

- query it hon
- payload nhe hon
- FE co the tai 1 lan va tu xu ly bang
- warm read co the tra tu memory cache thay vi lap lai query DB

Nhung latency nen cua DB hien tai van rat cao:

- query don gian `brands` van hon 1s
- users query don gian van gan 1.5s

Dieu nay cho thay:

- Muon request lap lai duoi `500ms`, cache la bat buoc voi master data Admin.
- Muon **cold request dau tien** cung duoi `500ms`, chi toi uu query la khong du; can xem lai duong ket noi toi DB / region / pool / runtime gan DB hon.

## Do Lai Sau Khi Them Cache

Do qua HTTP local toi BE hien tai:

| Endpoint | Lan goi | Total HTTP | Server-Timing |
|---|---|---:|---|
| `GET /api/users?role=am` | cold | ~977 ms | `db ~923 ms` |
| `GET /api/users?role=am` | warm | ~133 ms | `cache ~0.20 ms`, `route ~0.87 ms` |
| `GET /api/brands` | warm | ~28 ms | `cache ~0.07 ms`, `route ~0.36 ms` |
| `GET /api/stores` | warm | ~30 ms | `cache ~0.04 ms`, `route ~2.17 ms` |

## Do Lai Sau Khi Doi Sang Supabase Singapore

Project moi:

- Region: `ap-southeast-1` Singapore
- Runtime local dung session pooler `5432`
- DB da duoc seed lai bang faker data hien co

So luong data sau seed:

| Model | Count |
|---|---:|
| Brand | 4 |
| Store | 150 |
| User | 206 |
| RoleAssignment | 206 |
| AuditAssignment | 150 |
| Audit | 126 |
| Violation | 376 |
| ActionPlan | 44 |

Do query truc tiep qua Prisma:

| Query | Time |
|---|---:|
| `brand.findMany` | ~130 ms |
| `store.findMany` | ~193 ms |
| `user.findMany` | ~257 ms |

Do qua HTTP sau khi restart dev server:

| Endpoint | HTTP total | Server-Timing |
|---|---:|---|
| `GET /api/brands` | ~1805 ms lan dau do Next dev compile | `db ~124 ms`, `route ~125 ms` |
| `GET /api/stores` | ~381 ms | `db ~186 ms`, `route ~188 ms` |
| `GET /api/users` | ~454 ms | `db ~260 ms`, `route ~262 ms` |
| `GET /api/stores` warm/repeat | ~191 ms | `db ~66 ms`, `route ~67 ms` |
| `GET /api/users` cache hit | ~114 ms | `cache ~0.03 ms`, `route ~2.55 ms` |

Ket luan moi: region Singapore da dua cold DB query Admin ve muc duoi `500ms`. Neu DevTools con thay request dau tien >500ms trong `next dev`, can nhin `Server-Timing`: phan vuot thuong la Next dev compile/hot reload, khong phai DB query.

## Do Lai Sau Khi Tra Them Display Fields Cho FE

Sau khi `GET /api/stores` tra them `brand`, `am`, `manager` va `GET /api/users` hydrate `roleAssignments[].store`:

| Endpoint | Shape | Cold/DB | Warm/cache |
|---|---|---:|---:|
| `GET /api/stores` | 150 stores, kem brand/am/manager | route ~334 ms, HTTP ~611 ms | route ~2 ms, HTTP ~167 ms |
| `GET /api/users` | 206 users, role assignment co store display neu co | cache hit route ~1 ms, HTTP ~112 ms | ~115 ms |
| `GET /api/users?role=store_manager` | 150 store managers, co store display | route ~275 ms, HTTP ~465 ms | route ~2 ms, HTTP ~234 ms |

Luu y: HTTP total cua `stores` cold co the vuot `500ms` trong dev vi payload tang len khoang 100 KB va Next dev overhead. `Server-Timing` cua route/DB van nam duoi `500ms`; warm cache da ve duoi `200ms`.

Buoc tiep theo neu muon ve muc UAT ~100-300ms:

1. kiem tra lai DB region / connection pool / network path
2. benchmark lai warm/cold tren server moi truong on dinh
3. neu cold path van cham, can xu ly tang ha tang thay vi tiep tuc vat query
