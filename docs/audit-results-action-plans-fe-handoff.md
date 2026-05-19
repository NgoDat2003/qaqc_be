# Audit Results + Action Plans FE Handoff

Trang thai: backend da bo sung luong ket qua audit, yeu cau sua bai cham, action plan theo tung loi va notification toi thieu.

Tai lieu nay danh cho FE implement man:

- Audit Results list/detail.
- SM yeu cau QAM xem lai bai cham.
- QAM review request va cap nhat lai audit result.
- Action Plan list/detail/update/submit/reject/close.
- Notification bell co ban.

## Tom Tat Cho FE

| Man hinh | API chinh | Role dung | Ghi chu UI |
| --- | --- | --- | --- |
| Audit results table | `GET /api/audits` | QAM, QC, SM, AM, Executive | QC/SM/AM da duoc BE scope theo user |
| Audit result detail | `GET /api/audits/:id` | QAM, QC, SM, AM, Executive | Hien diem, group score, violations, anh loi |
| SM request sua diem | `POST /api/audits/:id/correction-requests` | SM | Chi khi audit chua co AP |
| QAM review request | `POST /api/audit-correction-requests/:id/approve|reject` | QAM | Reject bat buoc co ly do |
| QAM sua audit result | `PATCH /api/audits/:id/correction` | QAM | BE tinh lai score, FE khong gui diem |
| Tao AP | `POST /api/audits/:id/action-plan` | QAM hoac SM | Chi tao sau khi audit result da dung |
| AP table | `GET /api/action-plans` | QAM, SM, AM, Executive | Filter duoc theo status |
| AP detail | `GET /api/action-plans/:id` | QAM, SM, AM, Executive | Moi violation la mot item |
| SM update AP | `PATCH /api/action-plans/:id` | SM | Chi `draft`/`rejected` |
| SM submit AP | `POST /api/action-plans/:id/submit` | SM | Bat buoc du thong tin moi item |
| QAM reject/close AP | `POST /api/action-plans/:id/reject|close` | QAM | Chi AP `submitted` |
| Notification bell | `GET /api/notifications`, `GET /api/notifications/unread-count` | User dang login | Khong realtime trong task nay |

## Nguyen Tac Nghiep Vu

- QC submit bai audit xong chi tao audit result, khong tu tao Action Plan.
- SM neu thay bai cham co van de thi tao correction request de QAM xem xet.
- QAM approve/reject correction request.
- Chi sau khi request duoc approve, QAM moi duoc cap nhat violation/note/images. Backend tu tinh lai diem, FE khong gui diem.
- Neu audit da co Action Plan thi khong cho sua bai cham nua.
- Action Plan duoc tao rieng tu audit result co loi.
- Moi violation thanh mot dong Action Plan.
- Moi dong AP co: nguyen nhan, huong khac phuc, ngay thuc te sua xong, ten nguoi thuc hien, anh minh chung.
- Loi `critical`, `risk`, hoac repeat auto CCP bat buoc co anh minh chung truoc khi SM submit AP.
- QAM la nguoi reject/close AP.

## State Va Nut UI

### Audit Result

| Dieu kien | FE nen hien |
| --- | --- |
| `actionPlan == null` va SM thay sai bai cham | Nut "Yeu cau QA xem lai" cho SM |
| Co `pendingCorrectionRequest` | Badge "Dang cho QA review", disable tao AP |
| Correction request `approved` | QAM co the hien form sua violation |
| `actionPlan != null` | Disable moi nut sua audit/correction |
| Audit khong co violation | Khong hien nut tao AP |

### Action Plan

| Status | SM | QAM | AM/Executive |
| --- | --- | --- | --- |
| `draft` | Sua item, upload anh, submit | Xem | Xem |
| `submitted` | Xem | Reject hoac close | Xem |
| `rejected` | Sua lai item, submit lai | Xem | Xem |
| `closed` | Xem readonly | Xem readonly | Xem readonly |

## API Envelope

Moi response di theo format chung:

