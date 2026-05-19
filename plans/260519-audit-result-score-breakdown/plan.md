---
title: "Audit Result Score Breakdown API"
status: "implemented"
created: "2026-05-19"
branchTarget: "dev"
sourceReferenceBranch: "codex/audit-results-action-plans"
scope: "audit_result_detail_score_breakdown"
blockedBy: []
blocks: []
---

# Plan - Audit Result Score Breakdown API

## Summary

Cap nhat `GET /api/audits/:id` de tra ve chi tiet cach tinh diem cho FE render man "xem ket qua" day du hon: diem theo group, so tieu chi, so tieu chi da cham, diem bi tru, CCP, risk, diem dat, ty trong va danh sach tung loi bi tru nhu the nao.

Muc tieu la FE khong can tu join checklist + violations + groupScores de suy ra bang diem. Backend se tra them `scoreBreakdown` ben canh response hien tai.

## Supabase Findings

Da dung Supabase project `visykstyvbohaavmitcc` (`QuatityOps Sin`) de doc schema/data thuc te.

Bang lien quan da co:

| Table | Vai tro | Ghi chu |
| --- | --- | --- |
| `audits` | diem tong, grade, risk flag, form/store/auditor | co 127 rows |
| `violations` | loi theo criteria, repeat, CCP/RISK flags, note | co 384 rows |
| `group_scores` | diem dat theo group sau khi submit/correction | co rows cho audit moi, audit cu co the thieu |
| `checklist_forms` | checklist snapshot theo audit | co relation qua `formId` |
| `checklist_sections` | group/section cua checklist, weight | data hien tai co section weight = 0 o mot so seed |
| `checklist_section_items` | criteria trong section | dung de dem tong so tieu chi |
| `criteria` | deduction config, flag none/critical/risk | khong co field diem chuan raw/item point |
| `criteria_groups` | code/name group | group default A/B/C/D |

Ket luan du lieu:

- Co du nguon de tinh chi tiet "bi tru bao nhieu" theo scoring engine hien tai.
- Chua co field de render dung tuyet doi cot Excel "Diem chuan = 121/31/60/110" neu day la tong diem raw theo tung cau. Scoring engine hien tai dang dung `maxScore = 100` moi group.
- Neu can cot "Diem chuan" khop Excel legacy, can task schema rieng them `basePoint`/`standardPoint` vao checklist item hoac criteria snapshot.
- Supabase advisory bao RLS dang disabled cho public tables. BE hien dung Prisma server-side nen khong anh huong API nay ngay, nhung day la risk security can xu ly khi mo Supabase client public.

## Current API Gap

`GET /api/audits/:id` hien co:

- `finalScore`, `grade`, `isRiskTriggered`.
- `groupScores`: groupCode, weight, maxScore, reachedScore, percentage, triggeredCritical.
- `violations`: criteria, numErrors, repeatCount, flags, note, images.

Chua co:

- `criteriaCount` theo group.
- `checkedCount` theo group.
- `deductedScore` theo group.
- `weightedScore` theo group.
- `ccpCount`/`riskCount` summary.
- Chi tiet tung violation tru bao nhieu diem.
- Ly do effect: normal deduction, CCP group = 0, RISK audit = 0, repeat auto CCP.
- Flag audit result co du du lieu checked hay khong.

## Decision

Khong doi schema trong task nay.

Ly do:

- Nhu cau hien tai la xem chi tiet cach tru diem theo scoring engine hien tai.
- DB hien co du `deductionPerError`, `maxDeduction`, `numErrors`, `repeatCount`, `flag`.
- Them schema diem chuan raw se keo theo checklist builder, submit snapshot, scoring migration. Chua nen lam chung.

Ta se them `scoreBreakdown` computed field trong `GET /api/audits/:id`.

## Target Response

Giữ nguyên response hiện tại, bổ sung:

