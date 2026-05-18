# QAM FE Handoff

Trang thai: da implement backend foundation cho role `qa_manager` tren nhanh `dev`.

Tai lieu nay chi mo ta nhung API FE can de lam man hinh QAM cau hinh criteria, checklist va audit plan. Phan QC audit execution, scoring submit, repeat violation va action plan chua nam trong dot nay.

## FE Can Lam Gi Sau Dot Nay

| Man hinh | API chinh | Ghi chu |
|---|---|---|
| Quan ly nhom tieu chi | `GET/POST/PATCH /api/criteria-groups` | Group chi la CHEP, khong co trong so co dinh |
| Quan ly tieu chi | `GET/POST/PATCH /api/criteria` | Tieu chi bat buoc nam trong group; `risk` van la loi toan bai |
| Checklist builder | `/api/checklists...` | Trong so nam tren tung section, tong section weight phai bang `100` moi publish |
| Danh sach ke hoach audit | `GET /api/audit-plans` | Tra full plan kem assignments/progress |
| Tao/chinh sua ke hoach audit | `POST/PATCH /api/audit-plans` | Tao moi luon la `draft`; luu nhap dung `PATCH` |
| Giao viec cho QC | `POST /api/audit-plans/:id/publish` | Chi publish xong QC moi thay assignment |
| Dieu chinh plan dang chay | assignment `PATCH/DELETE` | Chi assignment `pending` moi duoc doi QC/xoa |

## Thay Doi FE Bat Buoc Sau Dot Nay

1. Khong coi `POST /api/audit-plans` la da giao viec nua. Tao xong chi la `draft`.
2. Them nut `Luu nhap` goi `PATCH /api/audit-plans/:id`.
3. Them nut `Publish/Giao viec` goi `POST /api/audit-plans/:id/publish`.
4. Audit plan dung `startDate/endDate` o cap plan, khong dung `scheduledDate` tren tung assignment nua.
5. Moi assignment la mot cap rieng `storeId + auditorId`; khong gui `stores[] + auditorId`.
6. QC list chi thay plan `open`; plan `draft` se khong hien o `/api/audit-plans/my-assignments`.
7. Sau moi mutation checklist/audit plan, co the dung ngay entity backend tra ve de cap nhat state, khong can tu ghep lai relation name tren FE.

## Nguyen tac chung

- Tat ca response thanh cong theo envelope:

```json
{
  "success": true,
  "data": {}
}
```

- Tao moi tra HTTP `201`.
- Loi tra:

```json
{
  "success": false,
  "error": {
    "statusCode": 400,
    "message": "..."
  }
}
```

- Route QAM can role `qa_manager` hoac `company_admin`, tru `/api/audit-plans/my-assignments` chi cho `qc_auditor`.
- API list QAM dot nay tra full array, khong pagination, de FE tu sort/filter local.
- Khi FE lam autosave cho audit plan, nen debounce va tranh bam publish trong luc request save dang pending.

## Criteria Groups

### `GET /api/criteria-groups`

Tra danh sach group. Group khong expose weight vi trong so nam theo checklist section.

```ts
type CriteriaGroup = {
  id: string
  code: string
  name: string
  color: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}
```

### `POST /api/criteria-groups`

```ts
type Body = {
  code: string
  name: string
  color?: string | null
  isActive?: boolean
}
```

### `PATCH /api/criteria-groups/:id`

```ts
type Body = {
  name?: string
  color?: string | null
  isActive?: boolean
}
```

## Criteria

### `GET /api/criteria`

Query optional:

- `groupId`
- `isActive=true|false`

```ts
type CriteriaItem = {
  id: string
  code: string
  content: string
  groupId: string
  group: { id: string; code: string; name: string }
  deductionPerError: number
  maxDeduction: number
  flag: "none" | "critical" | "risk"
  isActive: boolean
  createdAt: string
  updatedAt: string
}
```

### `POST /api/criteria`

```ts
type Body = {
  code: string
  content: string
  groupId: string
  deductionPerError: number
  maxDeduction: number
  flag?: "none" | "critical" | "risk"
  isActive?: boolean
}
```

