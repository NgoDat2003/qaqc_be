---
title: "QC Audit Execution Core"
status: "implemented"
created: "2026-05-18"
branchTarget: "dev"
sourceReferenceBranch: "dev"
blockedBy: []
blocks: []
---

# Plan - QC Audit Execution Core

## Tổng Quan

Sau khi QAM đã có thể tạo checklist và publish audit plan, bước tiếp theo là mở luồng thực thi audit cho `qc_auditor`.

Mục tiêu của task này:

1. QC mở đúng assignment của mình.
2. QC lưu nháp được trong thời hạn audit.
3. QC nhập lỗi, ghi chú và ảnh bằng chứng.
4. Backend tự trả repeat info và lịch sử tiêu chí theo `store + criteria`.
5. QC submit bài, backend tự tính scoring và tự tạo Action Plan nếu có lỗi.

Nghiệp vụ đã chốt:

- QC không được xem điểm preview trước submit.
- QC không tự nhập/chọn repeat count.
- Ảnh bằng chứng là phần lõi của audit, gắn theo từng lỗi.
- Bài sau submit là read-only với QC.
- Nếu cần chỉnh bài sau submit, SM gửi yêu cầu và QAM là người reopen/cập nhật ở nhánh công việc sau.
- Khi mở bài audit, BE chỉ trả dữ liệu cơ bản cần để render nhanh; ngay sau đó FE gọi ngầm một API bundle để lấy toàn bộ lịch sử tiêu chí của checklist trong một lần.

## Business Scope

### Trong scope

- Mở/resume audit từ assignment hợp lệ.
- Lưu draft audit.
- Chuyển assignment `pending -> in_progress` khi draft đầu tiên được tạo.
- Tính repeat từ lịch sử audit đã submit.
- Trả lịch sử lỗi theo bundle cho toàn bộ criteria của assignment/checklist hiện tại.
- Upload và gắn ảnh bằng chứng vào violation.
- Submit audit bằng scoring source of truth.
- Ghi audit, group scores, violations, images, assignment status và auto-create AP trong một transaction.

### Ngoài scope

- QAM reopen/update audit sau submit.
- Entity yêu cầu chỉnh bài từ SM.
- Dashboard/report.
- Action Plan workflow chi tiết của SM/QAM.
- Hiển thị điểm preview cho QC.

## Luồng Nghiệp Vụ

```txt
QAM publish plan
    ->
QC xem my assignments
    ->
QC mở assignment hợp lệ
    ->
QC lưu draft + ảnh bằng chứng
    ->
FE tải ngầm history bundle cho toàn checklist
    ->
QC bấm tiêu chí lỗi và xem dữ liệu đã có sẵn trong cache
    ->
QC submit
    ->
BE tính score + lưu kết quả + tạo AP draft nếu có lỗi
```

## API Contract Đề Xuất

### 1. `GET /api/audits/assignments/:assignmentId`

Mục tiêu:

- Mở bài audit cho QC.
- Trả assignment, store, checklist, draft hiện có và trạng thái audit window.

Response cần có:

```ts
type AuditSession = {
  assignment: {
    id: string
    status: "pending" | "in_progress" | "completed"
    store: { id: string; code: string; name: string }
    plan: {
      id: string
      name: string
      status: "open" | "closed"
      startDate: string
      endDate: string
      isAuditWindowOpen: boolean
    }
  }
  checklist: ChecklistDetail
  audit: {
    id: string
    submittedAt: string | null
    violations: AuditViolationDraft[]
  } | null
}
```

### 2. `PATCH /api/audits/draft`

Body:

```ts
type Body = {
  assignmentId: string
  violations: Array<{
    criteriaId: string
    numErrors: number
    note?: string | null
    imageIds?: string[]
  }>
}
```

Rule:

- Chỉ auditor được assign mới được lưu.
- Plan phải `open`.
- Audit window phải còn hiệu lực.
- Assignment chưa `completed`.
- Lần lưu draft đầu tiên:
  - tạo `Audit`
  - gán `assignment.auditId`
  - chuyển assignment sang `in_progress`
- Draft không tính vào repeat history.

### 3. `GET /api/audits/assignments/:assignmentId/history`

Mục tiêu:

- Chạy ngầm sau khi màn audit đã render.
- Lấy một lần toàn bộ lịch sử lỗi cho các criteria thuộc checklist của assignment hiện tại.
- Backend tự suy ra `storeId` và danh sách `criteriaId` từ assignment, FE không phải truyền 100 id.

Response:

```ts
type AuditHistoryBundleResponse = {
  assignmentId: string
  store: { id: string; code: string; name: string }
  historiesByCriteriaId: Record<string, {
    criteriaId: string
    nextRepeatCount: number
    nextRepeatLabel: "first" | "second" | "third" | "auto_ccp" | "reset"
    isCriticalTriggered: boolean
    history: Array<{
      auditId: string
      submittedAt: string
      numErrors: number
      repeatCount: number
      note: string | null
      images: Array<{
        id: string
        url: string
      }>
    }>
  }>
}
```

### 4. `POST /api/upload/images`

Mục tiêu:

