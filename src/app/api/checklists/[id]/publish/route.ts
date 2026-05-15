import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import {
  checklistDetailSelect,
  isWeightTotalValid,
  QAM_ROLES,
} from "@/lib/qam";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const forbidden = requireRole(request, [...QAM_ROLES]);
  if (forbidden) return forbidden;

  try {
    const checklist = await prisma.checklistForm.findUnique({
      where: { id: params.id },
      select: checklistDetailSelect,
    });

    if (!checklist) {
      return response.error("Checklist not found", 404);
    }

    if (checklist.status !== "draft") {
      return response.error("Only draft checklist can be published", 400);
    }

    if (checklist.sections.length === 0) {
      return response.error("Checklist must have at least one section", 400);
    }

    if (!isWeightTotalValid(checklist.sections.map((section) => section.weight))) {
      return response.error("Checklist section weights must total 100", 400);
    }

    const criteriaIds = new Set<string>();
    for (const section of checklist.sections) {
      if (section.items.length === 0) {
        return response.error("Each checklist section must have at least one item", 400);
      }

      for (const item of section.items) {
        if (!item.criteria.isActive) {
          return response.error("Checklist cannot publish inactive criteria", 400);
        }

        if (criteriaIds.has(item.criteriaId)) {
          return response.error("Criteria cannot be duplicated in one checklist", 400);
        }
        criteriaIds.add(item.criteriaId);
      }
    }

    const published = await prisma.checklistForm.update({
      where: { id: params.id },
      data: {
        status: "published",
        publishedAt: new Date(),
      },
      select: checklistDetailSelect,
    });

    return response.success(published, "Checklist published successfully");
  } catch (error) {
    console.error("Publish checklist error:", error);
    return response.error("Internal server error", 500);
  }
}
