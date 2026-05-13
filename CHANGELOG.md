# CHANGELOG — QA/QC Backend Agent Log

## Current status
Backend hoàn chỉnh. Tất cả API endpoints đã implement. Sẵn sàng cho FE integration.

## Completed
- 2026-05-05: Auth — JWT httpOnly cookie, login/me/logout
- 2026-05-05: Master data — brands, stores, users, roles, RBAC
- 2026-05-05: Criteria — groups (C/H/E/P), criteria với CCP/RISK flags
- 2026-05-05: Checklist — forms, sections, items, publish/archive
- 2026-05-05: Audit Planning — plans, assignments, my-assignments
- 2026-05-05: Audit Execution — submit với full scoring engine
- 2026-05-05: Action Plans — SM create → QAM close workflow
- 2026-05-05: Evidence upload — local filesystem
- 2026-05-05: Analytics — dashboard overview metrics
- 2026-05-05: Fix response.created() — đúng HTTP 201 status
- 2026-05-05: Fix CORS — dùng process.env.CORS_ORIGIN thay vì hardcode

## Failed approaches
- response.success(data, "msg", 201) → 201 vào meta thay vì status
  → Fix: tạo response.created() helper riêng

## Known issues
- Notifications không tự trigger khi audit submit / AP thay đổi trạng thái
  → Cần thêm notification service vào workflow endpoints
- List endpoints không có pagination → performance issue khi data lớn
  → Cần thêm ?page=&limit= params
- Evidence upload lưu local disk — không scale khi deploy multi-instance
  → Production cần MinIO hoặc S3

## Next
- Thêm pagination cho GET list endpoints
- Notification triggers cho audit/action-plan events
- Chuẩn bị migrate sang PostgreSQL trước production
