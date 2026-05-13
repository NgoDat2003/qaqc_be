# Không Gian Điều Khiển Codex - Backend QA/QC

Folder này là nơi Codex lưu quy ước, bộ nhớ làm việc, kế hoạch triển khai và danh sách vấn đề của backend QA/QC.

Thứ tự đọc khi làm backend:

1. `AGENTS.md`
2. `.codex/INSTRUCTIONS.md`
3. `.codex/MEMORY.md`
4. `.codex/BUSINESS_RULES.md`
5. `.codex/API_CONTRACT_RULES.md`
6. `.codex/ISSUE_REGISTER.md`
7. file plan liên quan trong `.codex/plans/`

Phạm vi nghiệp vụ đã chốt: chỉ có một cơ chế QA/QC nội bộ C/H/P/E. Không có Franchise/NQ, không chia phase.

## Nguồn Chính

- Nghiệp vụ chuẩn: `BUSINESS_RULES.md`
- Quy ước API: `API_CONTRACT_RULES.md`
- Kiến trúc mục tiêu: `BACKEND_ARCHITECTURE.md`
- Danh sách việc cần sửa: `ISSUE_REGISTER.md`
- Thứ tự triển khai: `ROADMAP.md`
- Danh sách kiểm thử: `TESTING_CHECKLIST.md`

## Quy Tắc Vận Hành

Khi backend đổi hành vi, cập nhật lại folder này. Nếu phát sinh quyết định mới, ghi vào `MEMORY.md` và tạo/cập nhật ADR trong `decisions/`.
