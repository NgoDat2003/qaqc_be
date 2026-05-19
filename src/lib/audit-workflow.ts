import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "./prisma";
import { getRoles } from "./rbac";
import {
  assertUniqueViolationCriteria,
  auditViolationInputSchema,
  getAuditCriteria,
  getChecklistGroups,
  getRepeatState,
} from "./audit";
import { calculateAuditScore } from "./scoring";

export const AUDIT_READ_ROLES = [
  "qa_manager",
  "qc_auditor",
  "store_manager",
  "am",
  "executive_viewer",
] as const;

export const AP_READ_ROLES = [
  "qa_manager",
  "store_manager",
  "am",
  "executive_viewer",
] as const;

export const correctionRequestCreateSchema = z.object({
  reason: z.string().trim().min(3).max(2000),
});

export const correctionReviewSchema = z.object({
  reviewNote: z.string().trim().min(3).max(2000).optional(),
});

export const correctionRejectSchema = z.object({
  reviewNote: z.string().trim().min(3).max(2000),
});

export const auditCorrectionSchema = z.object({
  editNote: z.string().trim().min(3).max(2000),
  violations: z.array(auditViolationInputSchema),
});

export const actionPlanItemUpdateSchema = z.object({
  itemId: z.string().trim().min(1),
  rootCause: z.string().trim().max(2000).nullable().optional(),
  remediation: z.string().trim().max(2000).nullable().optional(),
  fixedAt: z.string().datetime().nullable().optional(),
  assigneeName: z.string().trim().max(200).nullable().optional(),
  imageIds: z.array(z.string().trim().min(1)).optional(),
});

export const actionPlanUpdateSchema = z.object({
  items: z.array(actionPlanItemUpdateSchema).min(1),
});

export function getRequestUser(request: NextRequest) {
  return {
    userId: request.headers.get("x-user-id"),
    roles: getRoles(request),
  };
}

export function isQam(roles: string[]) {
  return roles.includes("qa_manager");
}

export function canReadAll(roles: string[]) {
  return roles.some((role) =>
    ["company_admin", "qa_manager", "executive_viewer"].includes(role)
  );
}

export function canReadStoreScope(roles: string[]) {
  return roles.some((role) => ["store_manager", "am"].includes(role));
}

export function canManageStore(roles: string[]) {
  return roles.includes("store_manager");
}

export async function getScopedStoreIds(userId: string, roles: string[]) {
  if (!canReadStoreScope(roles) && !canManageStore(roles)) return [];

  const [roleAssignments, stores] = await Promise.all([
    prisma.roleAssignment.findMany({
      where: {
        userId,
        roleKey: { in: ["store_manager", "am"] },
        storeId: { not: null },
      },
      select: { storeId: true },
    }),
    prisma.store.findMany({
      where: {
        OR: [{ managerId: userId }, { amId: userId }],
      },
      select: { id: true },
    }),
  ]);

  return Array.from(
    new Set([
      ...roleAssignments.map((item) => item.storeId).filter(Boolean),
      ...stores.map((item) => item.id),
    ])
  ) as string[];
}

export async function buildAuditAccessWhere(userId: string, roles: string[]) {
  if (canReadAll(roles)) return {};

  const or: any[] = [];
  if (roles.includes("qc_auditor")) {
    or.push({ auditorId: userId });
  }

  const storeIds = await getScopedStoreIds(userId, roles);
  if (storeIds.length > 0) {
    or.push({ storeId: { in: storeIds } });
  }

  if (or.length === 0) return { id: "__no_access__" };
  return { OR: or };
}

export async function buildActionPlanAccessWhere(userId: string, roles: string[]) {
  if (canReadAll(roles)) return {};

  const storeIds = await getScopedStoreIds(userId, roles);
  if (storeIds.length === 0) return { id: "__no_access__" };
  return { storeId: { in: storeIds } };
}

export async function userCanAccessAudit(audit: any, userId: string, roles: string[]) {
  if (canReadAll(roles)) return true;
  if (roles.includes("qc_auditor") && audit.auditorId === userId) return true;
  const storeIds = await getScopedStoreIds(userId, roles);
  return storeIds.includes(audit.storeId);
}

