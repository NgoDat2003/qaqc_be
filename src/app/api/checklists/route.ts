import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import {
  checklistCreateSchema,
  checklistListSelect,
  checklistDetailSelect,
  getValidationMessage,
  QAM_ROLES,
} from "@/lib/qam";

export async function GET(request: NextRequest) {
  const forbidden = requireRole(request, [...QAM_ROLES]);
  if (forbidden) return forbidden;

  try {
    const status = new URL(request.url).searchParams.get("status")?.trim();
    if (status && !["draft", "published", "archived"].includes(status)) {
      return response.error("Invalid checklist status", 400);
    }

    const checklists = await prisma.checklistForm.findMany({
      where: {
        status: status || undefined,
      },
      select: checklistListSelect,
      orderBy: [{ createdAt: "desc" }],
    });

    return response.success(checklists);
  } catch (error) {
    console.error("Get checklists error:", error);
    return response.error("Internal server error", 500);
  }
}

export async function POST(request: NextRequest) {
  const forbidden = requireRole(request, [...QAM_ROLES]);
  if (forbidden) return forbidden;

  try {
    const parsed = checklistCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return response.error(getValidationMessage(parsed.error), 400);
    }

    const checklist = await prisma.checklistForm.create({
      data: {
        name: parsed.data.name,
        version: parsed.data.version,
        status: "draft",
      },
      select: checklistDetailSelect,
    });

    return response.created(checklist, "Checklist draft created successfully");
  } catch (error) {
    console.error("Create checklist error:", error);
    return response.error("Internal server error", 500);
  }
}
