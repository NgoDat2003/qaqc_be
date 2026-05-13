# ADR-001 - Phạm Vi Nghiệp Vụ Cuối

## Trạng Thái

Đã chấp nhận

## Quyết Định

Backend chỉ hỗ trợ một cơ chế QA/QC: scoring nội bộ C/H/P/E có trọng số.

## Bao Gồm

- Trọng số nhóm C/H/P/E.
- CCP/Critical làm group về 0.
- RISK làm final score về 0.
- Backend tự tính lỗi lặp.
- Checklist có version.
- Luồng audit plan và assignment.
- Luồng SM submit AP, QAM close AP.

## Không Bao Gồm

- Franchise/NQ.
- Bài test kiến thức.
- Scoring 187 điểm.
- CCP trừ 90.
- Chia phase release.

## Hệ Quả

Implementation đơn giản hơn, API và UI tập trung vào một cơ chế nghiệp vụ duy nhất.