- Upload ảnh bằng chứng của QC.
- Trả `imageId/url/fileName/mimeType`.
- Ảnh chỉ thật sự thuộc nghiệp vụ khi được attach vào violation trong draft/submit.

### 5. `POST /api/audits/submit`

Body giữ giống draft:

```ts
type Body = {
  assignmentId: string
  violations: Array<{
    criteriaId: string
    numErrors: number
    note?: string | null
    imageIds?: string[]
  }>
}
```

Rule:

- Không nhận `repeatCount`, `grade`, `finalScore`, `groupScores`.
- Không trả điểm preview trước đó cho QC.
- Chỉ submit assignment thuộc auditor hiện tại.
- Plan phải `open`, nằm trong audit window.
- Assignment chưa `completed`.
- Backend bulk-fetch dữ liệu cần tính scoring.
- Backend tự tính repeat theo `storeId + criteriaId`.
- Backend tự tính score.
- Có violation `numErrors > 0` thì tạo `ActionPlan draft`.

Response:

```ts
type SubmitAuditResponse = {
  id: string
  finalScore: number
  grade: "excellent" | "good" | "pass" | "fail" | "alarm"
  isRiskTriggered: boolean
  repeatInfo: Array<{
    criteriaId: string
    numErrors: number
    repeatCount: number
    repeatLabel: "first" | "second" | "third" | "auto_ccp" | "reset"
    isCriticalTriggered: boolean
  }>
}
```

## Data / Schema Impact

Schema hiện tại đã có:

- `Audit`
- `Violation`
- `Evidence`
- `GroupScore`
- `ActionPlan`

Điểm cần đánh giá khi implement:

1. `Evidence` hiện tên bảng còn dùng khái niệm chung; API/FE nên gọi là **ảnh bằng chứng** cho dễ hiểu.
2. Cần quyết định dùng `Evidence.id` hay thêm abstraction `imageIds`; ưu tiên không đổi schema nếu chưa bắt buộc.
3. Audit hiện có sẵn `editedAt` và `editNote`; giữ lại để nhánh sau làm QAM reopen/correction.
4. Nếu muốn lưu người QAM sửa bài sau này, schema hiện chưa có `editedById`; task này chưa cần đổi nhưng phải ghi nợ kiến trúc.

## Chiến Lược Tải Lịch Sử Tiêu Chí

### Quyết định

Không nhét lịch sử lỗi vào API mở bài audit chính, nhưng cũng không gọi từng tiêu chí một.

Mở bài audit chỉ nên trả:

- assignment
- store
- checklist
- draft hiện tại
- trạng thái audit window

Ngay sau khi màn hình render xong, FE gọi ngầm:

```txt
GET /api/audits/assignments/:assignmentId/history
```

API này trả toàn bộ history của checklist trong một lần, map theo `criteriaId`.

### Lý do

| Hướng | Ưu điểm | Nhược điểm |
|---|---|---|
| Trả full history ngay khi mở bài | FE đơn giản | Payload nặng, mở bài chậm |
| Gọi từng history theo từng tiêu chí | Mở bài nhanh | Tăng số request rất lớn khi checklist/user nhiều |
| Tải ngầm một history bundle sau khi mở bài | Mở bài nhanh, chỉ 1 request nền, FE cache sạch | Có thêm một payload nền cần tối ưu |

Khuyến nghị cuối:

1. `GET /api/audits/assignments/:assignmentId` chỉ trả dữ liệu cơ bản.
2. Sau khi render xong, FE gọi ngầm `GET /api/audits/assignments/:assignmentId/history`.
3. Backend query theo tập criteria của checklist trong một lần và trả `historiesByCriteriaId`.
4. Khi QC bấm vào tiêu chí, FE chỉ đọc cache đã có; không cần gọi thêm nếu bundle đã xong.
5. Nếu history bundle quá nặng trong dữ liệu thật, phương án giảm tải sau này là:
   - chỉ trả metadata + lần gần nhất;
   - hoặc thêm `includeImages=false`;
   - hoặc tách riêng ảnh chi tiết khi mở modal lịch sử.

### Gợi ý query

Luồng backend nên là:

1. Lấy danh sách criteria thuộc checklist của assignment.
2. Query toàn bộ violation lịch sử theo:
   - `audit.storeId = assignment.storeId`
   - `audit.submittedAt IS NOT NULL`
   - `violation.criteriaId IN (...)`
3. Chỉ select field cần cho UI.
4. Group kết quả trong service thành `historiesByCriteriaId`.

Nếu đo thực tế thấy chậm, ưu tiên xem lại index theo pattern truy vấn lịch sử, ví dụ:

- `audits(storeId, submittedAt)`
- `violations(criteriaId, auditId)`

## Phase Triển Khai

### Phase 1 - Audit Core Foundation

1. Tạo helper dùng chung:
   - ownership guard
   - audit window guard
   - draft/session mapper
2. Tạo endpoint mở/resume audit theo assignment.
3. Tạo endpoint draft.
4. Test:
   - QC không mở/lưu assignment người khác
   - ngoài audit window bị chặn
   - draft đầu tiên chuyển assignment sang `in_progress`
   - assignment completed không được draft lại

