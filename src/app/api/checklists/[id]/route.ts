import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { z } from "zod";

const updateChecklistSchema = z.object({
  name: z.string().min(1).optional(),
  version: z.string().min(1).optional(),
});

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const forbidden = requireRole(request, ["company_admin", "qa_manager", "qc_auditor"]);
    if (forbidden) return forbidden;

    const { id } = params;

    const checklist = await prisma.checklistForm.findUnique({
      where: { id },
      include: {
        sections: {
          include: {
            group: true,
            items: {
              include: {
                criteria: true,
              },
              orderBy: { order: "asc" },
            },
          },
          orderBy: { order: "asc" },
        },
      },
    });

    if (!checklist) {
      return response.error("Checklist not found", 404);
    }

    return response.success(checklist);
  } catch (error) {
    console.error("GET Checklist Detail Error:", error);
    return response.error("Internal server error", 500);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const forbidden = requireRole(request, ["qa_manager", "company_admin"]);
    if (forbidden) return forbidden;

    const { id } = params;
    
    // Cannot edit published/archived unless specific conditions
    const current = await prisma.checklistForm.findUnique({ where: { id } });
    if (!current) return response.error("Not found", 404);
    if (current.status !== "draft") {
      return response.error("Can only edit draft checklists", 400);
    }

    const body = await request.json();
    const parsed = updateChecklistSchema.safeParse(body);

    if (!parsed.success) {
      return response.error(parsed.error.errors[0].message, 400);
    }

    const checklist = await prisma.checklistForm.update({
      where: { id },
      data: parsed.data,
    });

    return response.success(checklist);
  } catch (error) {
    console.error("PATCH Checklist Error:", error);
    return response.error("Internal server error", 500);
  }
}
