---
title: "Báo Cáo Phân Tích Nghiệp Vụ QC"
created: "2026-05-18"
status: "analysis"
scope: "qc_auditor"
---

# Báo Cáo Phân Tích Nghiệp Vụ QC

## Tóm Tắt

Sau khi role `qa_manager` đã có thể cấu hình checklist và tạo audit plan, role tiếp theo nên mở là `qc_auditor`.

QC không phải người cấu hình nghiệp vụ, cũng không phải người quyết định điểm thủ công. Vai trò của QC là:

1. Nhận đúng assignment được giao.
2. Thực hiện audit theo checklist đã publish.
3. Lưu nháp trong lúc kiểm tra.
4. Ghi nhận lỗi thực tế, ghi chú và bằng chứng.
5. Submit bài audit để backend tự tính điểm, tự tính lỗi lặp và khóa kết quả.

Hiện tại backend mới có phần nền cho QC:

- Có `GET /api/audit-plans/my-assignments`.
- Có `AuditAssignment`, `Audit`, `Violation`, `Evidence`, `GroupScore`.
- Có business rule đã chốt cho CCP, RISK và repeat violation.

Nhưng backend **chưa có audit execution thật sự**:

- Chưa có route lưu nháp audit.
- Chưa có route submit audit.
- Chưa có scoring engine trong source rebuild hiện tại.
- Chưa có repeat calculation service.
- Chưa có upload evidence route trong source hiện tại.

Vì vậy task kế tiếp hợp lý nhất là **QC Audit Execution Core**.

## Vai Trò Và Ranh Giới Của QC

| Chủ đề | Quy tắc nghiệp vụ |
|---|---|
| Phạm vi dữ liệu | QC chỉ thấy assignment của chính mình. |
| Nguồn vào | QC chỉ mở audit từ assignment hợp lệ đã được QAM publish. |
| Checklist | QC dùng checklist snapshot/version đã gắn với assignment, không tự chọn checklist khác. |
| Draft | QC được lưu nháp trước submit. |
| Sau submit | QC không được sửa bài đã submit. |
| Repeat count | QC không nhập, không chọn, không sửa. Backend tự tính. |
| Điểm số | QC không tự nhập điểm cuối và không được xem điểm preview trước submit. Backend tự tính từ violation sau khi QC gửi bài. |
| Ảnh bằng chứng | QC đính kèm ảnh bằng chứng cho lỗi nếu có. |
| Action Plan | QC không xử lý AP; submit audit có lỗi thì backend tự tạo AP `draft` cho SM xử lý sau. |

## Luồng Nghiệp Vụ QC Đề Xuất

```txt
QAM publish audit plan
        ->
QC thấy assignment của mình
        ->
QC mở assignment trong audit window hợp lệ
        ->
QC lưu nháp nhiều lần
        ->
QC submit audit
        ->
Backend tính repeat + scoring
        ->
Assignment completed, audit bị khóa
        ->
Nếu có lỗi thì backend tạo Action Plan draft
```

## Điều Kiện Để QC Được Thực Hiện Audit

Một assignment chỉ được mở hoặc submit khi đồng thời thỏa:

1. Assignment thuộc đúng `auditorId` hiện tại.
2. Plan đang ở trạng thái `open`.
3. Thời điểm hiện tại nằm trong `startDate <= now <= endDate`.
4. Assignment chưa `completed`.
5. Checklist gắn với plan vẫn còn dữ liệu đọc được để hiển thị đúng snapshot/version.

Nếu ngoài thời hạn audit, QC có thể vẫn nhìn thấy assignment nhưng nút thao tác phải bị khóa.

## Trạng Thái Nghiệp Vụ Cần Dùng

### Assignment

```txt
pending -> in_progress -> completed
```

| Status | Ý nghĩa |
|---|---|
| `pending` | QC chưa bắt đầu làm. |
| `in_progress` | Đã có draft audit hoặc QC đã bắt đầu nhập liệu. |
| `completed` | QC đã submit audit. |

### Audit

Audit hiện chưa có cột `status`, nên nên dùng:

| Điều kiện | Ý nghĩa |
|---|---|
| `submittedAt = null` | Draft |
| `submittedAt != null` | Submitted |

Đây là cách đủ gọn cho portfolio hiện tại và khớp với schema đã có.

## Dữ Liệu QC Được Phép Gửi

QC chỉ nên gửi dữ liệu thực tế mình quan sát được:

```ts
type AuditDraftInput = {
  assignmentId: string
  violations: Array<{
    criteriaId: string
    numErrors: number
    note?: string | null
    imageUrls?: string[]
  }>
}
```

