---
title: "QAM Foundation Plan"
status: "implemented"
created: "2026-05-15"
branchTarget: "dev"
sourceReferenceBranch: "dev"
blockedBy: []
blocks: []
---

# Plan - QA Manager Foundation

## Tổng Quan

Sau Admin core, bước tiếp theo là **QA Manager Foundation**: cho QAM cấu hình tiêu chí, checklist và audit plan để giao việc cho QC.

Plan này chưa triển khai audit execution/scoring submit. Mục tiêu là tạo được nền dữ liệu nghiệp vụ đúng để bước sau QC có assignment hợp lệ và checklist đã publish.

Branch chính hiện tại là `dev`; `main` tạm thời không đụng.

## Business Decisions Đã Chốt

| Chủ đề | Quyết định |
|---|---|
| Criteria group | Có nhóm mặc định `C/H/E/P` hoặc `C/H/P/E` theo code đã chốt khi seed. Không lưu trọng số cố định ở group. |
| Group CRUD | Có CRUD group nhẹ cho QAM/admin quản lý name/code/color/active nếu cần, nhưng **không có weight**. |
| Criteria thuộc group | Mỗi criteria phải thuộc một group để tổ chức checklist và hiển thị breakdown. |
| CCP/Critical | CCP là flag trên criteria; khi criteria đó lỗi thì group/section liên quan bị 0 điểm trong scoring sau này. |
| RISK | RISK cũng là flag trên criteria, nhưng effect là **toàn bài audit = 0**, không phải group-level zero. Criteria risk vẫn có group để UI tổ chức câu hỏi, nhưng scoring effect không nằm trong group. |
| Checklist section weight | Weight nằm trên checklist section, không nằm trên group. |
| Checklist weight validate | Tổng weight của tất cả section trong một checklist phải bằng `100%`. |
| Checklist lifecycle | `draft -> published -> archived`. |
| Archived meaning | `archived` nghĩa là checklist/version cũ vẫn đọc được cho audit history, nhưng không được dùng tạo audit plan mới và không sửa nội dung trực tiếp. |
| Audit plan assignments | Khi tạo audit plan, request nhận `assignments[]`, mỗi item là một cặp `storeId + auditorId`. |
| QC assignments | Backend tạo một `AuditAssignment` cho từng store, mỗi store có thể được gán QC khác nhau. |

## Giải Thích `archived`

`archived` không phải xóa checklist.

Nó dùng để:

1. Giữ lịch sử: audit cũ vẫn biết đã dùng checklist/version nào.
2. Chặn dùng mới: QAM không chọn checklist archived để tạo audit plan mới.
3. Tránh sửa nhầm: checklist archived không được sửa cấu trúc.
4. Hỗ trợ versioning: nếu checklist published cần thay đổi, tạo bản draft/version mới thay vì sửa bản cũ.

Nếu project portfolio muốn đơn giản, có thể vẫn giữ `archived` vì nó là trạng thái rẻ nhưng giúp nghiệp vụ rõ hơn rất nhiều.

## Phạm Vi Trong Task Này

### 1. Criteria Group

Mục tiêu:

- QAM xem được danh sách group mặc định.
- Group không lưu weight.
- Group dùng để phân loại criteria và checklist section.

API đề xuất:

| Method | Path | Mục tiêu |
|---|---|---|
| `GET` | `/api/criteria-groups` | list group |
| `POST` | `/api/criteria-groups` | tạo group nếu cần |
| `PATCH` | `/api/criteria-groups/[id]` | sửa name/color/active |

DTO đề xuất:

```ts
type CriteriaGroup = {
  id: string
  code: "C" | "H" | "E" | "P" | string
  name: string
  color: string | null
  isActive?: boolean
  createdAt: string
  updatedAt: string
}
```

Schema hiện tại có `weight Float`; vì user chốt **không lưu weight ở group**, implementation có 2 hướng:

1. Nếu chưa muốn migration: giữ column `weight` nhưng BE không expose/không dùng, set default internal khi create.
2. Nếu chấp nhận migration sau: remove `weight` khỏi schema.

Khuyến nghị cho task này: **không đổi schema nếu chưa bắt buộc**, để tránh lan migration; BE không trả weight group ra API QAM.

### 2. Criteria

