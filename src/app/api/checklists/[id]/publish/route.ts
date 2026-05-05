import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const forbidden = requireRole(request, ["qa_manager", "company_admin"]);
    if (forbidden) return forbidden;

    const { id } = params;

    const checklist = await prisma.checklistForm.findUnique({
      where: { id },
      include: {
        sections: {
          include: {
            group: true,
            _count: { select: { items: true } },
          },
        },
      },
    });

    if (!checklist) return response.error("Checklist not found", 404);
    if (checklist.status !== "draft") return response.error("Only draft checklist can be published", 400);

    // Validate 1: Must have at least 1 section
    if (checklist.sections.length === 0) {
      return response.error("Checklist must have at least one section", 422);
    }

    // Validate 2: Each section must have at least 1 criteria
    const emptySections = checklist.sections.filter(s => s._count.items === 0);
    if (emptySections.length > 0) {
      return response.error("Every section must have at least one criteria item", 422);
    }

    // Validate 3: Total weight of used groups must equal 1.0
    // Use a Set to get unique groups used in the checklist
    const usedGroupsMap = new Map();
    checklist.sections.forEach(s => {
      usedGroupsMap.set(s.groupId, s.group.weight);
    });

    let totalWeight = 0;
    usedGroupsMap.forEach((weight) => {
      totalWeight += weight;
    });

    if (Math.abs(totalWeight - 1.0) > 0.0001) {
      return response.error(`Total weight of used groups must be 1.0. Current total is ${totalWeight}`, 422);
    }

    const updated = await prisma.checklistForm.update({
      where: { id },
      data: {
        status: "published",
        publishedAt: new Date(),
      },
    });

    return response.success(updated);
  } catch (error) {
    console.error("POST Publish Checklist Error:", error);
    return response.error("Internal server error", 500);
  }
}