Không nhận từ FE:

- `repeatCount`
- `repeatLabel`
- `isCriticalTriggered`
- `isRiskTriggered`
- `finalScore`
- `grade`
- `groupScores`
- `previewScore`

Những field này là **nguồn sự thật của backend**.

## Những Gì Backend Phải Tự Tính

### Repeat Violation

Scope đã chốt:

- cùng `storeId`
- cùng `criteriaId`
- chỉ tính audit đã submit
- chỉ tính violation có `numErrors > 0`

Chu kỳ:

| Lần | Kết quả |
|---:|---|
| 1 | `x1` |
| 2 | `x2` |
| 3 | `x3` |
| 4 | auto CCP |
| 5 | reset về `x1` |

Công thức nghiệp vụ:

```ts
const occurrence = (previousViolationCount % 5) + 1
```

Khi QC bấm vào một tiêu chí có lỗi, API cần trả cho UI:

```ts
type RepeatInfo = {
  criteriaId: string
  numErrors: number
  repeatCount: number
  repeatLabel: "first" | "second" | "third" | "auto_ccp" | "reset"
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
}
```

### Scoring

Scoring cần là một nguồn sự thật duy nhất:

- Deduction theo section/group weight.
- Criteria `critical` có lỗi thì group tương ứng về `0`.
- Criteria `risk` có lỗi thì toàn bài về `0`, grade `alarm`.
- Repeat lần 4 phải kích hoạt critical dù criteria gốc không phải `critical`.

## Dữ Liệu Cần Lưu Khi Submit

Khi QC submit, backend nên ghi trong một transaction:

1. `Audit`
   - `finalScore`
   - `grade`
   - `isRiskTriggered`
   - `submittedAt`
2. `GroupScore[]`
   - `weight`
   - `reachedScore`
   - `percentage`
   - `triggeredCritical`
3. `Violation[]`
   - `numErrors`
   - `repeatCount`
   - `isCriticalTriggered`
   - `isRiskTriggered`
   - `note`
4. `Evidence[]` / ảnh bằng chứng
5. `AuditAssignment`
   - `status = completed`
   - `auditId`
6. `ActionPlan`
   - tạo `draft` nếu có ít nhất một violation `numErrors > 0`

Mục tiêu là không có trạng thái nửa vời kiểu:

- audit đã submit nhưng assignment chưa completed
- violations đã lưu nhưng group score chưa có
- có lỗi nhưng chưa sinh AP

## API QC Cần Có

| Method | Path | Mục tiêu |
|---|---|---|
| `GET` | `/api/audit-plans/my-assignments` | QC xem danh sách việc của mình |
| `GET` | `/api/audits/:assignmentId` hoặc endpoint tương đương | Mở bài audit hiện tại / lấy draft đã có |
| `POST` hoặc `PATCH` | `/api/audits/draft` | Lưu nháp |
| `POST` | `/api/audits/submit` | Submit bài audit |
| `GET` | `/api/audits/assignments/:assignmentId/history` | Lấy bundle lịch sử lỗi cho toàn bộ tiêu chí của bài audit |
| `POST` | `/api/upload/images` | Upload ảnh bằng chứng |

### Response Quan Trọng Cho FE

#### Mở bài audit

FE cần:

- thông tin assignment
- store display fields
- checklist snapshot với sections/items
- draft hiện tại nếu đã có
- audit window còn mở hay không

#### Lưu nháp

Response nên trả:

- audit id
- assignment status mới nhất
- violations đã chuẩn hóa
- repeat info/history sau khi FE đã tải xong history bundle nền

#### Submit

Response tối thiểu:

```ts
type SubmitAuditResponse = {
  id: string
  finalScore: number
  grade: "excellent" | "good" | "pass" | "fail" | "alarm"
  isRiskTriggered: boolean
  repeatInfo: RepeatInfo[]
}
```

## Những Gì FE Cần Hiểu Khi Làm Màn QC

| Màn hình / hành vi | Cách hiểu đúng |
|---|---|
| Danh sách assignment | Chỉ lấy từ `/my-assignments`, không truyền `auditorId` từ FE |
| Nút bắt đầu audit | Chỉ bật khi `plan.status = open`, `isAuditWindowOpen = true`, assignment chưa completed |
| Lưu nháp | Có thể gọi nhiều lần trước submit |
| Repeat | Sau khi history bundle tải xong, FE hiển thị số lần lặp và lịch sử lỗi từ cache; không có control để QC chỉnh |
| Điểm cuối | Không cho QC nhập tay và không hiển thị điểm preview trước submit |
| Sau submit | Màn hình chuyển sang read-only |
| Ảnh bằng chứng | Gắn vào violation, có thumbnail/preview lớn và có thể xem lại ảnh lịch sử của tiêu chí |

