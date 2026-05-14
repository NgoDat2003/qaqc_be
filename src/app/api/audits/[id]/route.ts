import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { canAccessAuditRecord, getRequestUser } from "@/lib/scope";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = getRequestUser(request);
    if (!user) return response.unauthorized();

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

    const hasAccess = await canAccessAuditRecord(prisma, user.userId, user.roles, audit);
    if (!hasAccess) {
      return response.error("Unauthorized access to this audit", 403);
    }

    return response.success(audit);
  } catch (error) {
    console.error("GET Audit Detail Error:", error);
    return response.error("Internal server error", 500);
  }
}
