import { z } from "zod";

export const ROLE_KEYS = [
  "company_admin",
  "qa_manager",
  "qc_auditor",
  "am",
  "store_manager",
  "executive_viewer",
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

export const brandSelect = {
  id: true,
  code: true,
  name: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      stores: true,
    },
  },
} as const;

export const storeSelect = {
  id: true,
  code: true,
  name: true,
  modelType: true,
  province: true,
  ward: true,
  address: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  brandId: true,
  amId: true,
  managerId: true,
  brand: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  am: {
    select: {
      id: true,
      fullName: true,
      email: true,
    },
  },
  manager: {
    select: {
      id: true,
      fullName: true,
      email: true,
    },
  },
} as const;

export const storeDetailSelect = storeSelect;

export const userSelect = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  roleAssignments: {
    select: {
      id: true,
      roleKey: true,
      storeId: true,
    },
  },
} as const;

export const brandCreateSchema = z.object({
  code: z.string().trim().min(2).max(10).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(100),
});

export const brandUpdateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  isActive: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "At least one field is required",
});

export const storeCreateSchema = z.object({
  code: z.string().trim().min(2).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2),
  modelType: z.enum(["standard", "cloud_kitchen"]),
  brandId: z.string().trim().min(1),
  province: z.string().trim().min(1).optional(),
  ward: z.string().trim().min(1).optional(),
  address: z.string().trim().min(1).optional(),
  amId: z.string().trim().min(1).optional(),
  managerId: z.string().trim().min(1).optional(),
});

export const storeUpdateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  modelType: z.enum(["standard", "cloud_kitchen"]).optional(),
  brandId: z.string().trim().min(1).optional(),
  province: z.string().trim().min(1).nullable().optional(),
  ward: z.string().trim().min(1).nullable().optional(),
  address: z.string().trim().min(1).nullable().optional(),
  amId: z.string().trim().min(1).nullable().optional(),
  managerId: z.string().trim().min(1).nullable().optional(),
  isActive: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "At least one field is required",
});

export const assignAmSchema = z.object({
  amId: z.string().trim().min(1),
});

export const roleAssignmentInputSchema = z.object({
  roleKey: z.enum(ROLE_KEYS),
  storeId: z.string().trim().min(1).nullable().optional(),
});

export type RoleAssignmentInput = z.infer<typeof roleAssignmentInputSchema>;

export const userCreateSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  fullName: z.string().trim().min(2),
  password: z.string().min(6),
  phone: z.string().trim().min(1).optional(),
  roleAssignments: z.array(roleAssignmentInputSchema).min(1),
});

export const userUpdateSchema = z.object({
  fullName: z.string().trim().min(2).optional(),
  phone: z.string().trim().min(1).nullable().optional(),
  roleAssignments: z.array(roleAssignmentInputSchema).min(1).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "At least one field is required",
});

export const toggleActiveSchema = z.object({
  isActive: z.boolean(),
});

export function getValidationMessage(error: z.ZodError) {
  return error.issues[0]?.message ?? "Invalid input";
}

export function hasStoreManagerWithoutStore(
  assignments: Array<{ roleKey: RoleKey; storeId?: string | null }>
) {
  return assignments.some((assignment) =>
    assignment.roleKey === "store_manager" && !assignment.storeId
  );
}