export async function userCanAccessActionPlan(actionPlan: any, userId: string, roles: string[]) {
  if (canReadAll(roles)) return true;
  const storeIds = await getScopedStoreIds(userId, roles);
  return storeIds.includes(actionPlan.storeId ?? actionPlan.store?.id);
}

export async function userCanManageStore(storeId: string, userId: string, roles: string[]) {
  if (!canManageStore(roles)) return false;
  const storeIds = await getScopedStoreIds(userId, roles);
  return storeIds.includes(storeId);
}

export function imageDto(image: any) {
  return {
    id: image.id,
    url: image.url,
    fileName: image.fileName ?? null,
    mimeType: image.mimeType ?? null,
  };
}

export function criteriaDto(criteria: any) {
  return {
    id: criteria.id,
    code: criteria.code,
    content: criteria.content,
    flag: criteria.flag,
    group: criteria.group
      ? {
          id: criteria.group.id,
          code: criteria.group.code,
          name: criteria.group.name,
        }
      : null,
  };
}

export function auditListDto(audit: any, auditorById: Map<string, any>) {
  const auditor = auditorById.get(audit.auditorId);
  return {
    id: audit.id,
    finalScore: audit.finalScore,
    grade: audit.grade,
    isRiskTriggered: audit.isRiskTriggered,
    submittedAt: audit.submittedAt,
    editedAt: audit.editedAt,
    store: audit.store,
    auditor: auditor
      ? { id: auditor.id, fullName: auditor.fullName, email: auditor.email }
      : { id: audit.auditorId, fullName: null, email: null },
    checklist: audit.form,
    actionPlan: audit.actionPlan
      ? { id: audit.actionPlan.id, status: audit.actionPlan.status }
      : null,
    pendingCorrectionRequest:
      audit.correctionRequests?.find((item: any) => item.status === "pending") ?? null,
  };
}

export function auditDetailDto(audit: any, auditor: any, scoreBreakdown?: any) {
  return {
    id: audit.id,
    finalScore: audit.finalScore,
    grade: audit.grade,
    isRiskTriggered: audit.isRiskTriggered,
    submittedAt: audit.submittedAt,
    editedAt: audit.editedAt,
    editNote: audit.editNote,
    store: audit.store,
    auditor: auditor
      ? { id: auditor.id, fullName: auditor.fullName, email: auditor.email }
      : { id: audit.auditorId, fullName: null, email: null },
    checklist: {
      id: audit.form.id,
      name: audit.form.name,
      version: audit.form.version,
      status: audit.form.status ?? null,
    },
    groupScores: audit.groupScores,
    violations: audit.violations.map((violation: any) => ({
      id: violation.id,
      criteria: criteriaDto(violation.criteria),
      numErrors: violation.numErrors,
      repeatCount: violation.repeatCount,
      isCriticalTriggered: violation.isCriticalTriggered,
      isRiskTriggered: violation.isRiskTriggered,
      note: violation.note,
      images: violation.evidences.map(imageDto),
    })),
    actionPlan: audit.actionPlan
      ? { id: audit.actionPlan.id, status: audit.actionPlan.status }
      : null,
    correctionRequests: audit.correctionRequests.map(correctionRequestDto),
    scoreBreakdown: scoreBreakdown ?? null,
  };
}

export function correctionRequestDto(request: any) {
  return {
    id: request.id,
    auditId: request.auditId,
    storeId: request.storeId,
    reason: request.reason,
    status: request.status,
    reviewNote: request.reviewNote,
    reviewedAt: request.reviewedAt,
    createdAt: request.createdAt,
    requestedBy: request.requestedBy
      ? {
          id: request.requestedBy.id,
          fullName: request.requestedBy.fullName,
          email: request.requestedBy.email,
        }
      : null,
    reviewedBy: request.reviewedBy
      ? {
          id: request.reviewedBy.id,
          fullName: request.reviewedBy.fullName,
          email: request.reviewedBy.email,
        }
      : null,
  };
}