```ts
type ApiSuccess<T> = {
  success: true
  data: T
  message?: string
  meta?: unknown
}

type ApiError = {
  success: false
  error: {
    statusCode: number
    message: string
    code?: string
    details?: unknown
  }
}
```

FE nen doc `error.message` de toast loi.

## Audit Result APIs

### `GET /api/audits`

Role:

- `qa_manager`: xem tat ca.
- `qc_auditor`: chi xem bai minh cham.
- `store_manager`, `am`: chi xem store trong scope.
- `executive_viewer`: read-only tat ca.

Response la array, khong pagination trong scope admin/QAM hien tai:

```ts
type AuditResultListItem = {
  id: string
  finalScore: number
  grade: "excellent" | "good" | "pass" | "fail" | "alarm"
  isRiskTriggered: boolean
  submittedAt: string
  editedAt: string | null
  store: { id: string; code: string; name: string }
  auditor: { id: string; fullName: string | null; email: string | null }
  checklist: { id: string; name: string; version: string; status: string }
  actionPlan: { id: string; status: string } | null
  pendingCorrectionRequest: unknown | null
}
```

### `GET /api/audits/:id`

Dung de mo detail ket qua audit.

Response chinh:

```ts
type AuditResultDetail = {
  id: string
  finalScore: number
  grade: string
  isRiskTriggered: boolean
  submittedAt: string
  editedAt: string | null
  editNote: string | null
  store: { id: string; code: string; name: string }
  auditor: { id: string; fullName: string | null; email: string | null }
  checklist: { id: string; name: string; version: string; status: string }
  groupScores: Array<{
    groupId: string
    groupCode: string
    weight: number
    maxScore: number
    reachedScore: number
    percentage: number
    triggeredCritical: boolean
  }>
  violations: Array<{
    id: string
    criteria: {
      id: string
      code: string
      content: string
      flag: "none" | "critical" | "risk"
      group: { id: string; code: string; name: string } | null
    }
    numErrors: number
    repeatCount: number
    isCriticalTriggered: boolean
    isRiskTriggered: boolean
    note: string | null
    images: ImageDto[]
  }>
  actionPlan: { id: string; status: string } | null
  correctionRequests: CorrectionRequestDto[]
  scoreBreakdown: AuditScoreBreakdown
}
```

### Audit Score Breakdown

`scoreBreakdown` dung de FE render bang diem chi tiet ma khong can tu join/tinh lai scoring.

```ts
type AuditScoreBreakdown = {
  groups: Array<{
    groupId: string
    groupCode: string
    groupName: string
    criteriaCount: number
    checkedCount: number
    uncheckedCount: number
    isComplete: boolean
    maxScore: number
    deductedScore: number
    reachedScore: number
    weight: number
    weightedScore: number
    percentage: number
    violationCount: number
    ccpCount: number
    triggeredCritical: boolean
    deductions: AuditDeductionLine[]
  }>
  risk: {
    triggered: boolean
    count: number
    items: AuditDeductionLine[]
  }
  totals: {
    criteriaCount: number
    checkedCount: number
    uncheckedCount: number
    violationCount: number
    ccpCount: number
    riskCount: number
    maxScore: number
    deductedScore: number
    weightedScore: number
    finalScore: number
    grade: "excellent" | "good" | "pass" | "fail" | "alarm"
    isComplete: boolean
  }
  warnings: string[]
}

type AuditDeductionLine = {
  violationId: string
  criteriaId: string
  criteriaCode: string
  criteriaContent: string
  groupId: string | null
  groupCode: string | null
  flag: "none" | "critical" | "risk"
  numErrors: number
  repeatCount: number
  repeatLabel: "first" | "second" | "third" | "auto_ccp" | "reset"
  multiplier: number
  deductionPerError: number
  maxDeduction: number
  rawDeduction: number
  deductedScore: number
  effect:
    | "normal_deduction"
    | "critical_group_zero"
    | "repeat_auto_ccp_group_zero"
    | "risk_audit_zero"
    | "no_deduction"
  note: string | null
  images: ImageDto[]
}
```

Map bang diem FE:

