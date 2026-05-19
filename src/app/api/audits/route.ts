import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import {
  AUDIT_READ_ROLES,
  auditListDto,
  buildAuditAccessWhere,
  getRequestUser,
} from "@/lib/audit-workflow";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const forbidden = requireRole(request, [...AUDIT_READ_ROLES]);
  if (forbidden) return forbidden;

  const { userId, roles } = getRequestUser(request);
  if (!userId) return response.unauthorized();

  try {
    const accessWhere = await buildAuditAccessWhere(userId, roles);
    const audits = await (prisma as any).audit.findMany({
      where: {
        ...accessWhere,
        submittedAt: { not: null },
      },
      select: {
        id: true,
        auditorId: true,
        finalScore: true,
        grade: true,
        isRiskTriggered: true,
        submittedAt: true,
        editedAt: true,
        store: { select: { id: true, code: true, name: true } },
        form: { select: { id: true, name: true, version: true } },
        actionPlan: { select: { id: true, status: true } },
        correctionRequests: {
          where: { status: "pending" },
          select: { id: true, status: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { submittedAt: "desc" },
    });

    const auditorIds = Array.from(
      new Set(audits.map((audit: any) => audit.auditorId).filter(Boolean))
    ) as string[];
    const auditors = await prisma.user.findMany({
      where: { id: { in: auditorIds } },
      select: { id: true, fullName: true, email: true },
    });
    const auditorById = new Map(auditors.map((auditor) => [auditor.id, auditor]));

    return response.success(audits.map((audit: any) => auditListDto(audit, auditorById)));
  } catch (error) {
    console.error("Get audits error:", error);
    return response.error("Internal server error", 500);
  }
}
