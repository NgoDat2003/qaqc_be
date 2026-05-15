import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import {
  getValidationMessage,
  toggleActiveSchema,
  userSelect,
} from "@/lib/admin";
import { invalidateAdminCache } from "@/lib/admin-cache";
import { attachRoleAssignmentStoresToUser } from "@/lib/admin-user-dto";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const forbidden = requireRole(request, ["company_admin"]);
  if (forbidden) return forbidden;

  try {
    const parsed = toggleActiveSchema.safeParse(await request.json());
    if (!parsed.success) {
      return response.error(getValidationMessage(parsed.error), 400);
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        roleAssignments: {
          select: {
            roleKey: true,
          },
        },
      },
    });

    if (!currentUser) {
      return response.error("User not found", 404);
    }

    const actorId = request.headers.get("x-user-id");
    if (parsed.data.isActive === false && actorId === params.id) {
      return response.error("You cannot disable your own account", 400);
    }

    const isCompanyAdmin = currentUser.roleAssignments.some(
      (assignment) => assignment.roleKey === "company_admin"
    );
    if (parsed.data.isActive === false && isCompanyAdmin) {
      const otherActiveAdmins = await prisma.user.count({
        where: {
          id: {
            not: params.id,
          },
          isActive: true,
          roleAssignments: {
            some: {
              roleKey: "company_admin",
            },
          },
        },
      });

      if (otherActiveAdmins === 0) {
        return response.error("At least one active company admin is required", 400);
      }
    }

    const user = await prisma.user.update({
      where: { id: params.id },
      data: {
        isActive: parsed.data.isActive,
      },
      select: userSelect,
    });

    invalidateAdminCache("users:");
    return response.success(
      await attachRoleAssignmentStoresToUser(user),
      "User status updated successfully"
    );
  } catch (error) {
    console.error("Toggle user error:", error);
    return response.error("Internal server error", 500);
  }
}
