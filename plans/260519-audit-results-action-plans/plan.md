---
title: Audit Results, Correction Requests Va Action Plan APIs
status: implemented
branch: codex/audit-results-action-plans
createdAt: 2026-05-19
scope: audit_results_correction_requests_action_plans
---

# Plan 260519 - Audit Results, Correction Requests Va Action Plan APIs

## Summary

Mo API xem ket qua audit, luong SM yeu cau QAM mo bai de sua ket qua, notification toi thieu, va Action Plan sau khi ket qua audit da duoc chap nhan. Action Plan se hoat dong nhu mot bai xu ly loi: mo lai danh sach violation cua audit, moi loi co mo ta loi/anh loi tu QC va phan SM cap nhat rieng.

Quyet dinh nghiep vu da chot:

- AP xu ly theo tung loi, khong dung mot remediation chung cho ca bai.
- Moi loi co ngay thuc te sua xong rieng, dung field `fixedAt`; khong dung deadline.
- SM nhap ten nguoi thuc hien bang text, khong bat buoc user ton tai trong he thong.
- Anh khac phuc bat buoc voi `critical/risk`, optional voi loi thuong.
- QAM reject bat buoc co ly do.
- QC chi xem lai audit minh da cham.
- SM chi xem/xu ly audit/AP cua store minh phu trach.
- AM read-only theo store scope.
- Executive read-only list/detail.
- QC submit chi tao audit result, khong auto-create AP.
- Neu SM thay bai cham co van de, SM tao correction request cho QAM.
- QAM co the approve/reject correction request; neu approve thi QAM sua violation/anh/ghi chu va BE tinh lai score.
- QAM khong nhap diem tay.
- Khi audit da sinh AP thi khong duoc cap nhat lai bai cham QC nua.
- Notification lam minimal trong task nay.

## Implementation Phases

### Phase 1 - Schema Va Migration

- Them `AuditCorrectionRequest`.
- Them `ActionPlanItem`.
- Them `Evidence.actionPlanItemId`.
- Giu field cu tren `ActionPlan` de tranh drop du lieu dot ngot, nhung API moi khong dung `remediation/deadline/evidences` cap AP.
- Chay `npx prisma migrate dev` va `npx prisma generate`.

Output mong doi:

- Prisma schema validate pass.
- DB co the luu correction request, AP item va anh khac phuc theo tung item.

### Phase 2 - Shared Scope, DTO, Validation

- Tao helper scope cho audit/AP:
  - QAM: all.
  - QC: audit do minh cham.
  - SM: store scope cua minh.
  - AM: store scope cua minh, read-only.
  - Executive: all read-only.
- Tao DTO mapper cho:
  - audit result list/detail.
  - action plan list/detail.
  - correction request.
  - notification.
- Tao validation schema cho:
  - correction request create/review.
  - QAM correction update.
  - AP item update.
  - AP submit.

Output mong doi:

- Route khong tra raw Prisma include.
- Scope logic dung chung, tranh lap dieu kien RBAC o tung route.

### Phase 3 - Audit Results APIs

- Implement `GET /api/audits`.
- Implement `GET /api/audits/:id`.
- Response detail phai gom:
  - store, auditor, checklist.
  - finalScore, grade, submittedAt.
  - groupScores.
  - violations + criteria display + anh loi QC.
  - actionPlan summary neu co.
  - correction request summary neu co.

Output mong doi:

- FE co the render man ket qua audit cho QAM/QC/SM/AM/executive theo scope.

### Phase 4 - Correction Request APIs

- Implement `POST /api/audits/:id/correction-requests`.
- Implement `GET /api/audits/:id/correction-requests`.
- Implement `POST /api/audit-correction-requests/:id/approve`.
- Implement `POST /api/audit-correction-requests/:id/reject`.
- Implement `PATCH /api/audits/:id/correction`.
- Guard bat buoc:
  - audit da co AP thi khong tao request va khong correction.
  - pending request duplicate bi chan.
  - QAM correction update khong nhan finalScore/grade tu client.
  - BE tinh lai score bang scoring engine.

Output mong doi:

- SM co the yeu cau QAM xem lai bai.
- QAM approve/reject.
- QAM sua violation/evidence/note sau approve, score tu tinh lai.

