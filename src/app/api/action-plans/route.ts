import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import {
  AP_READ_ROLES,
  actionPlanListDto,
  buildActionPlanAccessWhere,
  getRequestUser,
} from "@/lib/audit-workflow";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const forbidden = requireRole(request, [...AP_READ_ROLES]);
    if (forbidden) return forbidden;

    const { userId, roles } = getRequestUser(request);
    if (!userId) return response.unauthorized();

    const where = await buildActionPlanAccessWhere(userId, roles);
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const actionPlans = await (prisma as any).actionPlan.findMany({
      where: {
        ...where,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        store: { select: { id: true, code: true, name: true } },
        audit: {
          select: {
            id: true,
            finalScore: true,
            grade: true,
            submittedAt: true,
            auditorId: true,
            form: { select: { id: true, name: true, version: true, status: true } },
          },
        },
        _count: { select: { items: true } },
      },
    });

    const auditorIds = Array.from(
      new Set(actionPlans.map((item: any) => item.audit.auditorId).filter(Boolean))
    ) as string[];
    const auditors = await prisma.user.findMany({
      where: { id: { in: auditorIds } },
      select: { id: true, fullName: true, email: true },
    });
    const auditorById = new Map(auditors.map((user) => [user.id, user]));

    return response.success(
      actionPlans.map((actionPlan: any) => actionPlanListDto(actionPlan, auditorById))
    );
  } catch (error) {
    console.error("List action plans error:", error);
    return response.error("Internal server error", 500);
  }
}
