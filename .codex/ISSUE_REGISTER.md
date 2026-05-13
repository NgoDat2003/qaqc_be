# Sổ Theo Dõi Vấn Đề

| ID | Mức | Khu vực | Vấn đề | Ảnh hưởng | Bằng chứng | Trạng thái | Plan |
|---|---|---|---|---|---|---|---|
| BE-001 | P0 | Audit/RBAC | Submit audit thiếu kiểm tra assignment thuộc auditor hiện tại. | QC có thể submit assignment của người khác. | `src/app/api/audits/submit/route.ts` | Xong | `plans/01-business-correctness.md` |
| BE-002 | P0 | Audit/RBAC | Draft audit thiếu kiểm tra assignment thuộc auditor hiện tại. | QC có thể tạo/sửa draft của người khác. | `src/app/api/audits/draft/route.ts` | Xong | `plans/01-business-correctness.md` |
| BE-003 | P0 | Scoring | Submit audit từng tự tính điểm riêng, không dùng scoring engine. | CCP/RISK/repeat dễ sai rule. | `src/app/api/audits/submit/route.ts`, `src/lib/scoring.ts` | Xong | `plans/02-scoring-engine.md` |
| BE-004 | P0 | Repeat | Repeat count chưa được backend tính từ lịch sử submitted. | UI không hiển thị tin cậy lỗi đã lặp lần mấy. | `src/app/api/audits/submit/route.ts` | Xong | `plans/02-scoring-engine.md` |
| BE-005 | P1 | Kế hoạch hành động | Trạng thái AP còn mâu thuẫn (`confirmed`, `in_progress`, `rejected`, `closed`). | Luồng xử lý có thể kẹt hoặc chạy khác nhau theo endpoint. | `src/app/api/action-plans/*` | Mở | `plans/03-action-plan-workflow.md` |
| BE-006 | P1 | Kế hoạch hành động/RBAC | `company_admin` còn có thể close/confirm AP trong code cũ. | Sai trách nhiệm QAM trong QA/QC. | `src/app/api/action-plans/[id]/confirm/route.ts` | Mở | `plans/03-action-plan-workflow.md` |
| BE-007 | P1 | RBAC | QC có thể xem chi tiết full audit plan nếu biết id. | Lộ assignment và thông tin store. | `src/app/api/audit-plans/[id]/route.ts` | Mở | `plans/04-rbac-scope.md` |
| BE-008 | P1 | Hợp đồng API | List API thiếu pagination meta. | UI/API chậm khi dữ liệu tăng. | nhiều endpoint `findMany` | Mở | `plans/05-api-contract-ui.md` |
| BE-009 | P1 | Hợp đồng API | Response thiếu display field hoặc không đồng nhất. | UI có thể phải hiển thị id hoặc gọi thêm API. | nhiều endpoint list/create/update | Mở | `plans/05-api-contract-ui.md` |
| BE-010 | P1 | Performance | Submit audit từng có N+1 query criteria. | Submit chậm với checklist lớn. | loop trong `src/app/api/audits/submit/route.ts` | Xong | `plans/06-architecture-performance.md` |
| BE-011 | P2 | Security | Upload chưa validate MIME/dung lượng. | Có thể upload file không mong muốn hoặc file quá lớn. | `src/app/api/upload/evidence/route.ts` | Mở | `plans/06-architecture-performance.md` |
| BE-012 | P2 | CORS | Middleware có fallback CORS hardcode. | Production có thể mở nhầm origin dev. | `src/middleware.ts` | Mở | `plans/06-architecture-performance.md` |
