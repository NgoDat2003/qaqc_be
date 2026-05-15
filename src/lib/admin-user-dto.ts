import { prisma } from "@/lib/prisma";

type RoleAssignmentDto = {
  storeId?: string | null;
  store?: {
    id: string;
    code: string;
    name: string;
  } | null;
};

type UserDto = {
  roleAssignments: RoleAssignmentDto[];
};

export async function attachRoleAssignmentStores<T extends UserDto>(
  users: T[]
): Promise<T[]> {
  const storeIds = Array.from(
    new Set(
      users.flatMap((user) =>
        user.roleAssignments
          .map((assignment) => assignment.storeId)
          .filter((storeId): storeId is string => Boolean(storeId))
      )
    )
  );

  if (storeIds.length === 0) return users;

  const stores = await prisma.store.findMany({
    where: {
      id: {
        in: storeIds,
      },
    },
    select: {
      id: true,
      code: true,
      name: true,
    },
  });
  const storesById = new Map(stores.map((store) => [store.id, store]));

  return users.map((user) => ({
    ...user,
    roleAssignments: user.roleAssignments.map((assignment) => ({
      ...assignment,
      store: assignment.storeId ? storesById.get(assignment.storeId) ?? null : null,
    })),
  }));
}

export async function attachRoleAssignmentStoresToUser<T extends UserDto>(
  user: T
): Promise<T> {
  const [hydratedUser] = await attachRoleAssignmentStores([user]);
  return hydratedUser;
}