| Cot UI | Field |
| --- | --- |
| Tieu chi | `scoreBreakdown.groups[].groupCode` |
| So cau | `criteriaCount` |
| So cau da cham | `checkedCount` |
| Diem chuan | `maxScore` |
| Diem bi tru | `deductedScore` |
| CCP | `ccpCount` hoac `triggeredCritical` |
| Diem dat | `reachedScore` |
| Ty trong | `weight` |
| Result | `scoreBreakdown.totals.finalScore` |

De hien chi tiet tung dong bi tru, FE dung `groups[].deductions[]`.

Cong thuc diem hien tai da khop Excel:

- `maxScore` cua group = tong `maxDeduction` cua cac criteria thuong trong group.
- Vi du checklist demo import tu Excel: `C=121`, `H=31`, `P=60`, `E=110`.
- `weightedScore = (reachedScore / maxScore) * weight`.
- `finalScore = sum(weightedScore)`; neu co RISK thi `finalScore = 0`, `grade = "alarm"`.

Y nghia `effect`:

| Effect | UI goi y |
| --- | --- |
| `normal_deduction` | Hien cong thuc `numErrors * deductionPerError * multiplier`, cap boi `maxDeduction` |
| `critical_group_zero` | Badge CCP, group ve 0 |
| `repeat_auto_ccp_group_zero` | Badge loi lap auto CCP, group ve 0 |
| `risk_audit_zero` | Badge Risk, audit result ve 0 |
| `no_deduction` | Khong tru diem |

RISK duoc tra rieng tai `scoreBreakdown.risk.items[]`; khong map vao group C/H/P/E.

## Correction Request APIs

### `POST /api/audits/:id/correction-requests`

Role: `store_manager`.

Chi tao duoc khi:

- audit da submitted;
- audit co violation;
- audit chua co Action Plan;
- audit chua co pending correction request.

Payload:

```json
{
  "reason": "Ly do SM yeu cau QA xem lai bai cham"
}
```

Loi thuong gap:

| Status | Message | FE action |
| --- | --- | --- |
| 400 | `Audit already has an action plan and cannot be corrected` | An nut request sua audit |
| 400 | `Audit already has a pending correction request` | Hien badge dang cho duyet |
| 403 | `Permission denied` | User khong quan ly store nay |

### `GET /api/audits/:id/correction-requests`

Role: audit read roles.

Tra danh sach correction request cua audit.

```ts
type CorrectionRequestDto = {
  id: string
  auditId: string
  storeId: string
  reason: string
  status: "pending" | "approved" | "rejected"
  reviewNote: string | null
  reviewedAt: string | null
  createdAt: string
  requestedBy: { id: string; fullName: string; email: string } | null
  reviewedBy: { id: string; fullName: string; email: string } | null
}
```

### `POST /api/audit-correction-requests/:id/approve`

Role: `qa_manager`.

Payload optional:

```json
{
  "reviewNote": "Dong y cap nhat lai bai cham"
}
```

### `POST /api/audit-correction-requests/:id/reject`

Role: `qa_manager`.

Payload:

```json
{
  "reviewNote": "Ly do tu choi"
}
```

### `PATCH /api/audits/:id/correction`

Role: `qa_manager`.

Chi dung sau khi correction request da duoc approve va audit chua co AP.

Payload:

```ts
type AuditCorrectionPayload = {
  editNote: string
  violations: Array<{
    criteriaId: string
    numErrors: number
    note?: string | null
    imageIds?: string[]
  }>
}
```

Backend se:

- validate criteria thuoc checklist;
- tinh lai repeat;
- tinh lai score/grade/risk;
- thay the violations/groupScores cu;
- tra audit summary + repeatInfo.

Response:

```ts
type AuditCorrectionResponse = {
  id: string
  finalScore: number
  grade: "excellent" | "good" | "pass" | "fail" | "alarm"
  isRiskTriggered: boolean
  editedAt: string
  editNote: string
  repeatInfo: Array<{
    criteriaId: string
    numErrors: number
    repeatCount: number
    repeatLabel: "first" | "second" | "third" | "auto_ccp" | "reset"
    isCriticalTriggered: boolean
  }>
}
```

