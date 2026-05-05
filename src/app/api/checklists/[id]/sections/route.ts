import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { z } from "zod";

const createSectionSchema = z.object({
  groupId: z.string().min(1, "Criteria Group ID is required"),
  name: z.string().min(2, "Section name is required"),
  order: z.number().int().min(0).default(0),
});

/**
 * POST /api/checklists/[id]/sections
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const forbidden = requireRole(request, ["company_admin", "qa_manager"]);
    if (forbidden) return forbidden;

    const formId = params.id;
    const body = await request.json();
    const parsed = createSectionSchema.safeParse(body);

    if (!parsed.success) {
      return response.error(parsed.error.errors[0].message, 400);
    }

    const form = await prisma.checklistForm.findUnique({ where: { id: formId } });
    if (!form) return response.error("Checklist form not found", 404);
    if (form.status !== "draft") return response.error("Cannot modify non-draft form", 400);

    const section = await prisma.checklistSection.create({
      data: {
        ...parsed.data,
        formId
      }
    });

    return response.created(section, "Section added successfully");
  } catch (error) {
    console.error("[POST /api/checklists/[id]/sections] Error:", error);
    return response.error("Internal server error", 500);
  }
}
