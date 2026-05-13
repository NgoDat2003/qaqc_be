# Plan 02 - Scoring Engine

## Vấn Đề Hiện Tại

- Submit route từng có scoring logic riêng.
- RISK, CCP và repeat có thể lệch khỏi `src/lib/scoring.ts`.
- Repeat count phải do backend tính từ lịch sử.

## Hành Vi Mục Tiêu

- `src/lib/scoring.ts` là nguồn sự thật duy nhất.
- Backend tính repeat info trước khi scoring.
- Audit response có repeat info để UI hiển thị.

## Cách Triển Khai

- Tạo helper/service tính repeat.
- Fetch violation submitted trước đó theo `storeId + criteriaId`.
- Build scoring input với repeat count backend tính.
- Dùng `calculateAuditScore()` cho preview và submit.
- Lưu `repeatCount`, `isCriticalTriggered`, `isRiskTriggered` vào violation.
- Lưu `triggeredCritical` cho group score.

## Repeat Labels

| Lần | Label | Hiệu lực |
|---:|---|---|
| 1 | `first` | x1 |
| 2 | `second` | x2 |
| 3 | `third` | x3 |
| 4 | `auto_ccp` | group critical |
| 5 | `reset` | x1 |

## Kiểm Thử

- Repeat không tính draft.
- Repeat scope theo store và criteria.
- Lần 4 auto CCP.
- Lần 5 reset.
- RISK làm final score về 0.
- CCP làm group score về 0.
