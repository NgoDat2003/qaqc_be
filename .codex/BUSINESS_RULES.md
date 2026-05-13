# Quy Tắc Nghiệp Vụ

## Phạm Vi

Sản phẩm chỉ hỗ trợ một cơ chế QA/QC:

- Checklist QA/QC nội bộ Maycha.
- Nhóm tiêu chí C/H/P/E.
- Scoring có trọng số.
- CCP/Critical.
- RISK.
- Backend tự tính lỗi lặp.

Ngoài phạm vi:

- Franchise/NQ.
- Bài test kiến thức.
- Scoring 187 điểm.
- CCP trừ 90.
- Chia phase release.

## Role

| Role | Quy tắc backend |
|---|---|
| `company_admin` | Quản lý user, role, brand, store và master data. |
| `qa_manager` | Owner nghiệp vụ QA/QC: criteria, checklist, audit plan, review result, reject/close AP, report. |
| `qc_auditor` | Chỉ xem và thực hiện assignment của mình. Được sửa draft trước submit. Không sửa sau submit. |
| `store_manager` | Xem result/AP của store mình. Cập nhật remediation/evidence và submit AP. |
| `am` | Xem result/AP của store được gán, mặc định read-only. |
| `executive_viewer` | Chỉ xem dashboard/report. |

## Scoring

Trọng số mặc định:

| Nhóm | Trọng số |
|---|---:|
| C | 0.30 |
| H | 0.15 |
| P | 0.15 |
| E | 0.40 |

Quy tắc:

- Điểm trừ thường = `numErrors * deductionPerError * repeatMultiplier`.
- Repeat multiplier đi theo chuỗi lỗi lặp.
- CCP/Critical có lỗi thì điểm nhóm liên quan về 0.
- RISK có lỗi thì final score về 0 và grade là `alarm`.
- Nếu không có RISK, grade theo scoring engine.

## Lỗi Lặp

QC không nhập repeat count.

Input từ QC:

- `criteriaId`
- `numErrors`
- `note`
- `evidenceUrls` hoặc evidence id

Backend tính theo:

- cùng `storeId`
- cùng `criteriaId`
- chỉ audit đã submit (`submittedAt != null`)
- violation có `numErrors > 0`

Chuỗi:

| Lần tính được | Hiệu lực |
|---:|---|
| 1 | multiplier x1 |
| 2 | multiplier x2 |
| 3 | multiplier x3 |
| 4 | auto CCP |
| 5 | reset về x1 |

Công thức:

```ts
const occurrence = (previousViolationCount % 5) + 1
```

API cần trả:

- `repeatCount`
- `repeatLabel`: `first`, `second`, `third`, `auto_ccp`, hoặc `reset`
- `isCriticalTriggered`

## Luồng Xử Lý

Checklist:

```txt
draft -> published -> archived
```

Assignment:

```txt
pending -> in_progress -> completed
```

Action Plan:

```txt
draft -> submitted -> rejected -> submitted -> closed
draft -> submitted -> closed
```

Chỉ QAM close AP. SM không tự close AP.
