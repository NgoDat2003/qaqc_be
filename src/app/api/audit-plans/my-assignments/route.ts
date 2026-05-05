import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";

/**
 * GET /api/audit-plans/my-assignments
 * Returns assignments assigned to the logged-in auditor.
 */
export async function GET(request: NextRequest) {
  try {
    const forbidden = requireRole(request, ["qc_auditor"]);
    if (forbidden) return forbidden;

    const auditorId = request.headers.get("x-user-id");
    if (!auditorId) return response.unauthorized();

    const assignments = await prisma.auditAssignment.findMany({
      where: {
        auditorId,
        status: { in: ["pending", "in_progress"] }
      },
      include: {
        plan: {
          include: {
            form: {
              include: {
                sections: {
                  include: {
                    items: {
                      include: { criteria: true }
                    }
                  }
                }
              }
            }
          }
        },
        store: {
          include: { brand: true }
        }
      },
      orderBy: { scheduledDate: "asc" }
    });

    return response.success(assignments);
  } catch (error) {
    console.error("[GET /api/audit-plans/my-assignments] Error:", error);
    return response.error("Internal server error", 500);
  }
}
