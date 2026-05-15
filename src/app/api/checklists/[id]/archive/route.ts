import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { checklistDetailSelect, QAM_ROLES } from "@/lib/qam";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const forbidden = requireRole(request, [...QAM_ROLES]);
  if (forbidden) return forbidden;

  try {
    const checklist = await prisma.checklistForm.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        status: true,
      },
    });

    if (!checklist) {
      return response.error("Checklist not found", 404);
    }

    if (checklist.status !== "published") {
      return response.error("Only published checklist can be archived", 400);
    }

    const archived = await prisma.checklistForm.update({
      where: { id: params.id },
      data: { status: "archived" },
      select: checklistDetailSelect,
    });

    return response.success(archived, "Checklist archived successfully");
  } catch (error) {
    console.error("Archive checklist error:", error);
    return response.error("Internal server error", 500);
  }
}