### `PATCH /api/criteria/:id`

```ts
type Body = {
  content?: string
  groupId?: string
  deductionPerError?: number
  maxDeduction?: number
  flag?: "none" | "critical" | "risk"
  isActive?: boolean
}
```

## Checklists

### `GET /api/checklists`

Query optional:

- `status=draft|published|archived`

List item:

```ts
type ChecklistListItem = {
  id: string
  name: string
  version: string
  status: "draft" | "published" | "archived"
  publishedAt: string | null
  createdAt: string
  updatedAt: string
  _count: {
    sections: number
    auditPlans: number
  }
}
```

### `POST /api/checklists`

Tao checklist draft.

```ts
type Body = {
  name: string
  version: string
}
```

### `GET /api/checklists/:id`

Tra nested sections/items:

```ts
type ChecklistDetail = {
  id: string
  name: string
  version: string
  status: "draft" | "published" | "archived"
  publishedAt: string | null
  sections: Array<{
    id: string
    name: string
    order: number
    groupId: string
    weight: number
    group: { id: string; code: string; name: string }
    items: Array<{
      id: string
      order: number
      criteriaId: string
      criteria: CriteriaItem
    }>
  }>
}
```

### `PATCH /api/checklists/:id`

Chi sua khi checklist dang `draft`.

```ts
type Body = {
  name?: string
  version?: string
}
```

### `POST /api/checklists/:id/sections`

```ts
type Body = {
  name: string
  groupId: string
  weight: number
  order?: number
}
```

### `PATCH /api/checklists/:id/sections/:sectionId`

Chi sua khi checklist dang `draft`.

```ts
type Body = {
  name?: string
  groupId?: string
  weight?: number
  order?: number
}
```

### `DELETE /api/checklists/:id/sections/:sectionId`

Chi xoa khi checklist dang `draft`. Khi xoa section, cac criteria item trong section do cung bi xoa theo.

Response tra ve `ChecklistDetail` moi nhat de FE cap nhat state builder ngay.

### `POST /api/checklists/:id/sections/:sectionId/items`

Chi them criteria active va criteria phai thuoc cung group voi section.

```ts
type Body = {
  criteriaId: string
  order?: number
}
```

### `DELETE /api/checklists/:id/sections/:sectionId/items/:itemId`

Chi xoa khi checklist dang `draft`. Backend kiem tra `itemId` phai thuoc dung `sectionId` va `sectionId` phai thuoc dung checklist `id`.

Response tra ve `ChecklistDetail` moi nhat de FE cap nhat state builder ngay.

### `POST /api/checklists/:id/publish`

Publish chi thanh cong khi:

- checklist dang `draft`
- co it nhat 1 section
- moi section co it nhat 1 item
- tong `section.weight = 100`
- khong duplicate criteria trong cung checklist
- khong co criteria inactive

### `POST /api/checklists/:id/archive`

Chi archive checklist dang `published`. Checklist archived van xem duoc lich su, nhung khong duoc dung tao audit plan moi.

## Audit Plans

### Workflow FE nen hien thi

```txt
draft -> open -> closed
```

| Plan status | FE cho phep | FE nen khoa |
|---|---|---|
| `draft` | sua full, sua checklist, sua window, thay toan bo assignments, publish | QC chua thay assignment |
| `open` | sua `name/startDate/endDate`, doi QC pending, xoa assignment pending | khong doi checklist, khong replace full assignments |
| `closed` | chi xem | moi thao tac mutate |

### Rule hien thi assignment

| Assignment status | Co the doi QC? | Co the xoa store khoi plan? |
|---|---:|---:|
| `pending` va `auditId = null` | Co | Co |
| `in_progress` | Khong | Khong |
| `completed` | Khong | Khong |
| bat ky status nao nhung `auditId != null` | Khong | Khong |

### `GET /api/audit-plans`

Tra full plans kem assignments va progress.