export function actionPlanListDto(actionPlan: any, auditorById: Map<string, any>) {
  const auditor = auditorById.get(actionPlan.audit.auditorId);
  return {
    id: actionPlan.id,
    status: actionPlan.status,
    createdAt: actionPlan.createdAt,
    updatedAt: actionPlan.updatedAt,
    store: actionPlan.store,
    audit: {
      id: actionPlan.audit.id,
      finalScore: actionPlan.audit.finalScore,
      grade: actionPlan.audit.grade,
      submittedAt: actionPlan.audit.submittedAt,
      checklist: actionPlan.audit.form,
      auditor: auditor
        ? { id: auditor.id, fullName: auditor.fullName, email: auditor.email }
        : { id: actionPlan.audit.auditorId, fullName: null, email: null },
    },
    itemCount: actionPlan._count?.items ?? actionPlan.items?.length ?? 0,
  };
}

export function actionPlanDetailDto(actionPlan: any, auditor: any) {
  return {
    id: actionPlan.id,
    status: actionPlan.status,
    reviewNote: actionPlan.reviewNote,
    reviewedAt: actionPlan.reviewedAt,
    closedAt: actionPlan.closedAt,
    createdAt: actionPlan.createdAt,
    updatedAt: actionPlan.updatedAt,
    store: actionPlan.store,
    audit: {
      id: actionPlan.audit.id,
      finalScore: actionPlan.audit.finalScore,
      grade: actionPlan.audit.grade,
      submittedAt: actionPlan.audit.submittedAt,
      auditor: auditor
        ? { id: auditor.id, fullName: auditor.fullName, email: auditor.email }
        : { id: actionPlan.audit.auditorId, fullName: null, email: null },
      checklist: actionPlan.audit.form,
    },
    closedBy: actionPlan.closedBy
      ? {
          id: actionPlan.closedBy.id,
          fullName: actionPlan.closedBy.fullName,
          email: actionPlan.closedBy.email,
        }
      : null,
    reviewedBy: actionPlan.reviewedBy
      ? {
          id: actionPlan.reviewedBy.id,
          fullName: actionPlan.reviewedBy.fullName,
          email: actionPlan.reviewedBy.email,
        }
      : null,
    items: actionPlan.items.map((item: any) => ({
      id: item.id,
      rootCause: item.rootCause,
      remediation: item.remediation,
      fixedAt: item.fixedAt,
      assigneeName: item.assigneeName,
      status: item.status,
      violation: {
        id: item.violation.id,
        criteria: criteriaDto(item.violation.criteria),
        numErrors: item.violation.numErrors,
        repeatCount: item.violation.repeatCount,
        isCriticalTriggered: item.violation.isCriticalTriggered,
        isRiskTriggered: item.violation.isRiskTriggered,
        note: item.violation.note,
        images: item.violation.evidences.map(imageDto),
      },
      remediationImages: item.evidences.map(imageDto),
    })),
  };
}

export function notificationDto(notification: any) {
  return {
    id: notification.id,
    title: notification.title,
    message: notification.message,
    type: notification.type,
    isRead: notification.isRead,
    link: notification.link,
    createdAt: notification.createdAt,
  };
}

export async function getQamUserIds() {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      roleAssignments: { some: { roleKey: "qa_manager" } },
    },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

export async function getStoreManagerUserIds(storeId: string) {
  const [store, assignments] = await Promise.all([
    prisma.store.findUnique({
      where: { id: storeId },
      select: { managerId: true },
    }),
    prisma.roleAssignment.findMany({
      where: {
        storeId,
        roleKey: "store_manager",
        user: { isActive: true },
      },
      select: { userId: true },
    }),
  ]);

  return Array.from(
    new Set([
      store?.managerId,
      ...assignments.map((assignment) => assignment.userId),
    ].filter(Boolean))
  ) as string[];
}

export async function notifyUsers({
  userIds,
  title,
  message,
  type = "info",
  link,
}: {
  userIds: string[];
  title: string;
  message: string;
  type?: "info" | "warning" | "alarm";
  link?: string;
}) {
  const uniqueUserIds = Array.from(new Set(userIds)).filter(Boolean);
  if (uniqueUserIds.length === 0) return;

  await prisma.notification.createMany({
    data: uniqueUserIds.map((userId) => ({
      userId,
      title,
      message,
      type,
      link,
    })),
  });
}

