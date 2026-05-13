# Kiến Trúc Backend Mục Tiêu

## Stack Hiện Tại

- Next.js API routes.
- TypeScript strict.
- Prisma.
- Auth bằng JWT httpOnly cookie.

## Hình Dạng Mục Tiêu

```txt
src/app/api/<resource>/route.ts
  -> parse request
  -> validate zod schema
  -> call service
  -> return response helper

src/services/
  audit.service.ts
  action-plan.service.ts
  checklist.service.ts

src/dto/
  audit.dto.ts
  action-plan.dto.ts
  common.dto.ts

src/lib/
  pagination.ts
  scope.ts
  scoring.ts
  api-response.ts
```

## Nguyên Tắc

- Route không chứa business logic phức tạp.
- Scoring tập trung ở `src/lib/scoring.ts`.
- RBAC/scope dùng helper chung.
- Output API đi qua DTO mapper.
- Query phục vụ UI dùng `select` rõ field.
- Write nhiều bảng phải dùng transaction.

## Ranh Giới Service

Audit service quản lý:

- kiểm tra ownership assignment
- lưu draft
- submit
- tính repeat
- gọi scoring
- trigger tạo AP

Action plan service quản lý:

- chuyển trạng thái AP
- SM update/submit
- QAM reject/close
- scope check

Scope helper quản lý:

- user id và roles hiện tại
- store ids được truy cập
- ownership assignment
- guard truy cập AP/audit