```ts
type AuditPlan = {
  id: string
  name: string
  status: "draft" | "open" | "closed"
  startDate: string
  endDate: string
  formId: string
  form: { id: string; name: string; version: string; status: string }
  assignments: Array<{
    id: string
    status: "pending" | "in_progress" | "completed"
    auditId: string | null
    storeId: string
    auditorId: string
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

### `POST /api/audit-plans`

Tao audit plan o trang thai `draft`. Chua giao viec cho QC cho den khi goi endpoint publish.

Dung contract moi `startDate/endDate + assignments[]`. Khong dung `stores[] + auditorId`, va khong dung `scheduledDate` theo tung assignment nua.

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

Validation:

- checklist phai `published`
- `startDate` va `endDate` phai hop le
- `startDate <= endDate`
- `assignments` min 1
- khong duplicate `storeId`
- store phai active
- auditor phai active va co role `qc_auditor`
- moi item tao mot `AuditAssignment`

### `GET /api/audit-plans/:id`

Tra detail giong list item.

### `PATCH /api/audit-plans/:id`

Dung cho nut luu nhap hoac autosave cua QAM.

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

Rule:

- Plan `draft`: duoc sua full `name/formId/startDate/endDate/assignments`.
- Plan `open`: chi duoc sua `name/startDate/endDate`.
- Plan `closed`: khong duoc sua.
- Khi `draft` replace `assignments`, backend se thay toan bo assignment cu bang danh sach moi.
- Khi `open`, khong duoc doi checklist va khong duoc replace full assignments.

### `POST /api/audit-plans/:id/publish`

Chuyen plan tu `draft` sang `open` de giao viec cho QC.

Validation:

- plan dang `draft`
- checklist van `published`
- co it nhat 1 assignment
- store active
- auditor active va co role `qc_auditor`
- `startDate <= endDate`

### `PATCH /api/audit-plans/:id/assignments/:assignmentId`

Doi QC cho mot assignment chua tien hanh.

```ts
type Body = {
  auditorId: string
}
```

Rule:

- Chi QAM/company_admin.
- Plan khong duoc `closed`.
- Assignment phai thuoc plan.
- Assignment phai `pending`.
- Assignment chua co `auditId`.
- Auditor moi phai active va co role `qc_auditor`.

### `DELETE /api/audit-plans/:id/assignments/:assignmentId`

Xoa mot cua hang khoi audit plan.

Rule:

- Chi QAM/company_admin.
- Plan khong duoc `closed`.
- Assignment phai `pending`.
- Assignment chua co `auditId`.
- Neu plan dang `open`, khong duoc xoa assignment cuoi cung.
- Neu plan dang `draft`, co the xoa het assignment de tiep tuc luu nhap.

### `POST /api/audit-plans/:id/close`

Chuyen plan sang `closed`.

### Loi FE nen bat rieng

| Message BE | FE nen hieu |
|---|---|
| `Open audit plan can only update name and audit window` | Dang open, khong cho sua checklist/replace full assignments |
| `Only draft audit plan can be published` | Plan da publish hoac da close roi |
| `Only pending assignment can be changed` | Assignment da bat dau, disable nut doi QC/xoa |
| `Assignment already has audit data` | Da co du lieu audit, khong duoc mutate |
| `Open audit plan requires at least one assignment` | Khong cho xoa assignment cuoi cung cua plan dang chay |

## QC My Assignments

### `GET /api/audit-plans/my-assignments`

Chi role `qc_auditor`. Backend tu lay `x-user-id` tu middleware, FE khong truyen auditorId. Route nay chi tra assignment thuoc plan da `open`; plan con `draft` khong hien cho QC.

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

## Luu Y Handoff

- FE khong can xu ly `scheduledDate` nua.
- FE khong can tu suy ra ten store, ten auditor, ten checklist tu id; response da co display fields.
- FE nen dung `status` tu backend de bat/tat action, khong tu suy doan tu ngay thang.
- Hien BE da tra full list cho QAM de FE sort/filter local. Khi du lieu lon hon, endpoint list co the tach summary/detail o task performance sau.
- DB dev hien tai da sync migration cho:
  - `criteria_groups.isActive`
  - `checklist_sections.weight`
  - `audit_plans.startDate/endDate`
  - audit plan default `draft`
