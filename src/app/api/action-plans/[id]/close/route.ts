import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const forbidden = requireRole(request, ["qa_manager", "company_admin"]);
    if (forbidden) return forbidden;

    const { id } = params;

    const actionPlan = await prisma.actionPlan.findUnique({ where: { id } });
    if (!actionPlan) return response.error("Action Plan not found", 404);

    if (actionPlan.status !== "confirmed") {
      return response.error("Can only close action plan in confirmed status", 400);
    }

    const updated = await prisma.actionPlan.update({
      where: { id },
      data: { status: "closed", closedAt: new Date() },
    });

    return response.success(updated);
  } catch (error) {
    console.error("POST Close Action Plan Error:", error);
    return response.error("Internal server error", 500);
  }
}
