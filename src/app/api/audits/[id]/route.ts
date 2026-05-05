import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { getRoles } from "@/lib/rbac";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get("x-user-id");
    const roles = getRoles(request);
    if (!userId || roles.length === 0) return response.unauthorized();

    const { id } = params;

    const audit = await prisma.audit.findUnique({
      where: { id },
      include: {
        groupScores: true,
        violations: {
          include: {
            criteria: true,
            evidences: true,
          },
        },
        store: true,
                assignment: {
          include: {
            plan: { include: { form: true } },
          },
        },
      },
    });

    if (!audit) return response.error("Audit not found", 404);

    // Additional Scoping checks can be done here, e.g. if SM requesting this audit, ensure store matches.
    if (roles.includes("store_manager") && !roles.includes("company_admin") && !roles.includes("qa_manager")) {
      const smStores = await prisma.roleAssignment.findMany({
        where: { userId, roleKey: "store_manager" },
      });
      const validStoreIds = smStores.map(s => s.storeId);
      if (!validStoreIds.includes(audit.storeId)) {
        return response.error("Unauthorized access to this store's audit", 403);
      }
    }

    return response.success(audit);
  } catch (error) {
    console.error("GET Audit Detail Error:", error);
    return response.error("Internal server error", 500);
  }
}
