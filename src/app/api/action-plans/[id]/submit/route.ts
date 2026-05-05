import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole, getRoles } from "@/lib/rbac";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const forbidden = requireRole(request, ["store_manager", "company_admin", "qa_manager"]);
    if (forbidden) return forbidden;

    const { id } = params;

    const actionPlan = await prisma.actionPlan.findUnique({ where: { id } });
    if (!actionPlan) return response.error("Action Plan not found", 404);

    if (actionPlan.status !== "draft" && actionPlan.status !== "rejected") {
      return response.error("Can only submit action plan in draft or rejected status", 400);
    }

    if (!actionPlan.remediation || !actionPlan.deadline) {
      return response.error("Description and deadline must be filled before submitting", 400);
    }

    // Role check for SM
    const roles = getRoles(request);
    const userId = request.headers.get("x-user-id");
    if (roles.includes("store_manager") && !roles.includes("company_admin") && !roles.includes("qa_manager")) {
      const smStores = await prisma.roleAssignment.findMany({
        where: { userId: userId as string, roleKey: "store_manager" },
      });
      const validStoreIds = smStores.map(s => s.storeId);
      if (!validStoreIds.includes(actionPlan.storeId)) {
        return response.error("Unauthorized to submit this store's action plan", 403);
      }
    }

    const updated = await prisma.actionPlan.update({
      where: { id },
      data: { status: "submitted" },
    });

    return response.success(updated);
  } catch (error) {
    console.error("POST Submit Action Plan Error:", error);
    return response.error("Internal server error", 500);
  }
}
