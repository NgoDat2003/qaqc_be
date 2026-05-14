import { NextRequest } from "next/server";
import { getRoles } from "./rbac";

export type RequestUser = {
  userId: string;
  roles: string[];
};

type ScopedStoreRole = "am" | "store_manager";

type ScopeDb = {
  roleAssignment: {
    findMany: (args: any) => Promise<Array<{ storeId: string | null }>>;
  };
  store: {
    findMany: (args: any) => Promise<Array<{ id: string }>>;
  };
  audit?: {
    findUnique: (args: any) => Promise<{ id: string; storeId: string; auditorId: string } | null>;
  };
  actionPlan?: {
    findUnique: (args: any) => Promise<{ id: string; storeId: string } | null>;
  };
  auditAssignment?: {
    findUnique: (args: any) => Promise<{ id: string; auditorId: string } | null>;
  };
};

export function getRequestUser(request: NextRequest): RequestUser | null {
  const userId = request.headers.get("x-user-id");
  const roles = getRoles(request);

  if (
    !userId ||
    !Array.isArray(roles) ||
    roles.length === 0 ||
    !roles.every((role) => typeof role === "string")
  ) {
    return null;
  }

  return { userId, roles };
}

export function hasAnyRole(roles: string[], allowedRoles: string[]): boolean {
  return roles.some((role) => allowedRoles.includes(role));
}

export function canReadAllQaData(roles: string[]): boolean {
  return hasAnyRole(roles, ["company_admin", "qa_manager", "executive_viewer"]);
}

export function canManageQaBusiness(roles: string[]): boolean {
  return roles.includes("qa_manager");
}

export function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

export async function getAssignedStoreIds(
  db: ScopeDb,
  userId: string,
  roleKey: ScopedStoreRole
): Promise<string[]> {
  const roleScopes = await db.roleAssignment.findMany({
    where: { userId, roleKey },
    select: { storeId: true },
  });

  const scopedIds = roleScopes.map((scope) => scope.storeId).filter(Boolean) as string[];
  const directStoreWhere = roleKey === "am" ? { amId: userId } : { managerId: userId };

  const directStores = await db.store.findMany({
    where: directStoreWhere,
    select: { id: true },
  });

  return uniqueIds([...scopedIds, ...directStores.map((store) => store.id)]);
}

export async function getReadableStoreIds(
  db: ScopeDb,
  userId: string,
  roles: string[]
): Promise<string[] | undefined> {
  if (canReadAllQaData(roles)) return undefined;

  const storeIds: string[] = [];

  if (roles.includes("am")) {
    const amStoreIds = await getAssignedStoreIds(db, userId, "am");
    storeIds.push(...amStoreIds);
  }

  if (roles.includes("store_manager")) {
    const smStoreIds = await getAssignedStoreIds(db, userId, "store_manager");
    storeIds.push(...smStoreIds);
  }

  return uniqueIds(storeIds);
}

export function canReadOwnAudits(roles: string[]): boolean {
  return roles.includes("qc_auditor");
}

export async function canAccessStore(
  db: ScopeDb,
  userId: string,
  roles: string[],
  storeId: string
): Promise<boolean> {
  const readableStoreIds = await getReadableStoreIds(db, userId, roles);
  return readableStoreIds === undefined || readableStoreIds.includes(storeId);
}

export async function canAccessAuditRecord(
  db: ScopeDb,
  userId: string,
  roles: string[],
  audit: { storeId: string; auditorId: string }
): Promise<boolean> {
  if (canReadAllQaData(roles)) return true;
  if (canReadOwnAudits(roles) && audit.auditorId === userId) return true;
  return canAccessStore(db, userId, roles, audit.storeId);
}

export async function canAccessActionPlanRecord(
  db: ScopeDb,
  userId: string,
  roles: string[],
  actionPlan: { storeId: string }
): Promise<boolean> {
  return canAccessStore(db, userId, roles, actionPlan.storeId);
}

export async function assertAssignmentOwner(
  db: ScopeDb,
  userId: string,
  assignmentId: string
): Promise<boolean> {
  if (!db.auditAssignment) return false;

  const assignment = await db.auditAssignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, auditorId: true },
  });

  return assignment?.auditorId === userId;
}

export async function assertAuditAccess(
  db: ScopeDb,
  userId: string,
  roles: string[],
  auditId: string
): Promise<boolean> {
  if (!db.audit) return false;

  const audit = await db.audit.findUnique({
    where: { id: auditId },
    select: { id: true, storeId: true, auditorId: true },
  });

  if (!audit) return false;

  return canAccessAuditRecord(db, userId, roles, audit);
}

export async function assertActionPlanAccess(
  db: ScopeDb,
  userId: string,
  roles: string[],
  actionPlanId: string
): Promise<boolean> {
  if (!db.actionPlan) return false;

  const actionPlan = await db.actionPlan.findUnique({
    where: { id: actionPlanId },
    select: { id: true, storeId: true },
  });

  if (!actionPlan) return false;

  return canAccessActionPlanRecord(db, userId, roles, actionPlan);
}
