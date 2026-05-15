# QAM FE Handoff

Trang thai: da implement backend foundation cho role `qa_manager` tren nhanh `dev`.

Tai lieu nay chi mo ta nhung API FE can de lam man hinh QAM cau hinh criteria, checklist va audit plan. Phan QC audit execution, scoring submit, repeat violation va action plan chua nam trong dot nay.

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

### `POST /api/checklists/:id/sections/:sectionId/items`

Chi them criteria active va criteria phai thuoc cung group voi section.

```ts
type Body = {
  criteriaId: string
  order?: number
}
```

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

### `GET /api/audit-plans`

Tra full plans kem assignments va progress.

```ts
type AuditPlan = {
  id: string
  name: string
  status: "open" | "closed"
  formId: string
  form: { id: string; name: string; version: string; status: string }
  assignments: Array<{
    id: string
    status: "pending" | "in_progress" | "completed"
    scheduledDate: string
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

Dung contract moi `assignments[]`. Khong dung `stores[] + auditorId`.

```ts
type Body = {
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

- checklist phai `published`
- `assignments` min 1
- khong duplicate `storeId`
- store phai active
- auditor phai active va co role `qc_auditor`
- moi item tao mot `AuditAssignment`

### `GET /api/audit-plans/:id`

Tra detail giong list item.

### `POST /api/audit-plans/:id/close`

Chuyen plan sang `closed`.

## QC My Assignments

### `GET /api/audit-plans/my-assignments`

Chi role `qc_auditor`. Backend tu lay `x-user-id` tu middleware, FE khong truyen auditorId.

```ts
type MyAssignment = {
  id: string
  status: "pending" | "in_progress" | "completed"
  scheduledDate: string
  store: { id: string; code: string; name: string }
  plan: { id: string; name: string; status: string }
  checklist: { id: string; name: string; version: string }
  auditId: string | null
}
```

## Luu y DB

Dot nay them field schema:

- `criteria_groups.isActive`
- `checklist_sections.weight`

DB dev hien tai da duoc sync bang Prisma `db push` de them field tren. Moi moi truong khac can sync schema truoc khi FE dung API checklist section weight.
