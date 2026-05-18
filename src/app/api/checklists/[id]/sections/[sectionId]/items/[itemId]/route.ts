import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { checklistDetailSelect, QAM_ROLES } from "@/lib/qam";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; sectionId: string; itemId: string } }
) {
  const forbidden = requireRole(request, [...QAM_ROLES]);
  if (forbidden) return forbidden;

  try {
    const item = await prisma.checklistSectionItem.findUnique({
      where: { id: params.itemId },
      select: {
        id: true,
        sectionId: true,
        section: {
          select: {
            formId: true,
            form: { select: { status: true } },
          },
        },
      },
    });

    if (
      !item ||
      item.sectionId !== params.sectionId ||
      item.section.formId !== params.id
    ) {
      return response.error("Checklist item not found", 404);
    }

    if (item.section.form.status !== "draft") {
      return response.error("Only draft checklist can be changed", 400);
    }

    await prisma.checklistSectionItem.delete({
      where: { id: params.itemId },
    });

    const detail = await prisma.checklistForm.findUniqueOrThrow({
      where: { id: params.id },
      select: checklistDetailSelect,
    });

    return response.success(detail, "Checklist item deleted successfully");
  } catch (error) {
    console.error("Delete checklist item error:", error);
    return response.error("Internal server error", 500);
  }
}
