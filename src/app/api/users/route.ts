import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import {
  getValidationMessage,
  ROLE_KEYS,
  userCreateSchema,
  userSelect,
} from "@/lib/admin";
import { invalidateAdminCache, readAdminCache } from "@/lib/admin-cache";
import { validateRoleAssignments } from "@/lib/admin-db";
import {
  attachRoleAssignmentStores,
  attachRoleAssignmentStoresToUser,
} from "@/lib/admin-user-dto";
import { withServerTiming } from "@/lib/server-timing";

export async function GET(request: NextRequest) {
  const startedAt = performance.now();
  const forbidden = requireRole(request, ["company_admin", "qa_manager"]);
  if (forbidden) return forbidden;

  try {
    const role = new URL(request.url).searchParams.get("role")?.trim();

    if (role && !ROLE_KEYS.includes(role as any)) {
      return response.error("Invalid role", 400);
    }

    const dbStartedAt = performance.now();
    const cacheKey = role ? `users:list:role:${role}` : "users:list";
    const { value: users, cacheHit } = await readAdminCache(cacheKey, () =>
      prisma.user
        .findMany({
          where: role
            ? {
                roleAssignments: {
                  some: {
                    roleKey: role,
                  },
                },
              }
            : undefined,
          select: userSelect,
          orderBy: { fullName: "asc" },
        })
        .then(attachRoleAssignmentStores)
    );
    const dbDuration = performance.now() - dbStartedAt;

    return withServerTiming(response.success(users), [
      {
        name: cacheHit ? "cache" : "db",
        durationMs: dbDuration,
        description: cacheHit ? "Admin cache hit" : "Prisma query",
      },
      { name: "total", durationMs: performance.now() - startedAt, description: "Route handler" },
    ]);
  } catch (error) {
    console.error("Get users error:", error);
    return response.error("Internal server error", 500);
  }
}

export async function POST(request: NextRequest) {
  const forbidden = requireRole(request, ["company_admin"]);
  if (forbidden) return forbidden;

  try {
    const parsed = userCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return response.error(getValidationMessage(parsed.error), 400);
    }

    const roleError = await validateRoleAssignments(parsed.data.roleAssignments);
    if (roleError) {
      return response.error(roleError, 400);
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true },
    });

    if (existingUser) {
      return response.error("Email already in use", 400);
    }

    const password = await bcrypt.hash(parsed.data.password, 10);
    const user = await prisma.user.create({
      data: {
        email: parsed.data.email,
        fullName: parsed.data.fullName,
        phone: parsed.data.phone,
        password,
        roleAssignments: {
          create: parsed.data.roleAssignments.map((assignment) => ({
            roleKey: assignment.roleKey,
            storeId: assignment.storeId ?? undefined,
          })),
        },
      },
      select: userSelect,
    });

    invalidateAdminCache("users:");
    return response.created(
      await attachRoleAssignmentStoresToUser(user),
      "User created successfully"
    );
  } catch (error) {
    console.error("Create user error:", error);
    return response.error("Internal server error", 500);
  }
}
