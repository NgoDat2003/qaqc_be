# Phân Tích Hệ Thống

## Tóm Tắt

Backend hiện hoạt động ở mức MVP nhưng cần sửa các lỗi lõi trước khi đủ tin cậy cho workflow QA/QC portfolio.

## Phát Hiện Chính

| Mức | Khu vực | Nhận định |
|---|---|---|
| P0 | Audit | Draft/submit từng thiếu kiểm tra ownership. |
| P0 | Scoring | Submit từng tự tính scoring và có nguy cơ sai rule. |
| P0 | Repeat | Repeat count cần được tính từ lịch sử audit đã submit. |
| P1 | Kế hoạch hành động | Luồng trạng thái còn mâu thuẫn giữa schema và route. |
| P1 | API | List endpoint thiếu pagination và DTO ổn định. |
| P1 | RBAC | Một số detail endpoint còn quá rộng scope. |
| P1 | Performance | Có include rộng và pattern N+1. |
| P2 | Upload/CORS | Upload validation và CORS cần hardening. |

## Mục Tiêu

Đưa backend về trạng thái đúng nghiệp vụ, contract ổn định cho UI, scope truy cập rõ ràng và performance đủ tốt cho dự án portfolio.
