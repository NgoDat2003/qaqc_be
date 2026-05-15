import { prisma } from "@/lib/prisma";
import type { RoleAssignmentInput, RoleKey } from "@/lib/admin";

export async function userHasRole(userId: string, roleKey: RoleKey) {
  const assignment = await prisma.roleAssignment.findFirst({
    where: {
      userId,
      roleKey,
    },
    select: {
      id: true,
    },
  });

  return Boolean(assignment);
}

export async function activeUserHasRole(userId: string, roleKey: RoleKey) {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      isActive: true,
      roleAssignments: {
        some: {
          roleKey,
        },
      },
    },
    select: {
      id: true,
    },
  });

  return Boolean(user);
}

export async function validateRoleAssignments(
  assignments: RoleAssignmentInput[]
): Promise<string | null> {
  const roleKeys = new Set<RoleKey>();
  for (const assignment of assignments) {
    if (roleKeys.has(assignment.roleKey)) {
      return "Duplicate role assignment is not allowed";
    }
    roleKeys.add(assignment.roleKey);
  }

  const storeManagerWithoutStore = assignments.some((assignment) =>
    assignment.roleKey === "store_manager" && !assignment.storeId
  );
  if (storeManagerWithoutStore) {
    return "Store manager role requires storeId";
  }

  const storeIds = Array.from(
    new Set(
      assignments
        .map((assignment) => assignment.storeId)
        .filter((storeId): storeId is string => Boolean(storeId))
    )
  );

  if (storeIds.length === 0) return null;

  const stores = await prisma.store.findMany({
    where: {
      id: {
        in: storeIds,
      },
    },
    select: {
      id: true,
    },
  });

  if (stores.length !== storeIds.length) {
    return "Store scope not found";
  }

  return null;
}

export function isBrandCompatibleWithModelType(brandCode: string, modelType: string) {
  if (modelType === "standard") return brandCode !== "CLOUD";
  if (modelType === "cloud_kitchen") return brandCode === "CLOUD";
  return false;
}
