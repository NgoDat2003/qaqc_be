import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { withServerTiming } from "@/lib/server-timing";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const startedAt = performance.now();

  try {
    const forbidden = requireRole(request, ["company_admin", "qa_manager"]);
    if (forbidden) return forbidden;

    const { id } = params;

    const lookupStartedAt = performance.now();
    const plan = await prisma.auditPlan.findUnique({
      where: { id },
      include: {
        form: true,
        assignments: {
          include: {
            store: true,
            auditor: { select: { id: true, fullName: true, email: true } },
            audit: { select: { id: true, finalScore: true, grade: true } },
          },
          orderBy: { scheduledDate: "asc" },
        },
      },
    });
    const lookupDuration = performance.now() - lookupStartedAt;

    if (!plan) return response.error("Audit Plan not found", 404);

    return withServerTiming(response.success(plan), [
      { name: "lookup", durationMs: lookupDuration, description: "Audit plan detail query" },
      { name: "total", durationMs: performance.now() - startedAt, description: "Route handler" },
    ]);
  } catch (error) {
    console.error("GET Audit Plan Detail Error:", error);
    return response.error("Internal server error", 500);
  }
}