export async function assertImagesAttachable(
  imageIds: string[],
  allowed: {
    auditId?: string;
    actionPlanItemIds?: string[];
  } = {}
) {
  const uniqueIds = Array.from(new Set(imageIds));
  if (uniqueIds.length === 0) return { ok: true as const };

  const images = await prisma.evidence.findMany({
    where: { id: { in: uniqueIds } },
    select: {
      id: true,
      actionPlanId: true,
      actionPlanItemId: true,
      violation: { select: { auditId: true } },
    } as any,
  });

  if (images.length !== uniqueIds.length) {
    return { ok: false as const, message: "Some images were not found" };
  }

  const allowedItemIds = new Set(allowed.actionPlanItemIds ?? []);
  const occupied = images.some((image: any) => {
    if (image.actionPlanId) return true;
    if (image.actionPlanItemId && !allowedItemIds.has(image.actionPlanItemId)) return true;
    if (image.violation && image.violation.auditId !== allowed.auditId) return true;
    return false;
  });

  if (occupied) {
    return { ok: false as const, message: "Some images are already attached elsewhere" };
  }

  return { ok: true as const };
}

export async function calculateAuditScoreFromViolations({
  audit,
  violations,
  excludeAuditId,
}: {
  audit: any;
  violations: Array<z.infer<typeof auditViolationInputSchema>>;
  excludeAuditId?: string;
}) {
  const assignmentLike = {
    storeId: audit.storeId,
    plan: {
      form: audit.form,
    },
  };
  const riskCriteria = await prisma.criteria.findMany({
    where: { flag: "risk", isActive: true },
    select: {
      id: true,
      code: true,
      content: true,
      groupId: true,
      deductionPerError: true,
      maxDeduction: true,
      flag: true,
      isActive: true,
      group: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
    orderBy: { code: "asc" },
  });
  const checklistCriteria = getAuditCriteria(assignmentLike, riskCriteria);
  const criteriaById = new Map<string, any>(
    checklistCriteria.map((item: any) => [item.criteriaId, item])
  );

  if (violations.some((violation) => !criteriaById.has(violation.criteriaId))) {
    return { ok: false as const, message: "All criteria must belong to the assigned checklist" };
  }

  if (!assertUniqueViolationCriteria(violations)) {
    return { ok: false as const, message: "Duplicate criteriaId is not allowed in one audit" };
  }

  const positiveViolations = violations.filter((violation) => violation.numErrors > 0);
  const repeatedHistory = await prisma.violation.findMany({
    where: {
      criteriaId: { in: positiveViolations.map((item) => item.criteriaId) },
      numErrors: { gt: 0 },
      auditId: excludeAuditId ? { not: excludeAuditId } : undefined,
      audit: {
        storeId: audit.storeId,
        submittedAt: { not: null },
      },
    },
    select: { criteriaId: true },
  });

  const historyCountByCriteria = repeatedHistory.reduce<Record<string, number>>(
    (counts, item) => {
      counts[item.criteriaId] = (counts[item.criteriaId] ?? 0) + 1;
      return counts;
    },
    {}
  );

  const repeatInfo = positiveViolations.map((violation) => ({
    criteriaId: violation.criteriaId,
    numErrors: violation.numErrors,
    ...getRepeatState(historyCountByCriteria[violation.criteriaId] ?? 0),
  }));
  const repeatInfoByCriteriaId = new Map(
    repeatInfo.map((item) => [item.criteriaId, item])
  );

  const score = calculateAuditScore({
    groups: getChecklistGroups(assignmentLike),
    criteria: checklistCriteria.map((item: any) => ({
      id: item.criteriaId,
      groupId: item.groupId,
      groupCode: item.groupCode,
      deductionPerError: item.criterion.deductionPerError,
      maxDeduction: item.criterion.maxDeduction,
      flag: item.criterion.flag,
    })),
    violations: positiveViolations.map((violation) => {
      const repeat = repeatInfoByCriteriaId.get(violation.criteriaId)!;
      return {
        criteriaId: violation.criteriaId,
        numErrors: violation.numErrors,
        repeatCount: repeat.repeatCount,
        repeatLabel: repeat.repeatLabel,
        isCriticalTriggered: repeat.isCriticalTriggered,
      };
    }),
  });

  return {
    ok: true as const,
    score,
    repeatInfo,
    repeatInfoByCriteriaId,
    criteriaById,
  };
}
