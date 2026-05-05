import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { z } from "zod";

const createFormSchema = z.object({
  name: z.string().min(2, "Name is required"),
  version: z.string().min(1, "Version is required"),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
});

/**
 * GET /api/checklists
 */
export async function GET(request: NextRequest) {
  try {
    const forbidden = requireRole(request, ["company_admin", "qa_manager", "qc_auditor"]);
    if (forbidden) return forbidden;

    const forms = await prisma.checklistForm.findMany({
      include: {
        sections: {
          include: {
            items: { include: { criteria: true } }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return response.success(forms);
  } catch (error) {
    console.error("[GET /api/checklists] Error:", error);
    return response.error("Internal server error", 500);
  }
}

/**
 * POST /api/checklists
 */
export async function POST(request: NextRequest) {
  try {
    const forbidden = requireRole(request, ["company_admin", "qa_manager"]);
    if (forbidden) return forbidden;

    const body = await request.json();
    const parsed = createFormSchema.safeParse(body);

    if (!parsed.success) {
      return response.error(parsed.error.errors[0].message, 400);
    }

    const form = await prisma.checklistForm.create({
      data: parsed.data
    });

    return response.created(form, "Checklist form created successfully");
  } catch (error) {
    console.error("[POST /api/checklists] Error:", error);
    return response.error("Internal server error", 500);
  }
}
