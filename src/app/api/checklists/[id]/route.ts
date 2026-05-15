import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import {
  checklistDetailSelect,
  checklistUpdateSchema,
  getValidationMessage,
  QAM_ROLES,
} from "@/lib/qam";

export async function GET(
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

    return response.success(checklist);
  } catch (error) {
    console.error("Get checklist detail error:", error);
    return response.error("Internal server error", 500);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const forbidden = requireRole(request, [...QAM_ROLES]);
  if (forbidden) return forbidden;

  try {
    const parsed = checklistUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return response.error(getValidationMessage(parsed.error), 400);
    }

    const existing = await prisma.checklistForm.findUnique({
      where: { id: params.id },
      select: { id: true, status: true },
    });

    if (!existing) {
      return response.error("Checklist not found", 404);
    }

    if (existing.status !== "draft") {
      return response.error("Only draft checklist can be updated", 400);
    }

    const checklist = await prisma.checklistForm.update({
      where: { id: params.id },
      data: parsed.data,
      select: checklistDetailSelect,
    });

    return response.success(checklist, "Checklist updated successfully");
  } catch (error) {
    console.error("Update checklist error:", error);
    return response.error("Internal server error", 500);
  }
}
