# ADR-003 - Nguồn Sự Thật Của Audit Scoring

## Trạng Thái

Đã chấp nhận

## Quyết Định

`src/lib/scoring.ts` là nguồn sự thật của scoring.

Route và service không được tự viết công thức scoring song song.

## Hệ Quả

Preview, draft summary và final submit phải cho ra hành vi scoring nhất quán.