Mục tiêu:

- QAM tạo/sửa/tắt tiêu chí.
- Criteria bắt buộc thuộc group.
- Criteria có scoring config cơ bản.
- Criteria có flag: `none`, `critical`, `risk`.

API đề xuất:

| Method | Path | Mục tiêu |
|---|---|---|
| `GET` | `/api/criteria` | list criteria, optional filter `groupId`, `isActive` |
| `POST` | `/api/criteria` | tạo criteria |
| `PATCH` | `/api/criteria/[id]` | sửa criteria |

DTO:

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

Validation:

- `code` unique.
- `groupId` phải tồn tại.
- `deductionPerError > 0`.
- `maxDeduction > 0`.
- `flag` chỉ nhận `none | critical | risk`.
- Criteria đã dùng trong checklist/audit cũ không hard delete; chỉ inactive.

### 3. Checklist Builder

Mục tiêu:

- QAM tạo checklist draft.
- Checklist có sections.
- Mỗi section gắn với một group và có `weight`.
- Criteria được gắn vào section.
- Tổng section weight phải bằng `100`.

API đề xuất:

| Method | Path | Mục tiêu |
|---|---|---|
| `GET` | `/api/checklists` | list checklist |
| `POST` | `/api/checklists` | tạo checklist draft |
| `GET` | `/api/checklists/[id]` | detail nested sections/items |
| `PATCH` | `/api/checklists/[id]` | sửa metadata khi draft |
| `POST` | `/api/checklists/[id]/sections` | thêm section |
| `PATCH` | `/api/checklists/[id]/sections/[sectionId]` | sửa name/group/weight/order |
| `POST` | `/api/checklists/[id]/sections/[sectionId]/items` | thêm criteria vào section |
| `DELETE` hoặc `PATCH` | section/item | có thể để sau nếu FE chưa cần |

DTO checklist detail:

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

Schema note:

- Hiện `ChecklistSection` đang có `groupId`, `name`, `order`, nhưng chưa có `weight`.
- Vì weight là nghiệp vụ đã chốt theo checklist section, cần migration thêm:

```prisma
model ChecklistSection {
  weight Float @default(0)
}
```

### 4. Checklist Lifecycle

Mục tiêu:

- Draft sửa được.
- Publish validate đủ điều kiện.
- Archived không dùng cho plan mới.

API:

| Method | Path | Mục tiêu |
|---|---|---|
| `POST` | `/api/checklists/[id]/publish` | publish checklist |
| `POST` | `/api/checklists/[id]/archive` | archive checklist |

Publish validation:

- Checklist đang `draft`.
- Có ít nhất 1 section.
- Mỗi section có ít nhất 1 item.
- Tổng `section.weight = 100`.
- Không có duplicate criteria trong cùng checklist.
- Chỉ dùng criteria active.

Archive validation:

- Checklist đang `published`.
- Sau archive không tạo audit plan mới bằng checklist đó.

### 5. Audit Plan

Mục tiêu:

- QAM tạo plan từ checklist `published`.
- Request nhận danh sách assignment theo từng store.
- Mỗi store trong plan có một QC phụ trách riêng.
- Backend tạo assignment cho từng item trong `assignments[]`.

API đề xuất:

| Method | Path | Mục tiêu |
|---|---|---|
| `GET` | `/api/audit-plans` | list plan |
| `POST` | `/api/audit-plans` | tạo plan + assignments |
| `GET` | `/api/audit-plans/[id]` | detail plan + assignments |
| `POST` | `/api/audit-plans/[id]/close` | close plan nếu cần |

Create body:

```ts
type CreateAuditPlanBody = {
  name: string
  formId: string
  assignments: Array<{
    storeId: string
    auditorId: string
    scheduledDate: string
  }>
}
```

Contract bị loại bỏ:

```ts
// Sai nghiệp vụ: nhiều store dùng chung một QC.
type WrongCreateAuditPlanBody = {
  stores: string[]
  auditorId: string
}
```

Lý do: một audit plan có thể tạo hàng loạt assignment, nhưng mỗi cửa hàng là một đơn vị audit riêng và phải chỉ định QC riêng cho cửa hàng đó.

Validation:

