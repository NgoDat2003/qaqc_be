---
name: team-conventions
description: Quy ước code và pattern riêng của QA/QC Backend. Dùng khi viết route mới hoặc sửa business logic.
---

## Response Pattern — BẮT BUỘC

```typescript
// 200 OK
return response.success(data)
return response.success(data, "Thông báo thành công")

// 201 Created — PHẢI dùng created(), KHÔNG dùng success(..., 201)
return response.created(data, "Tạo thành công")

// Lỗi
return response.error("Lý do lỗi", 400)
return response.unauthorized()   // 401
return response.forbidden()      // 403
```

## Route Pattern

```typescript
export async function POST(request: NextRequest) {
  // 1. Check role
  const forbidden = requireRole(request, ["qa_manager"])
  if (forbidden) return forbidden

  // 2. Parse + validate body
  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return response.error("Validation failed", 400, undefined, parsed.error.flatten())

  // 3. Get user context from headers (set by middleware)
  const userId = request.headers.get("x-user-id")!
  const roles: string[] = JSON.parse(request.headers.get("x-user-roles") || "[]")

  // 4. Business logic
  try {
    const result = await prisma.entity.create({ data: { ...parsed.data, createdBy: userId } })
    return response.created(result, "Tạo thành công")
  } catch (error) {
    return response.error("Lỗi server", 500)
  }
}
```

## RBAC Scoping

```typescript
// QAM thấy tất cả, AM/SM chỉ thấy scope của mình
const isQAM = roles.includes("qa_manager")
const isSM = roles.includes("store_manager")

const where = isQAM ? {} : isSM ? { storeId: userStoreId } : { auditorId: userId }
```

## Prisma Patterns

```typescript
// Luôn dùng select để không lộ sensitive fields
const user = await prisma.user.findUnique({
  where: { id },
  select: { id: true, email: true, fullName: true, isActive: true }
})

// Transaction khi write nhiều bảng
const result = await prisma.$transaction(async (tx) => {
  const plan = await tx.auditPlan.create({ data: planData })
  await tx.auditAssignment.createMany({ data: assignments.map(a => ({ ...a, planId: plan.id })) })
  return plan
})
```

## Không được làm

- Không return password hash trong response
- Không dùng `response.success(..., 201)` — dùng `response.created()`
- Không hardcode CORS origin — dùng `process.env.CORS_ORIGIN`
- Không sửa tay file trong `prisma/migrations/`
- Không commit `.env` hoặc `prisma/dev.db`
- Không edit file trên `main` branch