FE luu y: sau khi PATCH thanh cong nen refetch `GET /api/audits/:id` de lay full groupScores/violations moi.

## Action Plan APIs

### `POST /api/audits/:id/action-plan`

Role: `qa_manager` hoac `store_manager` trong store scope.

Tao AP tu audit result co violation. Backend tao item theo tung violation.

Khong tao duoc neu:

- audit chua submitted;
- audit khong co violation;
- audit da co AP;
- audit dang co pending correction request;
- audit co approved correction request nhung QAM chua apply correction.

Response la `ActionPlanDetail`, FE co the dieu huong thang sang detail AP.

### `GET /api/action-plans`

Role:

- `qa_manager`: tat ca.
- `store_manager`, `am`: trong store scope.
- `executive_viewer`: read-only tat ca.

Query optional:

```txt
?status=draft|submitted|rejected|closed
```

### `GET /api/action-plans/:id`

Tra detail AP full cac loi va thong tin khac phuc.

```ts
type ActionPlanDetail = {
  id: string
  status: "draft" | "submitted" | "rejected" | "closed"
  reviewNote: string | null
  reviewedAt: string | null
  closedAt: string | null
  store: { id: string; code: string; name: string }
  audit: {
    id: string
    finalScore: number
    grade: string
    submittedAt: string
    auditor: { id: string; fullName: string | null; email: string | null }
    checklist: { id: string; name: string; version: string; status: string }
  }
  items: Array<{
    id: string
    rootCause: string | null
    remediation: string | null
    fixedAt: string | null
    assigneeName: string | null
    status: string
    violation: {
      id: string
      criteria: CriteriaDto
      numErrors: number
      repeatCount: number
      isCriticalTriggered: boolean
      isRiskTriggered: boolean
      note: string | null
      images: ImageDto[]
    }
    remediationImages: ImageDto[]
  }>
}
```

### `PATCH /api/action-plans/:id`

Role: `store_manager` dung store scope.

Chi update khi status la `draft` hoac `rejected`.

Payload:

```ts
type ActionPlanUpdatePayload = {
  items: Array<{
    itemId: string
    rootCause?: string | null
    remediation?: string | null
    fixedAt?: string | null
    assigneeName?: string | null
    imageIds?: string[]
  }>
}
```

Vi du:

```json
{
  "items": [
    {
      "itemId": "ap-item-1",
      "rootCause": "Nhan vien chua thuc hien dung quy trinh",
      "remediation": "Da training lai va kiem tra lai khu vuc",
      "fixedAt": "2026-05-19T10:00:00.000Z",
      "assigneeName": "Nguyen Van A",
      "imageIds": ["img-1", "img-2"]
    }
  ]
}
```

FE nen cho upload anh truoc, lay `imageIds`, roi PATCH AP sau.

### `POST /api/action-plans/:id/submit`

Role: `store_manager`.

Submit tu `draft` hoac `rejected` sang `submitted`.

Bat buoc moi item co:

- `rootCause`
- `remediation`
- `fixedAt`
- `assigneeName`

Neu item la critical/risk/auto CCP thi bat buoc co `remediationImages`.

Loi thuong gap:

| Status | Message | FE action |
| --- | --- | --- |
| 400 | `All action plan items must have rootCause, remediation, fixedAt and assigneeName` | Highlight item thieu field |
| 400 | `Critical/risk action plan items require evidence images` | Bat buoc upload anh cho item critical/risk/auto CCP |
| 400 | `Only draft or rejected action plan can be submitted` | Disable nut submit khi AP da submitted/closed |

### `POST /api/action-plans/:id/reject`

Role: `qa_manager`.

Chi reject AP `submitted`.

Payload:

```json
{
  "reviewNote": "Can bo sung anh minh chung"
}
```

### `POST /api/action-plans/:id/close`

Role: `qa_manager`.

Chi close AP `submitted`.

## Upload Image

### `POST /api/upload/images`

Role duoc upload:

- `qc_auditor`
- `store_manager`
- `qa_manager`

Tra:

