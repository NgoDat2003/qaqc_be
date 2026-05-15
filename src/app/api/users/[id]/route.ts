import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import {
  getValidationMessage,
  userSelect,
  userUpdateSchema,
} from "@/lib/admin";
import { invalidateAdminCache } from "@/lib/admin-cache";
import { validateRoleAssignments } from "@/lib/admin-db";
import { attachRoleAssignmentStoresToUser } from "@/lib/admin-user-dto";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const forbidden = requireRole(request, ["company_admin"]);
  if (forbidden) return forbidden;

  try {
    const parsed = userUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return response.error(getValidationMessage(parsed.error), 400);
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true },
    });

    if (!currentUser) {
      return response.error("User not found", 404);
    }

    if (parsed.data.roleAssignments) {
      const roleError = await validateRoleAssignments(parsed.data.roleAssignments);
      if (roleError) {
        return response.error(roleError, 400);
      }
    }

    const user = await prisma.$transaction(async (tx) => {
      const profileData = {
        fullName: parsed.data.fullName,
        phone: parsed.data.phone,
      };
      const hasProfileUpdate = Object.values(profileData).some(
        (value) => value !== undefined
      );

      if (hasProfileUpdate) {
        await tx.user.update({
          where: { id: params.id },
          data: profileData,
          select: { id: true },
        });
      }

      if (parsed.data.roleAssignments) {
        await tx.roleAssignment.deleteMany({
          where: { userId: params.id },
        });
        await tx.roleAssignment.createMany({
          data: parsed.data.roleAssignments.map((assignment) => ({
            userId: params.id,
            roleKey: assignment.roleKey,
            storeId: assignment.storeId ?? undefined,
          })),
        });
      }

      return tx.user.findUniqueOrThrow({
        where: { id: params.id },
        select: userSelect,
      });
    });

    invalidateAdminCache("users:");
    return response.success(
      await attachRoleAssignmentStoresToUser(user),
      "User updated successfully"
    );
  } catch (error) {
    console.error("Update user error:", error);
    return response.error("Internal server error", 500);
  }
}
