# Checklist Import Reset Report

Ngay thuc hien: 2026-05-19

## Ket qua tren Supabase dev

Da clear cac bang QA/QC sai va import lai checklist demo tu file Excel:

`D:\work\maycha\docs\uat\Checklist Maycha_lan 1 ngay 10.05.2026_Van Huy.xlsx`

Du lieu duoc giu lai:

- users: 207
- stores: 150
- brands: 4
- role_assignments: 207

Du lieu QA/QC sau reset:

- checklist_forms: 1
- checklist_sections: 4
- checklist_section_items: 33
- criteria_groups: 4
- criteria: 36
- audit_plans/audit_assignments/audits/violations/action_plans: 0

## Checklist moi

- name: `Checklist van hanh cua hang - Demo`
- version: `6.0.0`
- status: `published`

Groups/sections:

| Code | Name | Weight | Normal maxScore | Critical count |
| --- | --- | ---: | ---: | ---: |
| C | Tieu chuan ve sinh | 35 | 121 | 1 |
| H | Khu vuc phuc vu khach hang | 10 | 31 | 0 |
| P | San pham | 15 | 60 | 0 |
| E | Tieu chuan va han su dung san pham | 40 | 110 | 5 |

Global RISK:

- `RISK-01`
- `RISK-02`
- `RISK-03`

RISK khong nam trong section/group, FE doc bang `riskCriteria[]` khi mo bai audit.

## Contract FE can luu y

`GET /api/audits/assignments/:assignmentId`:

- `checklist.sections[]` chua criteria theo group C/H/P/E.
- `riskCriteria[]` chua RISK global.

`PATCH /api/audits/draft` va `POST /api/audits/submit`:

- `criteriaId` co the la criteria trong checklist section.
- `criteriaId` cung co the la item trong `riskCriteria[]`.

`GET /api/audits/:id`:

- `scoreBreakdown.groups[].maxScore` la diem chuan raw tu Excel.
- `scoreBreakdown.groups[].weight` la ty trong section.
- `scoreBreakdown.groups[].weightedScore = (reachedScore / maxScore) * weight`.
- Neu co RISK: `finalScore = 0`, `grade = "alarm"`.

## Verification

- `npm.cmd run test`: 56/56 passed.
- `npm.cmd run build`: passed.
- `npx.cmd prisma validate`: passed.
