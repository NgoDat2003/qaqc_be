import { z } from "zod";

export const QAM_ROLES = ["company_admin", "qa_manager"] as const;

export const criteriaGroupSelect = {
  id: true,
  code: true,
  name: true,
  color: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const criteriaSelect = {
  id: true,
  code: true,
  content: true,
  groupId: true,
  deductionPerError: true,
  maxDeduction: true,
  flag: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  group: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
} as const;

const optionalGroupIdSchema = z.preprocess(
  (value) => (value === "" ? null : value),
  z.string().trim().min(1).nullable().optional()
);

const scoringFieldsSchema = z.object({
  deductionPerError: z.number().nonnegative().optional(),
  maxDeduction: z.number().nonnegative().optional(),
});

export const checklistListSelect = {
  id: true,
  name: true,
  version: true,
  status: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      sections: true,
      auditPlans: true,
    },
  },
} as const;

export const checklistDetailSelect = {
  id: true,
  name: true,
  version: true,
  status: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  sections: {
    select: {
      id: true,
      name: true,
      order: true,
      groupId: true,
      weight: true,
      createdAt: true,
      group: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      items: {
        select: {
          id: true,
          order: true,
          criteriaId: true,
          criteria: {
            select: criteriaSelect,
          },
        },
        orderBy: {
          order: "asc",
        },
      },
    },
    orderBy: {
      order: "asc",
    },
  },
} as const;

export const auditPlanDetailSelect = {
  id: true,
  name: true,
  type: true,
  scope: true,
  status: true,
  startDate: true,
  endDate: true,
  createdAt: true,
  updatedAt: true,
  formId: true,
  form: {
    select: {
      id: true,
      name: true,
      version: true,
      status: true,
    },
  },
  assignments: {
    select: {
      id: true,
      status: true,
      auditId: true,
      storeId: true,
      auditorId: true,
      store: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      auditor: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  },
} as const;

export const myAssignmentSelect = {
  id: true,
  status: true,
  auditId: true,
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
      form: {
        select: {
          id: true,
          name: true,
          version: true,
        },
      },
    },
  },
} as const;

export const criteriaGroupCreateSchema = z.object({
  code: z.string().trim().min(1).max(20).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(100),
  color: z.string().trim().min(1).max(32).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const criteriaGroupUpdateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  color: z.string().trim().min(1).max(32).nullable().optional(),
  isActive: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "At least one field is required",
});

export const criteriaCreateSchema = z.object({
  code: z.string().trim().min(1).max(50).transform((value) => value.toUpperCase()),
  content: z.string().trim().min(3).max(1000),
  groupId: optionalGroupIdSchema,
  deductionPerError: scoringFieldsSchema.shape.deductionPerError,
  maxDeduction: scoringFieldsSchema.shape.maxDeduction,
  flag: z.enum(["none", "critical", "risk"]).default("none"),
  isActive: z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (data.flag === "risk") {
    return;
  }

  if (!data.groupId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["groupId"],
      message: "Criteria group is required for normal and CCP criteria",
    });
  }

  if (data.flag === "critical") {
    return;
  }

  if (data.deductionPerError === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["deductionPerError"],
      message: "deductionPerError is required for normal criteria",
    });
  }

  if (data.maxDeduction === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["maxDeduction"],
      message: "maxDeduction is required for normal criteria",
    });
  }

  if (
    data.deductionPerError !== undefined &&
    data.maxDeduction !== undefined &&
    data.maxDeduction < data.deductionPerError
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["maxDeduction"],
      message: "maxDeduction must be greater than or equal to deductionPerError",
    });
  }
});

export const criteriaUpdateSchema = z.object({
  content: z.string().trim().min(3).max(1000).optional(),
  groupId: optionalGroupIdSchema,
  deductionPerError: scoringFieldsSchema.shape.deductionPerError,
  maxDeduction: scoringFieldsSchema.shape.maxDeduction,
  flag: z.enum(["none", "critical", "risk"]).optional(),
  isActive: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "At least one field is required",
});

export function normalizeCriteriaCreateInput(data: z.infer<typeof criteriaCreateSchema>) {
  if (data.flag === "risk") {
    return {
      ...data,
      groupId: null,
      deductionPerError: 0,
      maxDeduction: 0,
    };
  }

  if (data.flag === "critical") {
    return {
      ...data,
      deductionPerError: 0,
      maxDeduction: 0,
    };
  }

  return {
    ...data,
    groupId: data.groupId!,
    deductionPerError: data.deductionPerError!,
    maxDeduction: data.maxDeduction!,
  };
}

