import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { z } from "zod";

const updateCriteriaSchema = z.object({
  code: z.string().min(1).optional(),
  groupId: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  deductionPerError: z.number().min(0).optional(),
  maxDeduction: z.number().min(0).optional(),
  flag: z.enum(["none", "critical", "risk"]).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const forbidden = requireRole(request, ["qa_manager", "company_admin"]);
    if (forbidden) return forbidden;

    const { id } = params;
    const body = await request.json();
    const parsed = updateCriteriaSchema.safeParse(body);

    if (!parsed.success) {
      return response.error(parsed.error.errors[0].message, 400);
    }

    if (parsed.data.code) {
      const existing = await prisma.criteria.findFirst({
        where: { code: parsed.data.code, id: { not: id } },
      });
      if (existing) return response.error("Criteria code already exists", 400);
    }

    const criteria = await prisma.criteria.update({
      where: { id },
      data: parsed.data,
    });

    return response.success(criteria);
  } catch (error) {
    console.error("PATCH Criteria Error:", error);
    return response.error("Internal server error", 500);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const forbidden = requireRole(request, ["qa_manager", "company_admin"]);
    if (forbidden) return forbidden;

    const { id } = params;

    const criteria = await prisma.criteria.update({
      where: { id },
      data: { isActive: false },
    });

    return response.success(criteria);
  } catch (error) {
    console.error("DELETE Criteria Error:", error);
    return response.error("Internal server error", 500);
  }
}
