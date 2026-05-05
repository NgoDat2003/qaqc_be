import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { getRoles } from "@/lib/rbac";

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get("x-user-id");
    const roles = getRoles(request);
    if (!userId || roles.length === 0) return response.unauthorized();

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("storeId");

    const where: any = {};
    if (storeId) where.storeId = storeId;

    // Apply role-based scoping
    if (roles.includes("company_admin") || roles.includes("qa_manager") || roles.includes("executive_viewer")) {
      // CA, QAM, Executive can see all
    } else if (roles.includes("am")) {
      // AM only sees stores in their scope
      const amStores = await prisma.store.findMany({
        where: { amId: userId },
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
      // SM only sees their own store
      const smStores = await prisma.roleAssignment.findMany({
        where: { userId, roleKey: "store_manager" },
        select: { storeId: true }
      });
      const smStoreIds = smStores.map(s => s.storeId).filter(Boolean) as string[];
      
      if (where.storeId && !smStoreIds.includes(where.storeId)) {
         return response.success([]); // Requested store not in SM scope
      }
      if (!where.storeId) {
        where.storeId = { in: smStoreIds };
      }
    } else if (roles.includes("qc_auditor")) {
      // QC only sees audits they performed
      where.auditorId = userId;
    } else {
      return response.unauthorized();
    }

    const audits = await prisma.audit.findMany({
      where,
      include: {
        store: { select: { id: true, name: true, code: true } },
                assignment: { select: { plan: { select: { name: true } } } },
      },
      orderBy: { submittedAt: "desc" },
    });

    return response.success(audits);
  } catch (error) {
    console.error("GET Audits List Error:", error);
    return response.error("Internal server error", 500);
  }
}