- `formId` phải là checklist `published`.
- Checklist `archived` không được dùng.
- `assignments` là mảng, min 1.
- Mỗi `assignment.storeId` phải tồn tại và active.
- Mỗi `assignment.auditorId` phải là user active có role `qc_auditor`.
- Không duplicate `storeId` trong cùng request, vì một plan không audit cùng store hai lần nếu không có lý do nghiệp vụ riêng.
- Không duplicate `(planId, storeId)` khi tạo assignments.

### 6. My Assignments

Mục tiêu:

- QC chỉ thấy assignment của mình.
- Assignment có đủ store/checklist display fields.

API:

| Method | Path | Mục tiêu |
|---|---|---|
| `GET` | `/api/audit-plans/my-assignments` | QC list assignments của mình |

Response:

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

## Ngoài Phạm Vi Task Này

- Audit draft/submit.
- Scoring engine.
- Repeat violation calculation.
- Auto-create Action Plan.
- Dashboard/analytics.
- Evidence upload.

Các phần này thuộc task sau: **QC Audit Execution + Scoring**.

## Thứ Tự Triển Khai

### Phase 1 - Schema & Shared DTO

1. Thêm `weight` vào `ChecklistSection`.
2. Generate Prisma client.
3. Tạo helper validation:
   - sum section weight = 100
   - criteria belongs to valid group
   - checklist publish guard
   - audit plan store array validation

### Phase 2 - Criteria Group & Criteria APIs

1. Implement `/api/criteria-groups`.
2. Implement `/api/criteria`.
3. Tests:
   - group list không trả weight
   - criteria bắt buộc group
   - duplicate code bị chặn
   - invalid flag bị chặn

### Phase 3 - Checklist APIs

1. Implement checklist list/create/detail/update.
2. Implement sections/items APIs.
3. Implement publish/archive.
4. Tests:
   - publish fail nếu tổng weight != 100
   - publish fail nếu section rỗng
   - publish success nếu hợp lệ
   - archived checklist không sửa/publish lại

### Phase 4 - Audit Plan APIs

1. Implement audit plan create with `assignments[]`.
2. Tạo assignments theo từng cặp `storeId + auditorId`.
3. Implement plan list/detail.
4. Tests:
   - create fail nếu checklist không published
   - create fail nếu `assignments` rỗng
   - create fail nếu duplicate `storeId`
   - create fail nếu có store không active/tồn tại
   - create fail nếu có auditor không active QC
   - create success tạo đúng số assignments, mỗi assignment giữ đúng `storeId + auditorId`

### Phase 5 - QC My Assignments

1. Implement scoped endpoint cho QC.
2. Tests:
   - QC chỉ thấy assignment của mình
   - QAM/admin không dùng endpoint này như plan management
   - response có store/checklist display fields

### Phase 6 - Docs & FE Handoff

1. Viết `docs/qam-fe-handoff.md`.
2. Update status trong `docs/rebuild-status.md`.
3. Chạy `npm run test`.
4. Chạy `npm run build`.

## Test Matrix

| Nhóm | Test bắt buộc |
|---|---|
| Group | list/create/update, không expose weight |
| Criteria | group required, unique code, flag valid, no hard delete |
| Checklist | draft create, section weight, item add, publish validate 100%, archive |
| Audit Plan | `assignments[]`, checklist published only, store active, auditor QC active, create assignments |
| RBAC | QAM mutate QAM modules, QC chỉ my assignments, company_admin tùy policy xem/admin |
| Contract | relation display fields, không raw id-only |

## Definition Of Done

Task QAM Foundation chỉ coi là xong khi:

1. QAM tạo được criteria group/criteria.
2. QAM tạo được checklist draft có section weight.
3. Checklist publish chỉ thành công khi tổng section weight = 100.
4. Checklist archived không dùng tạo plan mới.
5. QAM tạo audit plan với `assignments[]` theo từng store/QC.
6. Backend tạo assignments đúng số item và đúng QC từng store.
7. QC xem được my assignments.
8. FE có handoff doc.
9. `npm run test` và `npm run build` pass.

## Lệnh Triển Khai Tiếp Theo

```txt
[$ck:cook](C:\Users\ACER\.codex\skills\cook\SKILL.md) Triển khai QAM Foundation theo plans/260515-qam-foundation/plan.md --auto
```
