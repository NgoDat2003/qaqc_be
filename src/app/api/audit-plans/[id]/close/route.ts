import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const forbidden = requireRole(request, ["qa_manager"]);
    if (forbidden) return forbidden;

    const { id } = params;

    const plan = await prisma.auditPlan.findUnique({ where: { id } });
    if (!plan) return response.error("Audit Plan not found", 404);
    if (plan.status === "closed") return response.error("Audit Plan is already closed", 400);

    const updated = await prisma.auditPlan.update({
      where: { id },
      data: { status: "closed" },
    });

    return response.success(updated);
  } catch (error) {
    console.error("PATCH Close Audit Plan Error:", error);
    return response.error("Internal server error", 500);
  }
}
