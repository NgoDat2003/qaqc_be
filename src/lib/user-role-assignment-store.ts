type StoreDisplay = {
  id: string;
  code: string;
  name: string;
};

type RoleAssignmentWithStoreId = {
  storeId: string | null;
};

type UserWithRoleAssignments = {
  roleAssignments: RoleAssignmentWithStoreId[];
};

type StoreLookupClient = {
  store: {
    findMany: (args: {
      where: { id: { in: string[] } };
      select: { id: true; code: true; name: true };
    }) => Promise<StoreDisplay[]>;
  };
};

export async function attachRoleAssignmentStores<T extends UserWithRoleAssignments>(
  db: StoreLookupClient,
  users: T[]
) {
  const storeIds = Array.from(
    new Set(
      users.flatMap((user) =>
        user.roleAssignments.flatMap((assignment) =>
          assignment.storeId ? [assignment.storeId] : []
        )
      )
    )
  );

  const stores =
    storeIds.length > 0
      ? await db.store.findMany({
          where: { id: { in: storeIds } },
          select: { id: true, code: true, name: true },
        })
      : [];
  const storeById = new Map(stores.map((store) => [store.id, store]));

  return users.map((user) => ({
    ...user,
    roleAssignments: user.roleAssignments.map((assignment) => ({
      ...assignment,
      store: assignment.storeId ? storeById.get(assignment.storeId) ?? null : null,
    })),
  }));
}