```ts
type AuditResultDetail = {
  // existing fields...
  scoreBreakdown: AuditScoreBreakdown
}

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

## Field Mapping Cho Bang FE

| Cot FE | Field moi | Ghi chu |
| --- | --- | --- |
| Tieu chi | `groups[].groupCode` | A/B/C/D |
| So cau | `groups[].criteriaCount` | dem checklist item trong group, exclude risk global |
| So cau da cham | `groups[].checkedCount` | dem violation row co trong audit |
| Diem chuan | `groups[].maxScore` | hien tai la 100 theo scoring engine |
| Diem bi tru | `groups[].deductedScore` | sum deduction, hoac `maxScore - reachedScore` neu group CCP |
| CCP | `groups[].ccpCount` / `triggeredCritical` | critical criteria hoac repeat auto CCP |
| Diem dat | `groups[].reachedScore` | tu groupScore hoac recompute fallback |
| Ty trong | `groups[].weight` | tu groupScore, fallback section weight |
| Risk | `scoreBreakdown.risk` | risk global |
| Result | `scoreBreakdown.totals.finalScore` | bang audit finalScore |

## Calculation Rules

### Group criteria count

- Lay tu `audit.form.sections.items`.
- Criteria `flag = "risk"` khong tinh vao group count, dua vao `risk.items`.
- Neu data legacy van gan risk vao section, backend van treat risk la global.

### Checked count

- `checkedCount` = so criteria trong group co violation row trong audit.
- `uncheckedCount` = `criteriaCount - checkedCount`.
- Neu FE/QC submit khong gui violation row cho criteria khong loi, audit cu se co `isComplete = false`. Backend khong tu doan.

### Normal deduction

```ts
multiplier = repeatLabel === "second" ? 2 : repeatLabel === "third" ? 3 : 1
rawDeduction = numErrors * deductionPerError * multiplier
deductedScore = Math.min(rawDeduction, maxDeduction)
```

### Critical / CCP

- `criteria.flag === "critical"` hoac `violation.isCriticalTriggered === true` => group lien quan ve 0.
- Deduction line effect:
  - `critical_group_zero` neu criteria flag critical.
  - `repeat_auto_ccp_group_zero` neu repeat auto CCP.

### Risk

- `criteria.flag === "risk"` hoac `violation.isRiskTriggered === true` => audit final score = 0, grade = `alarm`.
- Risk khong nam trong group deduction.

### Fallback for legacy audits

- Neu audit co `groupScores`, uu tien saved `groupScores` de dam bao audit trail.
- Neu audit cu thieu `groupScores`, recompute summary tu checklist + violations bang scoring helper.
- Neu checklist section weight = 0, `weight` fallback theo saved groupScore, neu van 0 thi tra 0 va set `warnings`.

## Implementation Plan

### Phase 1 - Shared score breakdown builder

Tao file:

```txt
src/lib/audit-score-breakdown.ts
```

Exports:

```ts
export function buildAuditScoreBreakdown(audit: AuditForBreakdown): AuditScoreBreakdown
export function repeatLabelFromCount(repeatCount: number): RepeatLabel
export function multiplierFromRepeatLabel(label: RepeatLabel): number
```

Khong dua vao `audit-workflow.ts` nua de tranh file nay phinh tiep.

### Phase 2 - Expand audit detail query

Sua:

```txt
src/app/api/audits/[id]/route.ts
```

Select them:

- `form.sections.group`.
- `form.sections.items.criteria` gom:
  - id, code, content, flag, groupId, deductionPerError, maxDeduction.
- `groupScores`.
- `violations.criteria.group`.
- `violations.evidences`.

Sau khi load audit:

```ts
const scoreBreakdown = buildAuditScoreBreakdown(audit)
return response.success(auditDetailDto(audit, auditor, scoreBreakdown))
```

### Phase 3 - Update DTO

Sua:

```txt
src/lib/audit-workflow.ts
```

Tam thoi chi update `auditDetailDto(audit, auditor, scoreBreakdown?)`.

Khong refactor file 541 dong trong task nay, chi inject field moi de giam risk.

### Phase 4 - Tests

Them tests vao `tests/run-tests.ts`:

- Normal deduction:
  - numErrors = 2, deductionPerError = 2, repeat first => deductedScore = 4.
- Repeat multiplier:
  - repeatCount = 1 => label second => multiplier 2.
  - repeatCount = 2 => label third => multiplier 3.
- Critical:
  - criteria flag critical => group reachedScore 0, ccpCount +1.
- Repeat auto CCP:
  - repeatCount = 3/isCriticalTriggered true => effect repeat_auto_ccp_group_zero.
- Risk:
  - risk violation => `risk.triggered = true`, totals.finalScore = 0.
- Checked count:
  - checklist 3 criteria, audit has 2 violation rows => checked 2, unchecked 1, isComplete false.
- Route detail:
  - `GET /api/audits/:id` response has `scoreBreakdown.groups[].deductions[]`.

### Phase 5 - FE docs

Update:

```txt
docs/audit-results-action-plans-fe-handoff.md
```

Them section "Audit Score Breakdown" va vi du render bang:

```txt
Group | So cau | Da cham | Diem chuan | Bi tru | CCP | Diem dat | Ty trong
```

## Performance Notes

Endpoint detail chi goi khi mo 1 audit result, khong phai table list.

Cham nhan nested select lon hon list API, nhung can:

- Khong dua field password/user raw.
- Khong include relation khong can.
- Build breakdown in-memory tu data da load.
- Khong query N+1 per criteria.

## Acceptance Criteria

- `GET /api/audits/:id` tra `scoreBreakdown`.
- FE render duoc summary table va detail tung deduction khong can tu tinh scoring.
- Existing fields khong bi break.
- Tests pass.
- Build pass.
- Docs FE updated.

## Implementation Status

- `src/lib/audit-score-breakdown.ts`: done.
- `GET /api/audits/:id` expanded query + response `scoreBreakdown`: done.
- `auditDetailDto` keeps checklist slim and attaches `scoreBreakdown`: done.
- FE docs updated in `docs/audit-results-action-plans-fe-handoff.md`: done.
- Tests added:
  - score breakdown group/risk/deduction.
  - route audit detail returns `scoreBreakdown`.
- Verification:
  - `npm.cmd run test`: 55/55 pass.
  - `npm.cmd run build`: pass.
  - `npx.cmd prisma validate`: pass.

## Out Of Scope

- Khong them schema `standardPoint` trong task nay.
- Khong refactor `audit-workflow.ts` lon.
- Khong sua scoring formula tong quat.
- Khong xu ly RLS Supabase trong task nay.

## Follow-up Option

Neu can khop 100% voi Excel legacy cot `Diem chuan = 121/31/60/110`, tao task sau:

- Them `standardPoint` vao `ChecklistSectionItem` hoac checklist snapshot.
- Checklist builder cho QAM nhap/import diem chuan tung tieu chi.
- Submit audit snapshot diem chuan tai thoi diem cham.
- `scoreBreakdown.groups[].maxScore` dung sum `standardPoint` thay vi 100.

## Suggested Cook Command

```txt
[$ck:cook](C:\Users\ACER\.codex\skills\cook\SKILL.md) triển khai plans/260519-audit-result-score-breakdown/plan.md
```
