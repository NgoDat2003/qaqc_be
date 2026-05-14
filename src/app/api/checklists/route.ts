import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { getPaginationMeta, getPaginationParams } from "@/lib/pagination";
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

    const { searchParams } = new URL(request.url);
    const pagination = getPaginationParams(searchParams);

    const [total, forms] = await prisma.$transaction([
      prisma.checklistForm.count(),
      prisma.checklistForm.findMany({
        skip: pagination.skip,
        take: pagination.take,
        select: {
          id: true,
          name: true,
          version: true,
          status: true,
          publishedAt: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { sections: true, auditPlans: true, audits: true } },
        },
        orderBy: { createdAt: "desc" }
      }),
    ]);

    return response.success(forms, undefined, getPaginationMeta(pagination, total));
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
