import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import {
  checklistDetailSelect,
  getValidationMessage,
  QAM_ROLES,
  sectionItemCreateSchema,
} from "@/lib/qam";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; sectionId: string } }
) {
  const forbidden = requireRole(request, [...QAM_ROLES]);
  if (forbidden) return forbidden;

  try {
    const parsed = sectionItemCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return response.error(getValidationMessage(parsed.error), 400);
    }

    const [section, criteria] = await Promise.all([
      prisma.checklistSection.findUnique({
        where: { id: params.sectionId },
        select: {
          id: true,
          formId: true,
          groupId: true,
          form: { select: { status: true } },
        },
      }),
      prisma.criteria.findFirst({
        where: { id: parsed.data.criteriaId, isActive: true },
        select: {
          id: true,
          groupId: true,
        },
      }),
    ]);

    if (!section || section.formId !== params.id) {
      return response.error("Checklist section not found", 404);
    }

    if (section.form.status !== "draft") {
      return response.error("Only draft checklist can be changed", 400);
    }

    if (!criteria) {
      return response.error("Criteria not found or inactive", 400);
    }

    if (criteria.groupId !== section.groupId) {
      return response.error("Criteria must belong to the same group as section", 400);
    }

    const duplicate = await prisma.checklistSectionItem.findUnique({
      where: {
        sectionId_criteriaId: {
          sectionId: params.sectionId,
          criteriaId: parsed.data.criteriaId,
        },
      },
      select: { id: true },
    });

    if (duplicate) {
      return response.error("Criteria already exists in this section", 400);
    }

    await prisma.checklistSectionItem.create({
      data: {
        sectionId: params.sectionId,
        criteriaId: parsed.data.criteriaId,
        order: parsed.data.order ?? 0,
      },
    });

    const detail = await prisma.checklistForm.findUniqueOrThrow({
      where: { id: params.id },
      select: checklistDetailSelect,
    });

    return response.created(detail, "Checklist item created successfully");
  } catch (error) {
    console.error("Create checklist item error:", error);
    return response.error("Internal server error", 500);
  }
}