### Phase 5 - Action Plan APIs

- Sua `POST /api/audits/submit` de khong auto-create AP nua.
- Implement `POST /api/audits/:id/action-plan`.
- Implement `GET /api/action-plans`.
- Implement `GET /api/action-plans/:id`.
- Implement `PATCH /api/action-plans/:id`.
- Implement `POST /api/action-plans/:id/submit`.
- Implement `POST /api/action-plans/:id/reject`.
- Implement `POST /api/action-plans/:id/close`.
- AP detail phai tra full mot bai AP gom tat ca item loi:
  - loi goc/criteria/note/anh loi QC.
  - rootCause/remediation/fixedAt/assigneeName.
  - remediationImages.

Output mong doi:

- SM xu ly tung loi trong mot AP.
- QAM review/reject/close AP.
- Audit co AP bi khoa correction.

### Phase 6 - Minimal Notifications

- Implement `GET /api/notifications`.
- Implement `GET /api/notifications/unread-count`.
- Implement `PATCH /api/notifications/:id/read`.
- Implement `PATCH /api/notifications/read-all`.
- Tao notification khi:
  - SM tao correction request cho QAM.
  - QAM approve/reject correction request cho SM.
  - QAM/SM tao AP tu audit result.
  - SM submit AP cho QAM.
  - QAM reject/close AP cho SM.

Output mong doi:

- FE co API chuong thong bao co ban, khong can realtime trong task nay.

### Phase 7 - Tests, Docs, Build

- Cap nhat route-level tests trong `tests/run-tests.ts`.
- Them docs FE:
  - `docs/audit-results-action-plans-fe-handoff.md`.
- Chay:
  - `npx prisma validate`
  - `npm run test`
  - `npm run build`

Output mong doi:

- Test pass.
- Build pass.
- FE co tai lieu contract de implement.

## Execution Order

1. Schema migration.
2. Shared helpers + DTO mapper.
3. Audit result list/detail.
4. Correction request flow.
5. Remove AP auto-create from submit.
6. AP create/list/detail/update/submit/reject/close.
7. Notifications.
8. Tests.
9. FE docs.

## Implementation Status

- Schema/migration: done.
- Audit result APIs: done.
- Correction request APIs: done.
- Action Plan APIs: done.
- Minimal notification APIs: done.
- FE handoff docs: done tai `docs/audit-results-action-plans-fe-handoff.md`.
- `npm.cmd run test`: 53/53 pass.
- `npm.cmd run build`: pass.
- `npx.cmd prisma validate`: pass.
- `npx.cmd prisma generate`: dang bi khoa file Prisma engine tren Windows vi node process dang giu DLL. Can tat dev server/node dang chay roi chay lai `npx.cmd prisma generate`.

## Key Changes

### Schema

- Them model `AuditCorrectionRequest`:
  - `auditId`
  - `storeId`
  - `requestedById`
  - `reason`
  - `status`: `pending`, `approved`, `rejected`
  - `reviewedById`
  - `reviewedAt`
  - `reviewNote`
  - `createdAt`, `updatedAt`
- Them model `ActionPlanItem`:
  - `actionPlanId`
  - `violationId`
  - `rootCause`
  - `remediation`
  - `fixedAt`
  - `assigneeName`
  - `status`
  - `createdAt`, `updatedAt`
- Doi evidence de attach duoc vao item khac phuc:
  - them `actionPlanItemId` nullable tren `Evidence`;
  - giu `violationId` cho anh loi QC;
  - giu `actionPlanId` neu can backward compatibility, nhung API moi uu tien item evidence.
- Bo/khong dung `ActionPlan.remediation/deadline/evidences` trong API moi, vi remediation/fixedAt nam o item.
- Submit audit co violation chi luu audit result va violations, khong auto-create AP.
- Them timestamp/field can thiet neu can cho correction request va AP lifecycle, uu tien migration nho va DTO ro.

### Audit Results APIs

- `GET /api/audits`
  - QAM/company admin: xem tat ca.
  - QC: chi audit do minh cham.
  - SM: audit cua store minh phu trach.
  - AM: audit cua store minh phu trach.
  - Executive: read-only tat ca.
  - Tra list full data phuc vu FE local sort/filter, gom store, auditor, checklist, score, grade, submittedAt, actionPlan status neu co.
