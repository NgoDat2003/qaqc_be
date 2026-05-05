import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { z } from "zod";
import bcrypt from "bcryptjs";

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
  try {
    const forbidden = requireRole(request, ["company_admin", "qa_manager"]);
    if (forbidden) return forbidden;

    const users = await prisma.user.findMany({
      include: {
        roleAssignments: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Security: Remove passwords from output
    const safeUsers = users.map(({ password, ...user }) => user);
    
    return response.success(safeUsers);
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
    const user = await prisma.user.create({
      data: {
        email,
        fullName,
        password: hashedPassword,
        phone,
        roleAssignments: {
          create: roleAssignments
        }
      },
      include: {
        roleAssignments: true
      }
    });

    const { password: _, ...safeUser } = user;
    return response.created(safeUser, "User created successfully");
  } catch (error) {
    console.error("[POST /api/users] Error:", error);
    return response.error("Internal server error", 500);
  }
}
