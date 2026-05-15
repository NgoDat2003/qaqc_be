import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import {
  checklistDetailSelect,
  getValidationMessage,
  QAM_ROLES,
  sectionCreateSchema,
} from "@/lib/qam";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const forbidden = requireRole(request, [...QAM_ROLES]);
  if (forbidden) return forbidden;

  try {
    const parsed = sectionCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return response.error(getValidationMessage(parsed.error), 400);
    }

    const [checklist, group] = await Promise.all([
      prisma.checklistForm.findUnique({
        where: { id: params.id },
        select: { id: true, status: true },
      }),
      prisma.criteriaGroup.findFirst({
        where: { id: parsed.data.groupId, isActive: true },
        select: { id: true },
      }),
    ]);

    if (!checklist) {
      return response.error("Checklist not found", 404);
    }

    if (checklist.status !== "draft") {
      return response.error("Only draft checklist can be changed", 400);
    }

    if (!group) {
      return response.error("Criteria group not found or inactive", 400);
    }

    await prisma.checklistSection.create({
      data: {
        formId: params.id,
        name: parsed.data.name,
        groupId: parsed.data.groupId,
        weight: parsed.data.weight,
        order: parsed.data.order ?? 0,
      },
    });

    const detail = await prisma.checklistForm.findUniqueOrThrow({
      where: { id: params.id },
      select: checklistDetailSelect,
    });

    return response.created(detail, "Checklist section created successfully");
  } catch (error) {
    console.error("Create checklist section error:", error);
    return response.error("Internal server error", 500);
  }
}