### Phase 2 - Repeat & Criteria History

1. Tạo helper/service tính repeat từ submitted history.
2. Tạo endpoint history bundle theo assignment.
3. API mở bài không include history.
4. Trả `historiesByCriteriaId`.
5. Test:
   - draft không tính repeat
   - store khác không ảnh hưởng
   - criteria khác không ảnh hưởng
   - lần 4 auto CCP
   - lần 5 reset
   - history có ảnh cũ và note cũ
   - audit session mở bài không kéo theo history
   - history bundle chỉ gom criteria thuộc checklist của assignment hiện tại
   - history bundle chỉ cần một request để phục vụ toàn bài
   - query không rơi vào N+1 theo từng criteria

### Phase 3 - Image Flow

1. Tạo upload route cho ảnh bằng chứng.
2. Validate file type/size cơ bản.
3. Attach ảnh vào violation khi lưu draft/submit.
4. Trả ảnh trong audit session/history.
5. Test:
   - upload hợp lệ
   - file sai định dạng bị chặn
   - ảnh chỉ hiện trong violation đã attach
   - không tạo dữ liệu orphan trong transaction submit

### Phase 4 - Scoring & Submit

1. Viết lại scoring engine làm source of truth.
2. Submit route gọi scoring engine, không tự tính rải rác trong route.
3. Transaction submit:
   - update audit
   - replace violations/group scores/images
   - complete assignment
   - auto-create AP nếu có lỗi
4. Test:
   - normal deduction
   - critical group về 0
   - risk toàn bài về 0
   - repeat lần 4 kích hoạt critical
   - audit có lỗi tạo AP draft
   - audit không lỗi không tạo AP
   - rollback toàn bộ khi một bước lỗi

### Phase 5 - Docs & FE Handoff

1. Viết tài liệu FE cho màn QC:
   - không có preview score
   - lịch sử tiêu chí
   - ảnh bằng chứng
   - submitted read-only
2. Cập nhật `docs/rebuild-status.md`.
3. Cập nhật test report.

## Test Matrix

| Nhóm | Test bắt buộc |
|---|---|
| Ownership | QC chỉ mở/lưu/submit assignment của mình |
| Window | ngoài `startDate/endDate` không thao tác được |
| Draft | draft đầu tiên tạo audit và đổi assignment status |
| Repeat | 1/2/3/4/reset, draft không tính, scope đúng store + criteria |
| History | trả bundle theo toàn checklist, có số lần lặp kế tiếp, lịch sử trước, note, ảnh |
| Image | upload, attach, đọc lại trong draft/history |
| Scoring | normal, CCP, RISK, auto CCP |
| Submit | completed, AP auto-create, rollback transaction |
| Contract | không nhận score từ FE, không có preview score trước submit |

## Rủi Ro Chính

| Rủi ro | Cách chặn |
|---|---|
| QC canh điểm nếu có preview | Không cung cấp preview score |
| Repeat lệch vì tính cả draft | Query chỉ lấy audit `submittedAt != null` |
| Ảnh bị mồ côi | Attach qua violation và cleanup sau nếu cần |
| Route submit quá dày | Tách helper/service sớm |
| Sau này QAM reopen khó làm | Giữ `editedAt/editNote`, không thiết kế submit như trạng thái không thể điều chỉnh vĩnh viễn |
| Mở bài audit chậm vì kéo history quá nhiều | Tách history sang endpoint nền riêng |
| 100 tiêu chí sinh 100 request lịch sử | Dùng history bundle theo assignment trong một request |

## Chưa Làm Trong Task Này Nhưng Đã Chốt Đường Đi

### Audit Review & Correction

Sau QC core, cần một task riêng cho luồng:

```txt
SM gửi yêu cầu xem lại bài
        ->
QAM xem yêu cầu
        ->
QAM reopen/update audit
        ->
Hệ thống tính lại score và lưu audit trail
```

Lý do tách riêng:

- đây không còn là thao tác của QC;
- liên quan quyền của SM và QAM;
- cần quyết định entity cho yêu cầu chỉnh sửa, lý do, trạng thái và lịch sử.

## Acceptance Criteria

Task chỉ coi là xong khi:

1. QC mở được assignment của mình.
2. QC lưu nháp được và assignment chuyển `in_progress`.
3. QC không xem được điểm preview trước submit.
4. Sau khi history bundle tải xong, QC bấm vào tiêu chí lỗi và xem được repeat lần mấy + lịch sử lỗi tại cửa hàng đó ngay từ cache.
5. QC upload và gắn được ảnh bằng chứng vào lỗi.
6. Submit tự tính scoring/repeat và khóa bài với QC.
7. Audit có lỗi tự tạo AP `draft`.
8. `npm run test` pass.
9. `npm run build` pass.

## Lệnh Triển Khai Tiếp Theo

```txt
[$ck:cook](C:\Users\ACER\.codex\skills\cook\SKILL.md) Triển khai QC Audit Execution Core theo plans/260518-qc-audit-execution-core/plan.md --auto
```