export function normalizeCriteriaUpdateInput(
  data: z.infer<typeof criteriaUpdateSchema>,
  existing: {
    groupId: string | null;
    deductionPerError: number;
    maxDeduction: number;
    flag: string;
  }
) {
  const nextFlag = data.flag ?? existing.flag;

  if (nextFlag === "risk") {
    return {
      ...data,
      groupId: null,
      deductionPerError: 0,
      maxDeduction: 0,
    };
  }

  const nextGroupId = data.groupId ?? existing.groupId;
  if (!nextGroupId) {
    return {
      error: "Criteria group is required for normal and CCP criteria",
    } as const;
  }

  if (nextFlag === "critical") {
    return {
      ...data,
      groupId: nextGroupId,
      deductionPerError: 0,
      maxDeduction: 0,
    };
  }

  const nextDeduction = data.deductionPerError ?? existing.deductionPerError;
  const nextMax = data.maxDeduction ?? existing.maxDeduction;
  if (nextDeduction <= 0) {
    return { error: "deductionPerError is required for normal criteria" } as const;
  }
  if (nextMax <= 0) {
    return { error: "maxDeduction is required for normal criteria" } as const;
  }
  if (nextMax < nextDeduction) {
    return {
      error: "maxDeduction must be greater than or equal to deductionPerError",
    } as const;
  }

  return {
    ...data,
    groupId: nextGroupId,
    deductionPerError: nextDeduction,
    maxDeduction: nextMax,
  };
}

export const checklistCreateSchema = z.object({
  name: z.string().trim().min(2).max(150),
  version: z.string().trim().min(1).max(50),
});

export const checklistUpdateSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  version: z.string().trim().min(1).max(50).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "At least one field is required",
});

export const sectionCreateSchema = z.object({
  name: z.string().trim().min(2).max(150),
  groupId: z.string().trim().min(1),
  weight: z.number().min(0).max(100),
  order: z.number().int().min(0).optional(),
});

export const sectionUpdateSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  groupId: z.string().trim().min(1).optional(),
  weight: z.number().min(0).max(100).optional(),
  order: z.number().int().min(0).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "At least one field is required",
});

export const sectionItemCreateSchema = z.object({
  criteriaId: z.string().trim().min(1),
  order: z.number().int().min(0).optional(),
});

export const auditPlanCreateSchema = z.object({
  name: z.string().trim().min(2).max(150),
  formId: z.string().trim().min(1),
  startDate: z.string().trim().min(1),
  endDate: z.string().trim().min(1),
  assignments: z.array(z.object({
    storeId: z.string().trim().min(1),
    auditorId: z.string().trim().min(1),
  })).min(1),
});

export const auditPlanUpdateSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  formId: z.string().trim().min(1).optional(),
  startDate: z.string().trim().min(1).optional(),
  endDate: z.string().trim().min(1).optional(),
  assignments: z.array(z.object({
    storeId: z.string().trim().min(1),
    auditorId: z.string().trim().min(1),
  })).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "At least one field is required",
});

export const auditAssignmentUpdateSchema = z.object({
  auditorId: z.string().trim().min(1),
});

export function getValidationMessage(error: z.ZodError) {
  return error.issues[0]?.message ?? "Invalid input";
}

export function assertUniqueValues(values: string[]) {
  return new Set(values).size === values.length;
}

export function parseDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isValidAuditWindow(startDate: Date, endDate: Date) {
  return startDate.getTime() <= endDate.getTime();
}

export function isAuditWindowOpen(
  plan: { status: string; startDate: Date; endDate: Date },
  now = new Date()
) {
  return (
    plan.status === "open" &&
    plan.startDate.getTime() <= now.getTime() &&
    now.getTime() <= plan.endDate.getTime()
  );
}

export function assertPendingAssignmentMutable(
  assignment: { status: string; auditId: string | null }
) {
  if (assignment.status !== "pending") {
    return "Only pending assignment can be changed";
  }

  if (assignment.auditId) {
    return "Assignment already has audit data";
  }

  return null;
}

export function isWeightTotalValid(weights: number[]) {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return Math.abs(total - 100) < 0.001;
}

export function mapAuditPlan(plan: any) {
  const progress = plan.assignments.reduce(
    (summary: Record<string, number>, assignment: { status: string }) => {
      summary[assignment.status] = (summary[assignment.status] ?? 0) + 1;
      return summary;
    },
    { pending: 0, in_progress: 0, completed: 0 }
  );

  return {
    ...plan,
    progress: {
      total: plan.assignments.length,
      pending: progress.pending ?? 0,
      inProgress: progress.in_progress ?? 0,
      completed: progress.completed ?? 0,
    },
  };
}
