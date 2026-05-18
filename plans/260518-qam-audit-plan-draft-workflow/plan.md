---
title: "QAM Audit Plan Draft Workflow"
status: "implemented"
created: "2026-05-18"
branchTarget: "dev"
sourceReferenceBranch: "dev"
blockedBy: []
blocks: []
---

# Plan - QAM Audit Plan Draft Workflow

## Tóm Tắt

Hiện tại QAM tạo audit plan là plan được mở ngay (`open`) và assignment được sinh ngay cho QC. Cách này chưa đủ đúng nghiệp vụ vì QAM cần có bước lưu nháp, chỉnh sửa đầy đủ trước khi giao việc, và trong lúc plan đang chạy vẫn cần đổi QC hoặc bỏ cửa hàng nếu bài kiểm tra của cửa hàng đó chưa được tiến hành.

Plan này chuẩn hóa workflow audit plan thành:

```txt
draft -> open -> closed
```

Quy tắc lõi:

- `draft`: QAM sửa full plan.
- `open`: QAM chỉ được sửa window và các assignment chưa tiến hành.
- `closed`: khóa plan.
- Assignment đã `in_progress`, `completed`, hoặc đã có `auditId` thì không được đổi QC/xóa.

## Phạm Vi

### Trong scope

- Đổi tạo audit plan mặc định thành `draft`.
- Thêm API publish audit plan.
- Thêm API sửa audit plan.
- Thêm API đổi QC cho assignment pending.
- Thêm API xóa assignment pending.
- Cập nhật docs FE handoff.
- Cập nhật test cho status transition và RBAC.

### Ngoài scope

- Chưa làm audit execution/submit/scoring.
- Chưa làm audit trail chi tiết.
- Chưa làm optimistic locking cho autosave.
- Chưa làm notification cho QC khi QAM đổi assignment.

## Business Rules Chốt

### Audit Plan Status

| Status | Ý nghĩa | QAM được làm gì |
|---|---|---|
| `draft` | Đang soạn kế hoạch, chưa giao QC | Sửa full, thêm/xóa/đổi assignment, đổi checklist |
| `open` | Đã publish cho QC thực hiện | Sửa `name/startDate/endDate`, đổi QC/xóa assignment pending |
| `closed` | Đã đóng kế hoạch | Không sửa |

### Assignment Status

Giữ status hiện tại:

```ts
"pending" | "in_progress" | "completed"
```

Rule:

- `pending`: được đổi `auditorId`, được xóa khỏi plan.
- `in_progress`: không được đổi/xóa.
- `completed`: không được đổi/xóa.
- Có `auditId`: không được đổi/xóa, kể cả status đang bất thường.

### Draft Save

Giai đoạn đầu ưu tiên nút lưu thủ công hoặc FE gọi `PATCH` khi người dùng bấm lưu. Nếu FE muốn autosave thì dùng cùng endpoint `PATCH /api/audit-plans/:id`, nhưng cần debounce ở FE.

Không bắt buộc làm optimistic lock ở task này, nhưng response phải trả `updatedAt` để FE có nền tảng xử lý sau.

## API Contract Đề Xuất

### `POST /api/audit-plans`

Tạo plan `draft`, không giao việc ngay theo nghĩa nghiệp vụ.

Body giữ contract mới:

```ts
type Body = {
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

Response trả audit plan detail hydrated.

Thay đổi behavior:

```ts
status: "draft"
```

### `PATCH /api/audit-plans/:id`

Sửa plan.

Body:

```ts
type Body = {
  name?: string
  formId?: string
  startDate?: string
  endDate?: string
  assignments?: Array<{
    storeId: string
    auditorId: string
  }>
}
```

Rule theo status:

- Nếu `draft`:
  - Cho sửa `name`, `formId`, `startDate`, `endDate`.
  - Cho replace toàn bộ `assignments`.
  - `formId` phải là checklist `published`.
  - `startDate <= endDate`.
  - Không duplicate `storeId`.
  - Store active.
  - Auditor active và có role `qc_auditor`.
- Nếu `open`:
  - Chỉ cho sửa `name`, `startDate`, `endDate`.
  - Không cho sửa `formId`.
  - Không cho replace toàn bộ `assignments`.
- Nếu `closed`:
  - Trả `400`.

### `POST /api/audit-plans/:id/publish`

Chuyển `draft -> open`.

Validation:

- Plan tồn tại.
- Plan đang `draft`.
- Có ít nhất 1 assignment.
- Checklist vẫn `published`.
- `startDate <= endDate`.
- Store và auditor trong assignments vẫn active.

Response trả detail mới với `status = "open"`.

### `PATCH /api/audit-plans/:id/assignments/:assignmentId`

Đổi QC cho một assignment.

Body:

```ts
type Body = {
  auditorId: string
}
```

Rule:

- QAM/company_admin.
- Plan không được `closed`.
- Assignment phải thuộc plan.
- Assignment phải `pending`.
- Assignment chưa có `auditId`.
- Auditor mới phải active và có role `qc_auditor`.

Cho phép dùng cả khi plan `draft` và `open`.

### `DELETE /api/audit-plans/:id/assignments/:assignmentId`

Xóa một cửa hàng khỏi audit plan.

Rule:

- QAM/company_admin.
- Plan không được `closed`.
- Assignment phải thuộc plan.
- Assignment phải `pending`.
- Assignment chưa có `auditId`.
- Nếu plan đang `open`, sau khi xóa vẫn nên còn ít nhất 1 assignment.
- Nếu plan đang `draft`, có thể cho xóa về 0 assignment để QAM lưu nháp rồi thêm sau.

Response trả plan detail mới.

## Database Impact

### Schema cần đổi

`AuditPlan.status` comment đổi từ:

```prisma
// "open" | "closed"
```

sang:

```prisma
// "draft" | "open" | "closed"
```

Default nên đổi:

```prisma
status String @default("draft")
```

### Migration

Cần tạo migration bằng Prisma, không sửa tay migration cũ.

Existing records:

- Plan hiện tại đang `open` giữ nguyên `open`.
- Không backfill về `draft`, vì dữ liệu đã tạo trước đó được xem như đã publish.

## Implementation Plan

### Phase 1 - Schema & Shared Helpers

1. Cập nhật `prisma/schema.prisma`:
   - AuditPlan status comment.
   - Default status `draft`.
2. Tạo migration.
3. Cập nhật `src/lib/qam.ts`:
   - `auditPlanCreateSchema`.
   - `auditPlanUpdateSchema`.
   - `auditAssignmentUpdateSchema`.
   - helper `assertPlanEditable`.
   - helper `assertPendingAssignmentMutable`.
4. Cập nhật `mapAuditPlan` nếu cần thêm field hỗ trợ FE.

### Phase 2 - Audit Plan Create/Patch/Publish

1. Sửa `POST /api/audit-plans` tạo `draft`.
2. Thêm `PATCH /api/audit-plans/:id`.
3. Thêm `POST /api/audit-plans/:id/publish`.
4. Đảm bảo response dùng `response.success()` hoặc `response.created()`.
5. Trả relation display fields giống contract hiện tại.

### Phase 3 - Assignment Mutation

1. Thêm `PATCH /api/audit-plans/:id/assignments/:assignmentId`.
2. Thêm `DELETE /api/audit-plans/:id/assignments/:assignmentId`.
3. Chặn mutate assignment không pending.
4. Chặn mutate assignment có `auditId`.
5. Chặn xóa assignment cuối cùng khi plan đã `open`.

### Phase 4 - Docs FE Handoff

1. Cập nhật `docs/qam-fe-handoff.md`.
2. Ghi rõ:
   - create trả `draft`;
   - publish mới giao QC;
   - open chỉ sửa pending assignment;
   - autosave dùng `PATCH` nhưng FE nên debounce.
3. Dọn phần plan cũ còn `scheduledDate` để tránh FE hiểu nhầm.

### Phase 5 - Tests

Thêm test vào `tests/run-tests.ts`:

- Create audit plan trả `draft`.
- Publish `draft -> open`.
- Publish plan không có assignment bị chặn.
- PATCH draft sửa được full.
- PATCH open không cho đổi checklist/formId.
- PATCH open cho đổi `startDate/endDate`.
- PATCH closed bị chặn.
- Đổi QC assignment pending thành công.
- Đổi QC assignment `in_progress` bị chặn.
- Đổi QC assignment có `auditId` bị chặn.
- Xóa assignment pending thành công.
- Xóa assignment completed bị chặn.
- Xóa assignment cuối cùng khi plan open bị chặn.

## Acceptance Criteria

- `npm run test` pass.
- `npm run build` pass.
- `npx prisma validate` pass.
- API QAM có đủ workflow:

```txt
create draft
edit draft
publish open
edit open window
change pending QC
remove pending store
close
```

- FE có docs rõ để làm:
  - nút lưu nháp;
  - nút publish/giao việc;
  - disable edit với assignment đã bắt đầu;
  - badge trạng thái plan/assignment.

## Risk & Mitigation

| Risk | Mức | Mitigation |
|---|---|---|
| FE đang kỳ vọng create là `open` | Medium | Docs ghi breaking change, FE thêm nút publish |
| QAM replace assignment làm mất assignment đã audit | High | Chỉ cho replace full ở `draft`; open chỉ mutate pending từng item |
| Autosave ghi đè dữ liệu | Medium | Bước đầu dùng manual save hoặc FE debounce; `updatedAt` để xử lý sau |
| Dữ liệu cũ status `open` | Low | Giữ nguyên dữ liệu cũ, chỉ default mới là `draft` |

## Cook Command Tiếp Theo

```txt
[$ck:cook](C:\Users\ACER\.codex\skills\cook\SKILL.md) Triển khai QAM Audit Plan Draft Workflow theo plans/260518-qam-audit-plan-draft-workflow/plan.md
```
