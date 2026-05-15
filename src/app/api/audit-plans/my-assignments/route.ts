import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { withServerTiming } from "@/lib/server-timing";

export const dynamic = "force-dynamic";

/**
 * GET /api/audit-plans/my-assignments
 * Returns assignments assigned to the logged-in auditor.
 */
export async function GET(request: NextRequest) {
  const startedAt = performance.now();

  try {
    const forbidden = requireRole(request, ["qc_auditor"]);
    if (forbidden) return forbidden;

    const auditorId = request.headers.get("x-user-id");
    if (!auditorId) return response.unauthorized();

    const lookupStartedAt = performance.now();
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
    const lookupDuration = performance.now() - lookupStartedAt;

    return withServerTiming(response.success(assignments), [
      { name: "lookup", durationMs: lookupDuration, description: "Assignment list query" },
      { name: "total", durationMs: performance.now() - startedAt, description: "Route handler" },
    ]);
  } catch (error) {
    console.error("[GET /api/audit-plans/my-assignments] Error:", error);
    return response.error("Internal server error", 500);
  }
}
