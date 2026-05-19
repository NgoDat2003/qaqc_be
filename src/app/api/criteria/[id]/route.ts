import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import {
  criteriaSelect,
  criteriaUpdateSchema,
  getValidationMessage,
  normalizeCriteriaUpdateInput,
  QAM_ROLES,
} from "@/lib/qam";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const forbidden = requireRole(request, [...QAM_ROLES]);
  if (forbidden) return forbidden;

  try {
    const parsed = criteriaUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return response.error(getValidationMessage(parsed.error), 400);
    }

    const existing = await prisma.criteria.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        groupId: true,
        deductionPerError: true,
        maxDeduction: true,
        flag: true,
      },
    });

    if (!existing) {
      return response.error("Criteria not found", 404);
    }

    const input = normalizeCriteriaUpdateInput(parsed.data, existing);
    if ("error" in input && typeof input.error === "string") {
      return response.error(input.error, 400);
    }

    if (input.groupId) {
      const group = await prisma.criteriaGroup.findFirst({
        where: { id: input.groupId, isActive: true },
        select: { id: true },
      });
      if (!group) {
        return response.error("Criteria group not found or inactive", 400);
      }
    }

    const criteria = await prisma.criteria.update({
      where: { id: params.id },
      data: input as any,
      select: criteriaSelect,
    });

    return response.success(criteria, "Criteria updated successfully");
  } catch (error) {
    console.error("Update criteria error:", error);
    return response.error("Internal server error", 500);
  }
}
