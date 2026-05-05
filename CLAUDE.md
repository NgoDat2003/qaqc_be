# Maycha QA/QC — Backend

## Stack
- Framework: Next.js API Routes (REST), TypeScript strict
- ORM: Prisma + SQLite (dev) / PostgreSQL (prod)
- Auth: JWT httpOnly cookie (`qo_token`), jose + bcryptjs
- Upload: Local filesystem `public/uploads/` (dev)
- Port: 3000

## Commands
- Dev: `npm run dev` (port 3000)
- Build: `npm run build`
- Lint: `npm run lint`
- DB migrate: `npx prisma migrate dev`
- DB seed: `npx prisma db seed`
- Prisma Studio: `npx prisma studio`

## Architecture
- Routes: `src/app/api/<resource>/route.ts`
- Auth middleware: `src/middleware.ts` — inject x-user-id, x-user-roles vào header
- RBAC: `src/lib/rbac.ts` — `requireRole(request, roles[])`
- Response helper: `src/lib/api-response.ts` — dùng `response.success()` hoặc `response.created()`
- Scoring engine: `src/lib/scoring.ts`

## API Response Pattern
```typescript
// Thành công 200
return response.success(data, "message")

// Tạo mới 201 — PHẢI dùng created(), KHÔNG dùng success(..., 201)
return response.created(data, "message")

// Lỗi
return response.error("message", 400)
return response.unauthorized()
return response.forbidden()
```

## RBAC Pattern
```typescript
const forbidden = requireRole(request, ["company_admin", "qa_manager"])
if (forbidden) return forbidden
const userId = request.headers.get("x-user-id")!
const roles = JSON.parse(request.headers.get("x-user-roles") || "[]")
```

## Không được đụng vào
- `prisma/migrations/` — không sửa tay, chỉ dùng `prisma migrate dev`
- `src/lib/auth.ts` — JWT signing/verification
- `.env` — không commit, thêm biến mới vào `.env.example`

## Key files
- Schema: `prisma/schema.prisma`
- Auth: `src/lib/auth.ts`
- RBAC: `src/lib/rbac.ts`
- Response: `src/lib/api-response.ts`
- Scoring: `src/lib/scoring.ts`
- Middleware: `src/middleware.ts`

## Business rules quan trọng
- CCP → điểm nhóm tiêu chí liên quan = 0
- RISK → toàn bài = 0
- Lỗi lặp: lần 4 cùng tiêu chí → auto CCP, lần 5 reset
- SM tạo Action Plan, QAM là người duy nhất close AP
- Upload ảnh: lưu `public/uploads/evidence/`, trả về URL public
- CORS: đọc từ `process.env.CORS_ORIGIN`, không hardcode
