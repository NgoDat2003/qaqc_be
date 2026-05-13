import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { getRoles } from "@/lib/rbac";
import { isActionPlanStatus } from "@/lib/action-plan-workflow";

async function getRoleScopedStoreIds(userId: string, roleKey: string) {
  const scopes = await prisma.roleAssignment.findMany({
    where: { userId, roleKey },
    select: { storeId: true },
  });

  return scopes.map((scope) => scope.storeId).filter(Boolean) as string[];
}

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get("x-user-id");
    const roles = getRoles(request);
    if (!userId || roles.length === 0) return response.unauthorized();

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("storeId");
    const status = searchParams.get("status");

    const where: any = {};
    if (storeId) where.storeId = storeId;
    if (status) {
      if (!isActionPlanStatus(status)) {
        return response.error("Invalid action plan status", 400);
      }
      where.status = status;
    }

    if (roles.includes("company_admin") || roles.includes("qa_manager") || roles.includes("executive_viewer")) {
      // CA, QAM, Executive can see all
    } else if (roles.includes("am")) {
      const roleScopedStoreIds = await getRoleScopedStoreIds(userId, "am");
      const amStores = await prisma.store.findMany({
        where: {
          OR: [
            { amId: userId },
            { id: { in: roleScopedStoreIds } },
          ],
        },
        select: { id: true }
      });
      const amStoreIds = amStores.map(s => s.id);
      
      if (where.storeId && !amStoreIds.includes(where.storeId)) {
        return response.success([]); // Requested store not in AM scope
      }
      if (!where.storeId) {
        where.storeId = { in: amStoreIds };
      }
    } else if (roles.includes("store_manager")) {
      const smStoreIds = await getRoleScopedStoreIds(userId, "store_manager");
      
      if (where.storeId && !smStoreIds.includes(where.storeId)) {
         return response.success([]); // Requested store not in SM scope
      }
      if (!where.storeId) {
        where.storeId = { in: smStoreIds };
      }
    } else {
      return response.unauthorized();
    }

    const actionPlans = await prisma.actionPlan.findMany({
      where,
      include: {
        store: { select: { id: true, name: true, code: true } },
        audit: { select: { id: true, finalScore: true, grade: true, submittedAt: true } },
        closedBy: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return response.success(actionPlans);
  } catch (error) {
    console.error("GET Action Plans Error:", error);
    return response.error("Internal server error", 500);
  }
}
