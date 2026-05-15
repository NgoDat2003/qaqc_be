# Test Report - QAM Foundation

Ngay test: 2026-05-15

## Ket Qua Tong Quan

| Hang muc | Ket qua | Ghi chu |
|---|---:|---|
| Unit/route tests | Pass | `25/25 tests passed` |
| Build/typecheck | Pass | `npm.cmd run build` thanh cong |
| Prisma schema validate | Pass | `prisma/schema.prisma` hop le |
| ESLint script | Chua ket luan | `npm run lint` hien prompt cau hinh ESLint vi repo chua co config rieng |

## Cac Case QAM Da Cover

| Nhom | Case da test |
|---|---|
| Criteria Group | List group khong expose `weight` |
| Criteria | Tao criteria bi chan neu `groupId` khong ton tai hoac inactive |
| Checklist Publish | Chan publish khi tong `section.weight` khac `100` |
| Audit Plan Contract | Chan request cu `stores[] + auditorId` |
| Audit Plan Assignment | Tao dung tung cap `storeId + auditorId` trong `assignments[]` |
| QC Scope | `/api/audit-plans/my-assignments` chi query assignment cua QC hien tai |

## Cac Case Admin Regression Van Pass

- Response envelope success/error.
- RBAC header parsing.
- Admin cache.
- Brands list/create duplicate guard.
- Stores list/create/assign AM guard.
- Users list/create/update/toggle active guard.
- Auth login chan account inactive.

## Khoang Trong Can Bo Sung Neu Muon Chat Hon

| Uu tien | Khoang trong | Ly do |
|---|---|---|
| Cao | Checklist publish success path | Hien da test fail path weight, chua test duong publish hop le cap nhat `publishedAt`. |
| Cao | Section/item mutation | Can test chi draft moi sua duoc, criteria phai cung group voi section. |
| Cao | Audit plan invalid store/auditor | Can test store inactive/missing va auditor khong phai `qc_auditor`. |
| Trung binh | Checklist archive | Can test chi `published` moi archive duoc. |
| Trung binh | Criteria update partial max/deduction | Can test cap nhat 1 field khong lam sai rule `maxDeduction >= deductionPerError`. |
| Thap | Route list filter | Criteria `groupId/isActive`, checklist `status`. |

## Ket Luan

Test hien tai du de chan cac loi nghiep vu P0 cua dot QAM Foundation: contract audit plan dung `assignments[]`, checklist weight khong sai 100, group khong con la noi luu weight, va QC my assignments co scope theo user.

Neu truoc khi ship muon ky hon, nen them nhom test route-level integration cho checklist builder va audit plan validation. Day la test mock route local, chua phai test goi API that voi DB that.
