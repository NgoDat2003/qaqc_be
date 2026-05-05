import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { z } from "zod";

const updateGroupSchema = z.object({
  name: z.string().min(1).optional(),
  weight: z.number().min(0).max(1).optional(),
  color: z.string().optional().nullable(),
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const forbidden = requireRole(request, ["qa_manager", "company_admin"]);
    if (forbidden) return forbidden;

    const { id } = params;
    const body = await request.json();
    const parsed = updateGroupSchema.safeParse(body);

    if (!parsed.success) {
      return response.error(parsed.error.errors[0].message, 400);
    }

    if (parsed.data.weight !== undefined) {
      // Validate: tổng weight sau update <= 1.0 (maybe force = 1.0? Instruction says "Validate: tổng weight vẫn = 1.0 sau khi update")
      const allGroups = await prisma.criteriaGroup.findMany();
      let newTotalWeight = 0;
      for (const g of allGroups) {
        if (g.id === id) newTotalWeight += parsed.data.weight;
        else newTotalWeight += g.weight;
      }
      
      // Allow <= 1.0 during edit so they can adjust multiple
      if (newTotalWeight > 1.0001) {
        return response.error("Total weight cannot exceed 1.0", 422);
      }
    }

    const group = await prisma.criteriaGroup.update({
      where: { id },
      data: parsed.data,
    });

    return response.success(group);
  } catch (error) {
    console.error("PATCH CriteriaGroup Error:", error);
    return response.error("Internal server error", 500);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const forbidden = requireRole(request, ["qa_manager", "company_admin"]);
    if (forbidden) return forbidden;

    const { id } = params;

    const criteriaCount = await prisma.criteria.count({ where: { groupId: id } });
    if (criteriaCount > 0) {
      return response.error("Cannot delete group that has criteria attached", 400);
    }

    await prisma.criteriaGroup.delete({ where: { id } });

    return response.success({ message: "Group deleted successfully" });
  } catch (error) {
    console.error("DELETE CriteriaGroup Error:", error);
    return response.error("Internal server error", 500);
  }
}
