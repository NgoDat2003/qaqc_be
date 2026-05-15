import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { canAccessAuditRecord, getRequestUser } from "@/lib/scope";
import { withServerTiming } from "@/lib/server-timing";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const startedAt = performance.now();

  try {
    const user = getRequestUser(request);
    if (!user) return response.unauthorized();

    const { id } = params;

    const lookupStartedAt = performance.now();
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
    const lookupDuration = performance.now() - lookupStartedAt;

    if (!audit) return response.error("Audit not found", 404);

    const scopeStartedAt = performance.now();
    const hasAccess = await canAccessAuditRecord(prisma, user.userId, user.roles, audit);
    const scopeDuration = performance.now() - scopeStartedAt;
    if (!hasAccess) {
      return response.error("Unauthorized access to this audit", 403);
    }

    return withServerTiming(response.success(audit), [
      { name: "lookup", durationMs: lookupDuration, description: "Audit detail query" },
      { name: "scope", durationMs: scopeDuration, description: "Scope check" },
      { name: "total", durationMs: performance.now() - startedAt, description: "Route handler" },
    ]);
  } catch (error) {
    console.error("GET Audit Detail Error:", error);
    return response.error("Internal server error", 500);
  }
}
