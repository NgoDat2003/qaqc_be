# Test Report - Audit Window

Ngay test: 2026-05-16

## Scope

Thay doi audit plan tu `scheduledDate` theo tung assignment sang audit window cap plan:

- `AuditPlan.startDate`
- `AuditPlan.endDate`
- `AuditAssignment.scheduledDate` nullable/deprecated
- Create audit plan nhan `startDate/endDate`
- My assignments tra `isAuditWindowOpen`

## Test Cases Bo Sung

| Nhom | Case |
|---|---|
| Audit window validation | Chan `startDate > endDate` |
| Audit plan create | Tao plan voi `startDate/endDate` va assignments chi co `storeId/auditorId` |
| Backward contract removal | Assignment create data khong con `scheduledDate` |
| Response contract | Plan response co `startDate/endDate` |
| QC assignment | My assignments tra `plan.isAuditWindowOpen` |

## Verification

| Command | Ket qua |
|---|---|
| `npm.cmd run test` | Pass `28/28` |
| `npm.cmd run build` | Pass |
| `npx.cmd prisma validate` | Pass |
| `npx.cmd prisma migrate status` | Database schema is up to date |

## Luu Y Local

Prisma Client bi lock engine file do co tien trinh Node dang chay, nen da generate bang `prisma generate --no-engine` de cap nhat type cho verification. Code/migration trong repo van day du; khi restart dev server hoac CI cai dat lai dependency, Prisma Client se generate binh thuong theo schema moi.
