import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { getPaginationMeta, getPaginationParams } from "@/lib/pagination";
import { withServerTiming } from "@/lib/server-timing";
import { attachRoleAssignmentStores } from "@/lib/user-role-assignment-store";
import { z } from "zod";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

const VALID_ROLES = ["company_admin", "qa_manager", "qc_auditor", "am", "store_manager", "executive_viewer"];

const createUserSchema = z.object({
  email: z.string().email("Invalid email format"),
  fullName: z.string().min(2, "Full name is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  phone: z.string().optional().nullable(),
  roleAssignments: z.array(
    z.object({
      roleKey: z.enum(VALID_ROLES as [string, ...string[]]),
      storeId: z.string().optional().nullable(),
    })
  ).min(1, "At least one role assignment is required"),
});

/**
 * GET /api/users
 * List all users with their roles.
 * Accessible by: company_admin, qa_manager
 */
export async function GET(request: NextRequest) {
  const startedAt = performance.now();

  try {
    const forbidden = requireRole(request, ["company_admin", "qa_manager"]);
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const pagination = getPaginationParams(searchParams);

    let countDuration = 0;
    let rowsDuration = 0;
    let relationsDuration = 0;
    const dbStartedAt = performance.now();
    const countStartedAt = performance.now();
    const totalPromise = prisma.user.count().finally(() => {
      countDuration = performance.now() - countStartedAt;
    });
    const rowsStartedAt = performance.now();
    const usersPromise = prisma.user.findMany({
        skip: pagination.skip,
        take: pagination.take,
        select: {
          id: true,
          email: true,
          fullName: true,
          phone: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          roleAssignments: {
            select: { id: true, roleKey: true, storeId: true },
          },
        },
        orderBy: { createdAt: "desc" },
      }).finally(() => {
      rowsDuration = performance.now() - rowsStartedAt;
    });
    const [total, rawUsers] = await Promise.all([totalPromise, usersPromise]);
    const relationsStartedAt = performance.now();
    const users = await attachRoleAssignmentStores(prisma, rawUsers);
    relationsDuration = performance.now() - relationsStartedAt;
    const dbDuration = performance.now() - dbStartedAt;
    
    return withServerTiming(
      response.success(users, undefined, getPaginationMeta(pagination, total)),
      [
        { name: "count", durationMs: countDuration, description: "Prisma count query" },
        { name: "rows", durationMs: rowsDuration, description: "Prisma rows query" },
        { name: "relations", durationMs: relationsDuration, description: "Role store lookup" },
        { name: "db", durationMs: dbDuration, description: "Prisma list queries" },
        { name: "total", durationMs: performance.now() - startedAt, description: "Route handler" },
      ]
    );
  } catch (error) {
    console.error("[GET /api/users] Error:", error);
    return response.error("Internal server error", 500);
  }
}

/**
 * POST /api/users
 * Create a new user with roles.
 * Accessible by: company_admin only
 */
export async function POST(request: NextRequest) {
  try {
    const forbidden = requireRole(request, ["company_admin"]);
    if (forbidden) return forbidden;

    const body = await request.json();
    const parsed = createUserSchema.safeParse(body);

    if (!parsed.success) {
      return response.error(parsed.error.errors[0].message, 400);
    }

    const { email, fullName, password, phone, roleAssignments } = parsed.data;

    // 1. Check unique email
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return response.error("Email already in use", 400);

    // 2. Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3. Create user and assignments in a transaction
    const rawUser = await prisma.user.create({
      data: {
        email,
        fullName,
        password: hashedPassword,
        phone,
        roleAssignments: {
          create: roleAssignments
        }
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        roleAssignments: {
          select: { id: true, roleKey: true, storeId: true },
        },
      }
    });
    const [user] = await attachRoleAssignmentStores(prisma, [rawUser]);
    return response.created(user, "User created successfully");
  } catch (error) {
    console.error("[POST /api/users] Error:", error);
    return response.error("Internal server error", 500);
  }
}
