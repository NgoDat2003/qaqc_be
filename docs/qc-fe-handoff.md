# QC FE Handoff

Trang thai: backend da mo loi thuc thi audit cho role `qc_auditor` tren nhanh `dev`.

## Nguyen Tac Can Giu

- QC khong truyen `auditorId`; backend lay tu session hien tai.
- QC khong xem diem preview truoc submit.
- QC khong tu nhap `repeatCount`, `grade`, `finalScore`.
- Anh bang chung gan vao tung loi.
- Submit xong bai chuyen read-only voi QC.
- History cua tieu chi khong nam trong API mo bai; FE tai nen mot bundle rieng sau khi man hinh da render.

## Luong FE De Xuat

```txt
GET /api/audit-plans/my-assignments
        ->
GET /api/audits/assignments/:assignmentId
        ->
render man audit ngay
        ->
GET /api/audits/assignments/:assignmentId/history
        ->
cache historiesByCriteriaId
        ->
PATCH /api/audits/draft
        ->
POST /api/audits/submit
```

## 1. Mo Bai Audit

### `GET /api/audits/assignments/:assignmentId`

Chi role `qc_auditor`.

Response chinh:

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
    violations: Array<{
      id: string
      criteriaId: string
      numErrors: number
      repeatCount: number
      isCriticalTriggered: boolean
      isRiskTriggered: boolean
      note: string | null
      images: Array<{
        id: string
        url: string
        fileName: string | null
        mimeType: string | null
      }>
    }>
  } | null
}
```

FE dung:

- `assignment.plan.isAuditWindowOpen` de bat/tat thao tac;
- `assignment.status` de xac dinh draft hay read-only;
- `audit.violations` de restore draft dang lam.

## 2. History Bundle Nen

### `GET /api/audits/assignments/:assignmentId/history`

FE nen goi ngam ngay sau khi man audit render xong.

```ts
type AuditHistoryBundleResponse = {
  assignmentId: string
  store: { id: string; code: string; name: string }
  historiesByCriteriaId: Record<string, {
    criteriaId: string
    // 0 = loi moi, 1/2/3 = so lan lap trong chu ky hien tai
    repeatCount: number
    repeatLabel: "first" | "second" | "third" | "auto_ccp" | "reset"
    isCriticalTriggered: boolean
    history: Array<{
      auditId: string
      submittedAt: string
      numErrors: number
      repeatCount: number
      note: string | null
      images: Array<{ id: string; url: string }>
    }>
  }>
}
```

Khi user bam vao mot tieu chi, FE doc tu `historiesByCriteriaId[criteriaId]`.

Quy uoc hien tai:

| repeatCount | repeatLabel | UI goi y |
|---:|---|---|
| `0` | `first` | Loi moi |
| `1` | `second` | Lap lan 1 |
| `2` | `third` | Lap lan 2 |
| `3` | `auto_ccp` | Lap lan 3 - tu dong CCP |
| `0` | `reset` | Chu ky moi sau auto CCP |

## 3. Luu Nhap

### `PATCH /api/audits/draft`

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

Rule quan trong:

- draft dau tien se chuyen assignment tu `pending -> in_progress`;
- chi assignment cua chinh QC hien tai moi luu duoc;
- ngoai audit window se bi chan;
- draft khong anh huong repeat history;
- neu request cu bi stale, BE tra `409` voi message `Audit assignment changed while the request was in progress`.

## 4. Upload Anh Bang Chung

### `POST /api/upload/images`

Form data:

```txt
file=<image>
```

Ho tro:

- JPEG
- PNG
- WEBP

Gioi han:

- toi da `5MB`

Response:

```ts
type UploadedImage = {
  id: string
  url: string
  fileName: string | null
  mimeType: string | null
}
```

Sau upload, FE dua `id` vao `imageIds` cua loi tuong ung khi luu draft hoac submit.

Luu y:

- BE khong tin extension ten file tu client;
- BE tu sinh extension an toan tu MIME hop le;
- BE kiem tra noi dung file that truoc khi luu;
- file gia dinh dang anh se bi tra `400` voi message `Image content does not match the declared file type`.

## 5. Submit Audit

### `POST /api/audits/submit`

Body giong `draft`.

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
    // 0 = loi moi, 1/2/3 = so lan lap trong chu ky hien tai
    repeatCount: number
    repeatLabel: "first" | "second" | "third" | "auto_ccp" | "reset"
    isCriticalTriggered: boolean
  }>
}
```

Sau submit:

- assignment thanh `completed`;
- man QC chuyen read-only;
- neu co loi, backend tu tao Action Plan `draft`;
- neu request cu bi stale, BE tra `409` va FE nen refetch session.

## Loi FE Nen Bat Rieng

| Message BE | Y nghia |
|---|---|
| `Assignment does not belong to current auditor` | QC dang mo viec khong phai cua minh |
| `Audit is outside the allowed audit window` | Het han hoac chua toi ngay kiem tra |
| `Completed assignment cannot be changed` | Bai da submit |
| `Submitted audit cannot be changed by QC` | QC khong duoc sua bai sau submit |
| `All criteria must belong to the assigned checklist` | FE gui sai criteria |
| `Some images are already attached elsewhere` | Anh khong thuoc bai dang thao tac |
| `Audit assignment changed while the request was in progress` | Request stale, FE nen refetch session |
| `Image content does not match the declared file type` | File upload khong phai anh that |

## Ghi Chu Cho Buoc Sau

- Luong `SM gui yeu cau -> QAM reopen/update audit` chua nam trong task nay.
- Khi toi buoc do, FE QC van giu read-only; man chinh sua se thuoc QAM.
- Tai lieu tong hop hien tai: `docs/qc-backend-current-state.md`.