- `GET /api/audits/:id`
  - Tra detail ket qua: store, auditor, checklist, finalScore, grade, groupScores, violations, anh loi QC, actionPlan summary.
  - Detail phai du de FE hien report, khong bat FE map id sang name.
- `PATCH /api/audits/:id/correction`
  - Chi QAM.
  - Chi cho phep khi audit chua co AP.
  - Chi cho phep khi co correction request `approved` dang can xu ly hoac QAM la owner nghiep vu can sua tu request da approve.
  - Body cho phep replace danh sach violations tuong tu submit:
    - `violations[].criteriaId`
    - `violations[].numErrors`
    - `violations[].note`
    - `violations[].imageIds`
    - `editNote`
  - BE tinh lai repeat/scoring/groupScores, update `editedAt/editNote`, va giu audit submitted.
  - Khong cho sua store, checklist, auditor, assignment.

### Correction Request APIs

- `POST /api/audits/:id/correction-requests`
  - Chi SM dung store cua audit.
  - Chi tao khi audit submitted, audit co violation, audit chua co AP.
  - Body bat buoc `reason`.
  - Neu da co request `pending` thi tra `400`.
  - Tao notification cho QAM.
- `GET /api/audits/:id/correction-requests`
  - QAM xem tat ca request cua audit.
  - SM xem request cua audit trong store minh.
  - AM/executive read-only neu co scope audit.
- `POST /api/audit-correction-requests/:id/approve`
  - Chi QAM.
  - Chi approve request `pending`.
  - Body optional `reviewNote`.
  - Tao notification cho SM.
- `POST /api/audit-correction-requests/:id/reject`
  - Chi QAM.
  - Chi reject request `pending`.
  - Body bat buoc `reviewNote`.
  - Tao notification cho SM.

### Action Plan APIs

- `POST /api/audits/:id/action-plan`
  - Tao AP tu audit result da submitted.
  - QAM hoac SM dung store duoc tao.
  - Chi tao khi audit co violation `numErrors > 0`.
  - Chi tao khi audit chua co AP.
  - Khong tao neu audit dang co correction request `pending`.
  - Khi tao AP, audit result bi khoa khoi correction/update.
  - Tao `ActionPlan(status="draft")` va 1 `ActionPlanItem` cho moi violation co `numErrors > 0`.
  - Tao notification cho SM neu QAM tao, va cho QAM neu SM tao.
- `GET /api/action-plans`
  - QAM/company admin: xem tat ca.
  - SM: chi AP cua store minh.
  - AM: chi AP cua store minh, read-only.
  - Executive: read-only tat ca.
  - QC: khong xu ly AP; mac dinh khong cap route nay cho QC.
- `GET /api/action-plans/:id`
  - Tra AP detail gom audit result, store, status, items.
  - Moi item gom violation goc, criteria display, note/anh loi QC, rootCause/remediation/fixedAt/assigneeName/anh khac phuc.
- `PATCH /api/action-plans/:id`
  - Chi SM dung store duoc update khi AP `draft` hoac `rejected`.
  - Body update theo item:
    - `itemId`
    - `rootCause`
    - `remediation`
    - `fixedAt`
    - `assigneeName`
    - `imageIds`
  - Khong cho update AP `submitted` hoac `closed`.
- `POST /api/action-plans/:id/submit`
  - Chi SM dung store.
  - Cho submit tu `draft` hoac `rejected` sang `submitted`.
  - Validate moi item co `rootCause`, `remediation`, `fixedAt`, `assigneeName`.
  - Validate item critical/risk co it nhat 1 anh khac phuc.
- `POST /api/action-plans/:id/reject`
  - Chi QAM.
  - Chi reject AP `submitted`.
  - Body bat buoc `reviewNote`.
  - Chuyen status ve `rejected`.
- `POST /api/action-plans/:id/close`
  - Chi QAM.
  - Chi close AP `submitted`.
  - Luu `closedById`, `closedAt`.
  - Tao notification cho SM.

### Notification APIs

- `GET /api/notifications`
  - Tra notification cua user hien tai, moi nhat truoc.
