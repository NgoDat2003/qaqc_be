import { z } from "zod";
import { checklistDetailSelect, isAuditWindowOpen } from "./qam";
import { RepeatLabel } from "./scoring";

export const QC_ROLES = ["qc_auditor"] as const;

export class AuditAssignmentConflictError extends Error {
  constructor() {
    super("Audit assignment changed while the request was in progress");
    this.name = "AuditAssignmentConflictError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export const auditViolationInputSchema = z.object({
  criteriaId: z.string().trim().min(1),
  numErrors: z.number().int().min(0),
  note: z.string().trim().max(2000).nullable().optional(),
  imageIds: z.array(z.string().trim().min(1)).optional().default([]),
});

export const auditWriteSchema = z.object({
  assignmentId: z.string().trim().min(1),
  violations: z.array(auditViolationInputSchema),
});

export const auditAssignmentSessionSelect = {
  id: true,
  status: true,
  auditId: true,
  auditorId: true,
  storeId: true,
  store: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  plan: {
    select: {
      id: true,
      name: true,
      status: true,
      startDate: true,
      endDate: true,
      formId: true,
      form: {
        select: checklistDetailSelect,
      },
    },
  },
  audit: {
    select: {
      id: true,
      submittedAt: true,
      violations: {
        select: {
          id: true,
          criteriaId: true,
          numErrors: true,
          repeatCount: true,
          isCriticalTriggered: true,
          isRiskTriggered: true,
          note: true,
          evidences: {
            select: {
              id: true,
              url: true,
              fileName: true,
              mimeType: true,
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  },
} as const;

export type AuditAssignmentSession = any;

export const globalRiskCriteriaSelect = {
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
} as const;

export const auditAssignmentHistorySelect = {
  id: true,
  auditorId: true,
  storeId: true,
  store: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  plan: {
    select: {
      form: {
        select: {
          sections: {
            select: {
              items: {
                select: {
                  criteria: {
                    select: {
                      id: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

export function getRepeatState(previousViolationCount: number): {
  repeatCount: number;
  repeatLabel: RepeatLabel;
  isCriticalTriggered: boolean;
} {
  const cycleIndex = previousViolationCount % 5;

  if (cycleIndex === 1) {
    return { repeatCount: 1, repeatLabel: "second", isCriticalTriggered: false };
  }

  if (cycleIndex === 2) {
    return { repeatCount: 2, repeatLabel: "third", isCriticalTriggered: false };
  }

  if (cycleIndex === 3) {
    return { repeatCount: 3, repeatLabel: "auto_ccp", isCriticalTriggered: true };
  }

  if (cycleIndex === 4) {
    return { repeatCount: 0, repeatLabel: "reset", isCriticalTriggered: false };
  }

  return { repeatCount: 0, repeatLabel: "first", isCriticalTriggered: false };
}

export function getChecklistCriteria(assignment: AuditAssignmentSession) {
  return assignment.plan.form.sections.flatMap((section: any) =>
    section.items.map((item: any) => ({
      criteriaId: item.criteria.id,
      criterion: item.criteria,
      groupId: section.group.id,
      groupCode: section.group.code,
      weight: section.weight,
    }))
  );
}

export function getGlobalRiskCriteriaItems(riskCriteria: any[] = []) {
  return riskCriteria.map((criterion) => ({
    criteriaId: criterion.id,
    criterion,
    groupId: null,
    groupCode: "RISK",
    weight: 0,
  }));
}

export function getAuditCriteria(
  assignment: AuditAssignmentSession,
  riskCriteria: any[] = []
) {
  return [
    ...getChecklistCriteria(assignment),
    ...getGlobalRiskCriteriaItems(riskCriteria),
  ];
}

export function getChecklistCriteriaIds(assignment: any) {
  return assignment.plan.form.sections.flatMap((section: any) =>
    section.items.map((item: any) => item.criteria.id)
  );
}

export function getChecklistGroups(assignment: AuditAssignmentSession) {
  const groups = new Map<
    string,
    { id: string; code: string; weight: number }
  >();

  for (const section of assignment.plan.form.sections) {
    const current = groups.get(section.group.id);
    groups.set(section.group.id, {
      id: section.group.id,
      code: section.group.code,
      weight: (current?.weight ?? 0) + section.weight,
    });
  }

  return Array.from(groups.values());
}

export function getAuditableAssignmentError(
  assignment: AuditAssignmentSession,
  userId: string,
  now = new Date()
) {
  if (assignment.auditorId !== userId) {
    return { status: 403, message: "Assignment does not belong to current auditor" };
  }

  if (assignment.status === "completed") {
    return { status: 400, message: "Completed assignment cannot be changed" };
  }

  if (assignment.plan.status !== "open") {
    return { status: 400, message: "Audit plan is not open" };
  }

  if (!isAuditWindowOpen(assignment.plan, now)) {
    return { status: 400, message: "Audit is outside the allowed audit window" };
  }

  return null;
}

export function mapAuditSession(
  assignment: AuditAssignmentSession,
  riskCriteria: any[] = []
) {
  return {
    assignment: {
      id: assignment.id,
      status: assignment.status,
      store: assignment.store,
      plan: {
        id: assignment.plan.id,
        name: assignment.plan.name,
        status: assignment.plan.status,
        startDate: assignment.plan.startDate,
        endDate: assignment.plan.endDate,
        isAuditWindowOpen: isAuditWindowOpen(assignment.plan),
      },
    },
    checklist: assignment.plan.form,
    riskCriteria,
    audit: assignment.audit
      ? {
          id: assignment.audit.id,
          submittedAt: assignment.audit.submittedAt,
          violations: assignment.audit.violations.map((violation: any) => ({
            id: violation.id,
            criteriaId: violation.criteriaId,
            numErrors: violation.numErrors,
            repeatCount: violation.repeatCount,
            isCriticalTriggered: violation.isCriticalTriggered,
            isRiskTriggered: violation.isRiskTriggered,
            note: violation.note,
            images: violation.evidences,
          })),
        }
      : null,
  };
}

export function assertUniqueViolationCriteria(violations: Array<{ criteriaId: string }>) {
  return new Set(violations.map((violation) => violation.criteriaId)).size ===
    violations.length;
}

export function assertAssignmentClaimed(result: { count: number }) {
  if (result.count !== 1) {
    throw new AuditAssignmentConflictError();
  }
}
