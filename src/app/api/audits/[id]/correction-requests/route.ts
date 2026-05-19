import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { getValidationMessage } from "@/lib/qam";
import {
  AUDIT_READ_ROLES,
  correctionRequestCreateSchema,
  correctionRequestDto,
  getQamUserIds,
  getRequestUser,
  notifyUsers,
  userCanAccessAudit,
  userCanManageStore,
} from "@/lib/audit-workflow";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const forbidden = requireRole(request, [...AUDIT_READ_ROLES]);
    if (forbidden) return forbidden;

    const { userId, roles } = getRequestUser(request);
    if (!userId) return response.unauthorized();

    const audit = await prisma.audit.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        storeId: true,
        auditorId: true,
        submittedAt: true,
      },
    });

    if (!audit || !audit.submittedAt) {
      return response.error("Audit result not found", 404);
    }

    const allowed = await userCanAccessAudit(audit, userId, roles);
    if (!allowed) return response.forbidden();

    const requests = await (prisma as any).auditCorrectionRequest.findMany({
      where: { auditId: audit.id },
      orderBy: { createdAt: "desc" },
      select: correctionRequestSelect,
    });

    return response.success(requests.map(correctionRequestDto));
  } catch (error) {
    console.error("List audit correction requests error:", error);
    return response.error("Internal server error", 500);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const forbidden = requireRole(request, ["store_manager"]);
    if (forbidden) return forbidden;

    const { userId, roles } = getRequestUser(request);
    if (!userId) return response.unauthorized();

    const body = await request.json();
    const parsed = correctionRequestCreateSchema.safeParse(body);
    if (!parsed.success) {
      return response.error(getValidationMessage(parsed.error), 400);
    }

    const audit = await (prisma as any).audit.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        storeId: true,
        submittedAt: true,
        actionPlan: { select: { id: true } },
        violations: {
          where: { numErrors: { gt: 0 } },
          select: { id: true },
        },
      },
    });

    if (!audit || !audit.submittedAt) {
      return response.error("Audit result not found", 404);
    }

    const allowed = await userCanManageStore(audit.storeId, userId, roles);
    if (!allowed) return response.forbidden();

    if (audit.actionPlan) {
      return response.error(
        "Audit already has an action plan and cannot be corrected",
        400
      );
    }

    if (audit.violations.length === 0) {
      return response.error("Audit has no violations to request correction", 400);
    }

    const pendingRequest = await (prisma as any).auditCorrectionRequest.findFirst({
      where: { auditId: audit.id, status: "pending" },
      select: { id: true },
    });

    if (pendingRequest) {
      return response.error("Audit already has a pending correction request", 400);
    }

    const created = await (prisma as any).auditCorrectionRequest.create({
      data: {
        auditId: audit.id,
        storeId: audit.storeId,
        requestedById: userId,
        reason: parsed.data.reason,
        status: "pending",
      },
      select: correctionRequestSelect,
    });

    await notifyUsers({
      userIds: await getQamUserIds(),
      title: "Yeu cau mo lai bai audit",
      message: "Store Manager da gui yeu cau QA xem lai bai audit.",
      type: "warning",
      link: `/audit-results/${audit.id}`,
    });

    return response.created(correctionRequestDto(created), "Correction request created");
  } catch (error) {
    console.error("Create audit correction request error:", error);
    return response.error("Internal server error", 500);
  }
}

const correctionRequestSelect = {
  id: true,
  auditId: true,
  storeId: true,
  reason: true,
  status: true,
  reviewNote: true,
  reviewedAt: true,
  createdAt: true,
  requestedBy: {
    select: { id: true, fullName: true, email: true },
  },
  reviewedBy: {
    select: { id: true, fullName: true, email: true },
  },
};