## Phần Hiện Tại Đã Có Trong Source

| Hạng mục | Trạng thái |
|---|---|
| `GET /api/audit-plans/my-assignments` | Đã có |
| Audit window trên plan | Đã có |
| `AuditAssignment` schema | Đã có |
| `Audit`, `Violation`, `Evidence`, `GroupScore`, `ActionPlan` schema | Đã có |
| Rule repeat trong tài liệu | Đã chốt |
| Route draft/submit audit | Chưa có |
| Scoring engine trong source rebuild hiện tại | Chưa có |
| Upload ảnh bằng chứng trong source hiện tại | Chưa có |
| Test nghiệp vụ QC | Chưa có |

## Rủi Ro Và Edge Cases Cần Khóa Ngay Từ Đầu

| Tình huống | Hành vi mong muốn |
|---|---|
| QC khác cố mở assignment không thuộc mình | `403` |
| QC submit ngoài audit window | `400` |
| QC submit assignment đã completed | `400` |
| QC lưu draft rồi QAM xóa/đổi assignment | Cần chặn mutate từ phía QAM sau khi assignment đã `in_progress` hoặc có `auditId` |
| Hai lần submit gần như đồng thời | Chỉ một lần thành công |
| Draft audit có lỗi | Không được tính vào repeat history |
| Store khác cùng criteria | Không ảnh hưởng repeat |
| Criteria khác cùng store | Không ảnh hưởng repeat |
| Repeat lần 4 | Auto CCP |
| Repeat lần 5 | Reset về lần 1 |
| Violation `numErrors = 0` | Không được tạo AP, không tính repeat |
| Có RISK và CCP cùng lúc | Final score vẫn phải là `0`, grade `alarm` |
| Upload ảnh xong nhưng chưa gắn violation | Cần cleanup hoặc attach bắt buộc |
| SM thấy bài cần chỉnh sau submit | SM gửi yêu cầu; SM không sửa audit trực tiếp |
| QAM cập nhật bài sau submit | Phải đi qua luồng reopen chính thức, có lý do và audit trail |

## Các Khoảng Trống Kiến Trúc Cần Xử Lý

### 1. Chưa có service layer cho audit core

Audit draft, repeat calculation, scoring, submit transaction là phần dễ phình to. Nên tách sớm:

- `src/lib/audit-repeat.ts`
- `src/lib/audit-scoring.ts` hoặc khôi phục `src/lib/scoring.ts`
- `src/services/audit.service.ts` nếu route bắt đầu dày

### 2. Chưa có snapshot checklist thực thụ

Hiện audit đang tham chiếu `formId`. Nếu sau này checklist đã publish nhưng được archive hoặc đổi version, cần đảm bảo bài cũ vẫn đọc đúng cấu trúc tại thời điểm thực hiện.

Với phạm vi portfolio hiện tại có thể chấp nhận:

- chỉ cho audit dùng checklist `published`
- không sửa cấu trúc checklist đã publish

Nhưng nếu sau này cho clone/versioning sâu hơn, phải đánh giá snapshot rõ hơn.

### 3. QAM draft workflow còn vài race condition chưa xử lý

Phần QAM vừa làm vẫn còn rủi ro đồng thời:

- publish và autosave stale có thể đạp nhau
- publish validation chưa atomic
- concurrent delete có thể làm plan `open` về 0 assignment

Những điểm này không phải nghiệp vụ QC, nhưng ảnh hưởng trực tiếp đến tính an toàn khi QC bắt đầu làm thật.

### 4. Chưa có luồng chỉnh sửa sau submit

Nghiệp vụ đã chốt:

- QC submit xong thì không được tự sửa bài.
- Nếu SM thấy bài cần xem lại, SM phải gửi yêu cầu.
- QAM là người duy nhất được reopen và cập nhật lại audit sau submit.

Điều này kéo theo các nhu cầu backend sau:

- ghi lý do reopen/chỉnh sửa;
- lưu `editedAt`, `editNote`, người thao tác;
- tính lại score/repeat/group scores sau khi QAM cập nhật;
- giữ lịch sử để biết bài đã từng bị chỉnh sau submit.

Phần này liên quan cả QAM và SM, nên nên tách thành nhánh **Audit Review & Correction** sau khi QC core chạy ổn. Tuy vậy QC core ngay từ đầu không nên thiết kế theo kiểu “submit xong là bất biến tuyệt đối”.