```ts
type ImageDto = {
  id: string
  url: string
  fileName: string | null
  mimeType: string | null
}
```

FE dung `imageIds` de gan anh vao violation hoac AP item.

## Notification APIs

### `GET /api/notifications`

Query optional:

```txt
?unreadOnly=true&limit=50
```

Response item:

```ts
type NotificationDto = {
  id: string
  title: string
  message: string
  type: "info" | "warning" | "alarm"
  isRead: boolean
  link: string | null
  createdAt: string
}
```

### `GET /api/notifications/unread-count`

Tra:

```json
{ "count": 3 }
```

### `PATCH /api/notifications/:id/read`

Mark mot notification la read.

### `PATCH /api/notifications/read-all`

Mark tat ca notification cua user hien tai la read.

## FE Flow De Xuat

```txt
Audit Result Detail
  -> Neu SM thay sai: POST correction request
  -> QAM approve/reject
  -> Neu approve: QAM PATCH audit correction
  -> Khi audit dung va can khac phuc: POST action-plan
  -> SM PATCH action-plan items
  -> SM submit AP
  -> QAM reject hoac close
```

## Flow Theo Man Hinh

### Man Audit Results List

1. Goi `GET /api/audits`.
2. Render cot:
   - Store code/name.
   - Auditor fullName.
   - Checklist name/version.
   - Score/grade.
   - Submitted date.
   - AP status neu co.
   - Pending correction badge neu co.
3. Click row -> `GET /api/audits/:id`.

### Man Audit Result Detail

1. Goi `GET /api/audits/:id`.
2. Render:
   - Thong tin store/auditor/checklist.
   - Diem tong + grade.
   - Group score breakdown.
   - List violations, note, anh loi QC.
   - Correction history.
3. Neu SM can QA sua diem:
   - hien form reason;
   - submit `POST /api/audits/:id/correction-requests`.
4. Neu QAM approve request:
   - hien form edit violations;
   - upload anh neu can;
   - submit `PATCH /api/audits/:id/correction`.
5. Neu ket qua da dung va co loi can xu ly:
   - tao AP bang `POST /api/audits/:id/action-plan`.

### Man Action Plan Detail

1. Goi `GET /api/action-plans/:id`.
2. Render tung `items[]`:
   - Loi goc: criteria, numErrors, repeatCount, note, anh loi QC.
   - Phan SM nhap: rootCause, remediation, fixedAt, assigneeName, remediationImages.
3. SM update bang `PATCH /api/action-plans/:id`.
4. SM submit bang `POST /api/action-plans/:id/submit`.
5. QAM reject bang `POST /api/action-plans/:id/reject`.
6. QAM close bang `POST /api/action-plans/:id/close`.

## Diem Can Luu Y Cho FE

- Khong hien nut sua audit neu `actionPlan != null`.
- Khong hien nut tao AP neu co `pendingCorrectionRequest`.
- Khong cho SM submit AP khi con item thieu `rootCause/remediation/fixedAt/assigneeName`.
- Upload anh truoc, lay `image.id`, sau do attach bang `imageIds`.
- `fixedAt` la ngay thuc te sua xong, khong phai deadline.
- `assigneeName` la text nguoi thuc hien, khong phai user trong he thong.
- Khong gui `finalScore`, `grade`, `repeatCount` tu FE khi QAM sua audit. BE tu tinh.
- Khong gui `deadline` cho AP item; task nay dung `fixedAt`.
- Cac list API trong module nay tra full array theo scope hien tai, khong tra pagination meta.

## Known Backend Notes

- `npx.cmd prisma generate` can chay thanh cong sau khi tat dev server/node dang khoa Prisma DLL tren Windows.
- Neu FE gap 403 khi SM/AM mo `GET /api/action-plans/:id`, day la bug scope helper da duoc code-review phat hien: AP detail can expose `storeId` hoac helper doc `store.id`.
- Khi update AP item, FE khong nen gui trung mot `imageId` cho nhieu item. Backend nen chan duplicate trong fix sau; tam thoi FE can dam bao moi anh chi gan vao mot item.
