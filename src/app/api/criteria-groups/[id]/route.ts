import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import {
  criteriaGroupSelect,
  criteriaGroupUpdateSchema,
  getValidationMessage,
  QAM_ROLES,
} from "@/lib/qam";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const forbidden = requireRole(request, [...QAM_ROLES]);
  if (forbidden) return forbidden;

  try {
    const parsed = criteriaGroupUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return response.error(getValidationMessage(parsed.error), 400);
    }

    const existing = await prisma.criteriaGroup.findUnique({
      where: { id: params.id },
      select: { id: true },
    });

    if (!existing) {
      return response.error("Criteria group not found", 404);
    }

    const group = await prisma.criteriaGroup.update({
      where: { id: params.id },
      data: parsed.data,
      select: criteriaGroupSelect,
    });

    return response.success(group, "Criteria group updated successfully");
  } catch (error) {
    console.error("Update criteria group error:", error);
    return response.error("Internal server error", 500);
  }
}