### 5. Ảnh là một phần của nghiệp vụ

Ảnh bằng chứng không chỉ là file upload phụ:

- ảnh gắn theo từng violation;
- UI cần thumbnail và preview lớn;
- API lịch sử tiêu chí nên trả lại ảnh cũ liên quan;
- ảnh mới upload phải được attach vào violation, tránh file mồ côi;
- về sau AP của SM sẽ có ảnh khắc phục riêng, khác với ảnh lỗi ban đầu của QC.

### 6. Lịch sử tiêu chí nên tải theo bundle nền

Để giữ trải nghiệm bắt đầu audit nhanh nhưng không tạo hàng loạt request lẻ:

- API mở bài chỉ trả dữ liệu cơ bản để render checklist và draft.
- Ngay sau khi màn hình ổn định, FE gọi ngầm một API bundle để lấy lịch sử của toàn bộ criteria trong checklist.
- Backend tự suy ra danh sách criteria từ assignment, query theo tập một lần và trả map theo `criteriaId`.

Đây là hướng cân bằng hơn:

- mở bài vẫn nhanh;
- chỉ cần một request nền cho một người dùng;
- tránh tình trạng 100 criteria thành 100 request;
- FE dùng cache theo `criteriaId` rất sạch.

## Đề Xuất Task Kế Tiếp

Tên task nên là:

```txt
QC Audit Execution Core
```

Thứ tự nên làm:

1. Chốt audit open/resume contract.
2. Tạo draft flow và ownership guard.
3. Tạo repeat calculation service.
4. Khôi phục/viết lại scoring engine làm source of truth.
5. Thêm API history bundle theo assignment.
6. Tạo submit transaction + auto-create AP.
7. Thêm upload ảnh bằng chứng.
8. Viết test edge cases cho ownership, repeat, scoring, submit rollback và image attach.
9. Sau đó mới làm handoff FE cho màn QC.

## Khuyến Nghị Chốt Trước Khi Code

Tôi đề xuất chốt luôn các quyết định sau để task tới không bị rẽ ngang:

1. Một assignment chỉ có **một audit duy nhất**; draft và submitted dùng chung record.
2. Save draft đầu tiên sẽ chuyển assignment từ `pending -> in_progress`.
3. Không cho QC tự chọn repeat, tự nhập final score, tự đổi checklist.
4. Không làm autosave bắt buộc ở BE; BE chỉ cung cấp endpoint lưu draft, FE muốn auto hay nút tay đều dùng chung endpoint.
5. Submit xong bài là read-only với QC.
6. Không có điểm preview cho QC trước submit.
7. Nếu có violation thì tạo AP ngay trong transaction submit.
8. Sau khi history bundle tải xong, FE xem được repeat count và lịch sử lỗi của chính tiêu chí đó tại chính cửa hàng đó mà không cần gọi thêm request lẻ.
9. SM không sửa audit trực tiếp; SM chỉ gửi yêu cầu để QAM xem xét cập nhật bài.
10. API mở bài không trả full history; history được tải ngầm bằng một bundle API theo assignment.

## Câu Hỏi Còn Mở

| Câu hỏi | Tác động |
|---|---|
| Ảnh bằng chứng có bắt buộc với mọi lỗi hay chỉ một số loại? | Ảnh hưởng validation submit |
| Một criteria trong cùng audit có thể được ghi nhiều dòng violation hay chỉ một dòng có `numErrors`? | Ảnh hưởng UI form và cách lưu |
| QAM reopen sẽ sửa toàn bài hay chỉ sửa các violation bị yêu cầu xem lại? | Ảnh hưởng thiết kế luồng hậu kiểm |
| Yêu cầu chỉnh bài từ SM cần là comment đơn giản hay một entity có trạng thái riêng? | Ảnh hưởng module SM/QAM sau này |

## Kết Luận

QC là bước kế tiếp đúng nhất sau QAM vì nó nối trực tiếp vào phần đã có:

- QAM tạo checklist.
- QAM tạo assignment.
- QC là người biến assignment thành audit result thật.

Nếu role QC được làm đúng ngay từ đầu, ta sẽ mở khóa luôn ba phần phía sau:

1. scoring thực tế,
2. action plan tự sinh,
3. dashboard/report có dữ liệu thật.

Ngược lại, nếu QC bị làm vội, toàn bộ dữ liệu phía sau sẽ bẩn từ gốc. Đây là chỗ nên đi chậm một nhịp nhưng làm cho đúng.