- `GET /api/notifications/unread-count`
  - Tra `{ count: number }`.
- `PATCH /api/notifications/:id/read`
  - Danh dau mot notification cua user hien tai la da doc.
- `PATCH /api/notifications/read-all`
  - Danh dau tat ca notification cua user hien tai la da doc.
- Notification events trong task nay:
  - SM tao correction request cho QAM.
  - QAM approve/reject correction request cho SM.
  - QAM/SM tao AP tu audit result.
  - SM submit AP cho QAM.
  - QAM reject/close AP cho SM.

## API Contract Notes

- Tat ca response dung `response.success()`, tao moi dung `response.created()`, loi dung `response.error()`.
- Khong tra raw Prisma include qua rong.
- Relation display fields toi thieu:
  - Store: `id`, `code`, `name`
  - User: `id`, `fullName`, `email`
  - Checklist: `id`, `name`, `version`
  - Criteria: `id`, `code`, `content`, `flag`, `group`
- Action Plan item response can phan biet:
  - `violation.images`: anh loi do QC upload khi cham bai.
  - `remediationImages`: anh SM upload khi khac phuc.
- Correction request khong phai yeu cau sua diem tay; no chi mo quyen cho QAM sua violations/evidence/note va BE tu tinh lai score.
- Khi audit da co AP thi moi API correction/update audit phai tra `400`.
- Khong auto-create AP trong `POST /api/audits/submit` nua.

## Test Plan

- Audit result list:
  - QAM xem tat ca audit submitted.
  - QC chi xem audit do minh cham.
  - SM/AM chi xem audit trong store scope.
  - Executive xem read-only.
- Audit result detail:
  - Co groupScores, violations, evidence anh loi, actionPlan summary.
  - Scope ngoai quyen tra `403`.
- QC submit:
  - Audit co loi khong auto-create AP.
  - Audit khong loi khong co AP.
- Correction request:
  - SM tao request cho audit store minh.
  - SM khong tao request cho store khac.
  - Audit da co AP thi khong tao correction request.
  - Pending request duplicate bi chan.
  - QAM approve pending request.
  - QAM reject pending request bat buoc `reviewNote`.
  - Approve/reject tao notification cho SM.
- QAM correction update:
  - QAM sua violations sau request approved va BE tinh lai finalScore/groupScores.
  - Khong cho QAM nhap finalScore/grade tay.
  - Audit da co AP thi correction update bi `400`.
- Action Plan creation:
  - Audit co 2 violation tao 1 AP va 2 item qua `POST /api/audits/:id/action-plan`.
  - Audit khong loi khong tao AP.
  - Audit co pending correction request khong tao AP.
  - Khong tao duplicate AP/item.
- Action Plan update:
  - SM update item trong AP `draft/rejected`.
  - SM khong update AP store khac.
  - SM khong update AP `submitted/closed`.
  - `assigneeName` la text, khong lookup user.
- Action Plan submit:
  - Thieu rootCause/remediation/fixedAt/assigneeName tra `400`.
  - Critical/risk thieu anh khac phuc tra `400`.
  - Loi thuong khong co anh van submit duoc.
- QAM review:
  - Reject submitted AP bat buoc `reviewNote`.
  - Close submitted AP luu `closedById/closedAt`.
  - Company admin khong close/reject thay QAM neu giu rule QA owner.
- Notifications:
  - User chi xem notification cua minh.
  - Unread count dung theo `isRead=false`.
  - Mark read khong cho update notification cua user khac.
- Regression:
  - `npm run test`
  - `npm run build`
  - `npx prisma validate`

## Assumptions

- SM store scope lay tu `RoleAssignment.storeId` va/hoac `Store.managerId` theo helper scope neu co.
- AM store scope lay tu `Store.amId` va/hoac role assignment store scope.
- Neu audit da co AP thi khong co API nao trong task nay cho phep sua lai diem/violation cua audit.
- AP chi duoc tao sau audit result, correction request neu co da xu ly xong, va khong con pending request.
- Upload image API hien tai dung lai cho remediation images; FE upload anh truoc roi gui `imageIds` vao AP update.
- Docs FE can them file rieng sau khi implement: `docs/audit-results-action-plans-fe-handoff.md`.
