import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import {
  checklistDetailSelect,
  getValidationMessage,
  QAM_ROLES,
  sectionUpdateSchema,
} from "@/lib/qam";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; sectionId: string } }
) {
  const forbidden = requireRole(request, [...QAM_ROLES]);
  if (forbidden) return forbidden;

  try {
    const parsed = sectionUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return response.error(getValidationMessage(parsed.error), 400);
    }

    const section = await prisma.checklistSection.findUnique({
      where: { id: params.sectionId },
      select: {
        id: true,
        formId: true,
        groupId: true,
        form: { select: { status: true } },
        items: {
          select: {
            criteria: {
              select: {
                groupId: true,
              },
            },
          },
        },
      },
    });

    if (!section || section.formId !== params.id) {
      return response.error("Checklist section not found", 404);
    }

    if (section.form.status !== "draft") {
      return response.error("Only draft checklist can be changed", 400);
    }

    if (parsed.data.groupId) {
      const group = await prisma.criteriaGroup.findFirst({
        where: { id: parsed.data.groupId, isActive: true },
        select: { id: true },
      });
      if (!group) {
        return response.error("Criteria group not found or inactive", 400);
      }

      const hasMismatchedItem = section.items.some(
        (item) => item.criteria.groupId !== parsed.data.groupId
      );
      if (hasMismatchedItem) {
        return response.error(
          "Cannot change section group while it contains criteria from another group",
          400
        );
      }
    }

    await prisma.checklistSection.update({
      where: { id: params.sectionId },
      data: parsed.data,
    });

    const detail = await prisma.checklistForm.findUniqueOrThrow({
      where: { id: params.id },
      select: checklistDetailSelect,
    });

    return response.success(detail, "Checklist section updated successfully");
  } catch (error) {
    console.error("Update checklist section error:", error);
    return response.error("Internal server error", 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; sectionId: string } }
) {
  const forbidden = requireRole(request, [...QAM_ROLES]);
  if (forbidden) return forbidden;

  try {
    const section = await prisma.checklistSection.findUnique({
      where: { id: params.sectionId },
      select: {
        id: true,
        formId: true,
        form: { select: { status: true } },
      },
    });

    if (!section || section.formId !== params.id) {
      return response.error("Checklist section not found", 404);
    }

    if (section.form.status !== "draft") {
      return response.error("Only draft checklist can be changed", 400);
    }

    await prisma.checklistSection.delete({
      where: { id: params.sectionId },
    });

    const detail = await prisma.checklistForm.findUniqueOrThrow({
      where: { id: params.id },
      select: checklistDetailSelect,
    });

    return response.success(detail, "Checklist section deleted successfully");
  } catch (error) {
    console.error("Delete checklist section error:", error);
    return response.error("Internal server error", 500);
  }
}
