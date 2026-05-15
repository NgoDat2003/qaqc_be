import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { attachRoleAssignmentStores } from "@/lib/user-role-assignment-store";
import { z } from "zod";
import bcrypt from "bcryptjs";

const VALID_ROLES = ["company_admin", "qa_manager", "qc_auditor", "am", "store_manager", "executive_viewer"];

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  fullName: z.string().min(2).optional(),
  password: z.string().min(6).optional(),
  phone: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  roleAssignments: z.array(
    z.object({
      roleKey: z.enum(VALID_ROLES as [string, ...string[]]),
      storeId: z.string().optional().nullable(),
    })
  ).optional(),
});

/**
 * PATCH /api/users/[id]
 * Update user details.
 * Rule: SM Email Lock - If user is a Store Manager, email cannot be changed.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const forbidden = requireRole(request, ["company_admin"]);
    if (forbidden) return forbidden;

    const id = params.id;
    const body = await request.json();
    const parsed = updateUserSchema.safeParse(body);

    if (!parsed.success) {
      return response.error(parsed.error.errors[0].message, 400);
    }

    const { email, roleAssignments, password, ...rest } = parsed.data;

    const currentUser = await prisma.user.findUnique({
      where: { id },
      include: { roleAssignments: true }
    });

    if (!currentUser) return response.error("User not found", 404);

    // 1. SM Email Lock Enforcement
    const isSM = currentUser.roleAssignments.some(r => r.roleKey === "store_manager");
    if (isSM && email && email !== currentUser.email) {
      return response.error("Email address for Store Manager accounts is read-only", 403);
    }

    // 2. Prepare update data
    const updateData: any = { ...rest };
    
    if (email && email !== currentUser.email) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) return response.error("Email already in use", 400);
      updateData.email = email;
    }

    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    // 3. Update User and Role Assignments
    const updated = await prisma.$transaction(async (tx) => {
      // Update role assignments if provided
      if (roleAssignments) {
        await tx.roleAssignment.deleteMany({ where: { userId: id } });
        await tx.user.update({
          where: { id },
          data: {
            roleAssignments: {
              create: roleAssignments
            }
          }
        });
      }

      // Update core info
      return await tx.user.update({
        where: { id },
        data: updateData,
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
    });

    const [user] = await attachRoleAssignmentStores(prisma, [updated]);
    return response.success(user, "User updated successfully");
  } catch (error) {
    console.error("[PATCH /api/users/[id]] Error:", error);
    return response.error("Internal server error", 500);
  }
}
