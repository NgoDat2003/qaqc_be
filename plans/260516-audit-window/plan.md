---
title: "Audit Window Plan"
status: "implemented"
created: "2026-05-16"
branchTarget: "dev"
sourceReferenceBranch: "dev"
blockedBy: []
blocks: []
---

# Plan - Audit Window Cho Audit Plan

## Tong Quan

Contract hien tai dang dung `scheduledDate` tren tung `AuditAssignment`. Cach nay qua cung: neu QC bi su co, doi ca, cua hang dong tam thoi, hoac can doi ngay kiem tra trong cung dot audit thi BE/FE phai sua tung assignment hoac tao lai plan.

Nghiep vu dung hon: **mot audit plan co khoang thoi gian hieu luc tu ngay A den ngay B**. Trong khoang do, QC duoc thuc hien audit cho assignment cua minh. Moi store van la mot assignment rieng va van co QC rieng, nhung khong can gan cung mot ngay duy nhat.

## Business Decision Moi

| Chu de | Quyet dinh |
|---|---|
| Audit window | Audit plan co `startDate` va `endDate`. |
| Assignment date | Bo `scheduledDate` khoi input FE. Assignment ke thua window cua plan. |
| QC execution | QC chi duoc start/submit audit khi plan dang `open` va hien tai nam trong `startDate <= now <= endDate`. |
| Delay/su co | Neu co su co, QAM chi can sua/mo rong window cua plan thay vi sua tung store. |
| Store/QC mapping | Van giu `assignments[]`, moi item la `storeId + auditorId`. |
| Backward compatibility | `AuditAssignment.scheduledDate` se chuyen thanh nullable/deprecated de khong pha data cu ngay lap tuc. |

## Database Change

### Schema de xuat

```prisma
model AuditPlan {
  id        String   @id @default(cuid())
  name      String
  type      String   @default("adhoc")
  scope     String   @default("company")
  formId    String
  form      ChecklistForm @relation(fields: [formId], references: [id])
  status    String   @default("open")

  startDate DateTime
  endDate   DateTime

  assignments AuditAssignment[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([status])
  @@index([formId])
  @@index([startDate, endDate])
  @@map("audit_plans")
}

model AuditAssignment {
  id            String    @id @default(cuid())
  planId        String
  plan          AuditPlan @relation(fields: [planId], references: [id], onDelete: Cascade)
  storeId       String
  store         Store     @relation(fields: [storeId], references: [id])
  auditorId     String
  auditor       User      @relation("AssignmentAuditor", fields: [auditorId], references: [id])

  // Deprecated: giu tam de migrate data cu, FE khong dung nua.
  scheduledDate DateTime?

  status        String    @default("pending")
  auditId       String?   @unique
  audit         Audit?    @relation(fields: [auditId], references: [id])

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([planId, storeId])
  @@index([planId])
  @@index([storeId])
  @@index([auditorId])
  @@index([status])
  @@map("audit_assignments")
}
```

### Migration strategy

1. Add `audit_plans.startDate` va `audit_plans.endDate`.
2. Backfill plan cu:
   - `startDate = MIN(audit_assignments.scheduledDate)` neu co assignment.
   - `endDate = MAX(audit_assignments.scheduledDate)` neu co assignment.
   - Neu plan khong co assignment: fallback `createdAt` cho ca start/end.
3. Alter `audit_assignments.scheduledDate` thanh nullable.
4. Them index `audit_plans(startDate, endDate)`.
5. Khong drop `scheduledDate` trong task nay de tranh pha data/API cu qua manh.

## API Contract Moi

### Create Audit Plan

Endpoint:

```txt
POST /api/audit-plans
```

Body moi:

```ts
type CreateAuditPlanBody = {
  name: string
  formId: string
  startDate: string
  endDate: string
  assignments: Array<{
    storeId: string
    auditorId: string
  }>
}
```

Body cu bi loai bo:

```ts
type OldCreateAuditPlanBody = {
  name: string
  formId: string
  assignments: Array<{
    storeId: string
    auditorId: string
    scheduledDate: string
  }>
}
```

Validation:

- `formId` phai la checklist `published`.
- `startDate` va `endDate` phai parse duoc Date.
- `startDate <= endDate`.
- `assignments` min 1.
- Khong duplicate `storeId` trong cung plan.
- Store phai active.
- Auditor phai active va co role `qc_auditor`.
- Khong nhan `scheduledDate` tu FE nua.

### Audit Plan Response

```ts
type AuditPlan = {
  id: string
  name: string
  status: "open" | "closed"
  startDate: string
  endDate: string
  form: { id: string; name: string; version: string; status: string }
  assignments: Array<{
    id: string
    status: "pending" | "in_progress" | "completed"
    auditId: string | null
    store: { id: string; code: string; name: string }
    auditor: { id: string; fullName: string; email: string }
  }>
  progress: {
    total: number
    pending: number
    inProgress: number
    completed: number
  }
}
```

### My Assignments Response

```ts
type MyAssignment = {
  id: string
  status: "pending" | "in_progress" | "completed"
  store: { id: string; code: string; name: string }
  plan: {
    id: string
    name: string
    status: string
    startDate: string
    endDate: string
    isAuditWindowOpen: boolean
  }
  checklist: { id: string; name: string; version: string }
  auditId: string | null
}
```

## Audit Execution Guard Sau Nay

Khi implement audit draft/submit, BE can check:

```ts
function canAudit(plan: { status: string; startDate: Date; endDate: Date }, now = new Date()) {
  return plan.status === "open" && plan.startDate <= now && now <= plan.endDate;
}
```

Ap dung cho:

- `POST /api/audits/draft`
- `POST /api/audits/submit`
- bat ky endpoint start/resume audit neu co

Neu ngoai window:

```json
{
  "success": false,
  "error": {
    "statusCode": 400,
    "message": "Audit is outside the allowed audit window"
  }
}
```

## FE Impact

| Man hinh | Thay doi |
|---|---|
| Create Audit Plan | Doi input tu `scheduledDate` tung assignment sang `startDate/endDate` o cap plan. |
| Assignment table | Hien thi audit window thay vi scheduled date. |
| My Assignments | Hien badge `Con han / Het han / Chua den ngay` dua tren `startDate/endDate`. |
| Audit button | Disable neu `isAuditWindowOpen=false` hoac plan closed. |

## Implementation Order

### Phase 1 - DB & DTO

1. Sua Prisma schema:
   - add `AuditPlan.startDate`
   - add `AuditPlan.endDate`
   - make `AuditAssignment.scheduledDate` nullable
   - add index `[startDate, endDate]`
2. Tao migration chinh thuc.
3. Update `src/lib/qam.ts`:
   - select start/end date tren plan
   - remove scheduledDate khoi create schema assignment item
   - add helper validate audit window

### Phase 2 - Audit Plan Routes

1. Update `POST /api/audit-plans`:
   - parse `startDate/endDate`
   - reject invalid range
   - create assignments khong can scheduledDate
2. Update `GET /api/audit-plans`.
3. Update `GET /api/audit-plans/[id]`.
4. Update `GET /api/audit-plans/my-assignments`.

### Phase 3 - Seed & Docs

1. Update `prisma/seed.ts`:
   - tao plan co start/end date
   - assignment scheduledDate co the null hoac gan fallback de tuong thich
2. Update `docs/qam-fe-handoff.md`.
3. Update test report.

### Phase 4 - Tests

Required tests:

- Create audit plan fail neu thieu `startDate/endDate`.
- Create audit plan fail neu `startDate > endDate`.
- Create audit plan fail neu FE gui body cu chi co `scheduledDate`.
- Create audit plan success voi `startDate/endDate` va assignments chi co `storeId/auditorId`.
- Response plan co `startDate/endDate`, assignment khong can expose `scheduledDate`.
- My assignments response co `isAuditWindowOpen`.
- Prisma schema validate pass.
- `npm run test` pass.
- `npm run build` pass.

## Out Of Scope

- Auto extend window.
- QAM reopen closed plan.
- Per-store custom audit window.
- Notification khi sap het han audit.
- Audit draft/submit guard neu task audit execution chua mo.

## Lenh Trien Khai Tiep Theo

```txt
[$ck:cook](C:\Users\ACER\.codex\skills\cook\SKILL.md) Trien khai Audit Window theo plans/260516-audit-window/plan.md --auto
```
