import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { z } from "zod";

const createItemSchema = z.object({
  criteriaId: z.string().min(1, "Criteria ID is required"),
  order: z.number().int().min(0).default(0),
});

/**
 * POST /api/checklists/[id]/sections/[sectionId]/items
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string, sectionId: string } }
) {
  try {
    const forbidden = requireRole(request, ["company_admin", "qa_manager"]);
    if (forbidden) return forbidden;

    const { id: formId, sectionId } = params;
    const body = await request.json();
    const parsed = createItemSchema.safeParse(body);

    if (!parsed.success) {
      return response.error(parsed.error.errors[0].message, 400);
    }

    const section = await prisma.checklistSection.findUnique({
      where: { id: sectionId },
      include: { form: true }
    });

    if (!section || section.formId !== formId) {
      return response.error("Section mismatch or not found", 404);
    }

    if (section.form.status !== "draft") {
      return response.error("Cannot modify non-draft form", 400);
    }

    const item = await prisma.checklistSectionItem.create({
      data: {
        sectionId,
        criteriaId: parsed.data.criteriaId,
        order: parsed.data.order,
      }
    });

    return response.created(item, "Item added successfully");
  } catch (error) {
    console.error("[POST Checklist Item] Error:", error);
    return response.error("Internal server error", 500);
  }
}
