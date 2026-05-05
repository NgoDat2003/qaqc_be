import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { getRoles, requireRole } from "@/lib/rbac";
import { z } from "zod";

const updateActionPlanSchema = z.object({
  actionDescription: z.string().min(1, "Description is required"),
  deadline: z.string().datetime("Invalid deadline format"),
});

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get("x-user-id");
    const roles = getRoles(request);
    if (!userId || roles.length === 0) return response.unauthorized();

    const { id } = params;

    const actionPlan = await prisma.actionPlan.findUnique({
      where: { id },
      include: {
        store: true,
        audit: {
          include: {
            violations: {
              include: { criteria: true }
            }
          }
        },
      },
    });

    if (!actionPlan) return response.error("Action Plan not found", 404);

    // SM scoping
    if (roles.includes("store_manager") && !roles.includes("company_admin") && !roles.includes("qa_manager")) {
      const smStores = await prisma.roleAssignment.findMany({
        where: { userId, roleKey: "store_manager" },
      });
      const validStoreIds = smStores.map(s => s.storeId);
      if (!validStoreIds.includes(actionPlan.storeId)) {
        return response.error("Unauthorized access to this store's action plan", 403);
      }
    }

    return response.success(actionPlan);
  } catch (error) {
    console.error("GET Action Plan Detail Error:", error);
    return response.error("Internal server error", 500);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const forbidden = requireRole(request, ["store_manager", "company_admin", "qa_manager"]);
    if (forbidden) return forbidden;

    const { id } = params;
    
    const actionPlan = await prisma.actionPlan.findUnique({ where: { id } });
    if (!actionPlan) return response.error("Action Plan not found", 404);

    if (actionPlan.status !== "draft" && actionPlan.status !== "rejected") {
      return response.error("Can only update action plan in draft or rejected status", 400);
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
        return response.error("Unauthorized to update this store's action plan", 403);
      }
    }

    const body = await request.json();
    const parsed = updateActionPlanSchema.safeParse(body);

    if (!parsed.success) {
      return response.error(parsed.error.errors[0].message, 400);
    }

    const updated = await prisma.actionPlan.update({
      where: { id },
      data: {
        remediation: parsed.data.actionDescription,
        deadline: new Date(parsed.data.deadline),
      },
    });

    return response.success(updated);
  } catch (error) {
    console.error("PATCH Action Plan Error:", error);
    return response.error("Internal server error", 500);
  }
}
