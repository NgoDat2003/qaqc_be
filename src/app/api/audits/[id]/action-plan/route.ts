import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import {
  actionPlanDetailDto,
  getQamUserIds,
  getRequestUser,
  getStoreManagerUserIds,
  isQam,
  notifyUsers,
  userCanManageStore,
} from "@/lib/audit-workflow";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const forbidden = requireRole(request, ["qa_manager", "store_manager"]);
    if (forbidden) return forbidden;

    const { userId, roles } = getRequestUser(request);
    if (!userId) return response.unauthorized();

    const audit = await (prisma as any).audit.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        storeId: true,
        submittedAt: true,
        editedAt: true,
        actionPlan: { select: { id: true } },
        correctionRequests: {
          where: { status: { in: ["pending", "approved"] } },
          orderBy: { createdAt: "desc" },
          select: { id: true, status: true, reviewedAt: true, createdAt: true },
        },
        violations: {
          where: { numErrors: { gt: 0 } },
          select: { id: true },
        },
      },
    });

    if (!audit || !audit.submittedAt) {
      return response.error("Audit result not found", 404);
    }

    if (!isQam(roles)) {
      const allowed = await userCanManageStore(audit.storeId, userId, roles);
      if (!allowed) return response.forbidden();
    }

    if (audit.actionPlan) {
      return response.error("Action plan already exists for this audit", 400);
    }

    const pendingCorrection = audit.correctionRequests.find(
      (item: any) => item.status === "pending"
    );
    if (pendingCorrection) {
      return response.error(
        "Audit has a pending correction request. Resolve it before creating AP",
        400
      );
    }

    const unappliedCorrection = audit.correctionRequests.find(
      (item: any) =>
        item.status === "approved" &&
        (!audit.editedAt ||
          (item.reviewedAt && new Date(audit.editedAt) < new Date(item.reviewedAt)))
    );
    if (unappliedCorrection) {
      return response.error(
        "Approved correction request must be applied before creating AP",
        400
      );
    }

    if (audit.violations.length === 0) {
      return response.error("Audit has no violations to create action plan", 400);
    }

    const created = await prisma.$transaction(async (tx) => {
      const actionPlan = await tx.actionPlan.create({
        data: {
          auditId: audit.id,
          storeId: audit.storeId,
          status: "draft",
        },
        select: { id: true },
      });

      await (tx as any).actionPlanItem.createMany({
        data: audit.violations.map((violation: any) => ({
          actionPlanId: actionPlan.id,
          violationId: violation.id,
        })),
      });

      return actionPlan;
    });

    const actionPlan = await loadActionPlanDetail(created.id);
    const auditor = await prisma.user.findUnique({
      where: { id: actionPlan.audit.auditorId },
      select: { id: true, fullName: true, email: true },
    });

    const notifyUserIds = isQam(roles)
      ? await getStoreManagerUserIds(audit.storeId)
      : await getQamUserIds();
    await notifyUsers({
      userIds: notifyUserIds,
      title: "Action Plan moi",
      message: "Action Plan da duoc tao tu ket qua audit.",
      type: "info",
      link: `/action-plans/${created.id}`,
    });

    return response.created(actionPlanDetailDto(actionPlan, auditor), "Action plan created");
  } catch (error) {
    console.error("Create action plan error:", error);
    return response.error("Internal server error", 500);
  }
}

async function loadActionPlanDetail(id: string) {
  return (prisma as any).actionPlan.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      status: true,
      reviewNote: true,
      reviewedAt: true,
      closedAt: true,
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
      closedBy: { select: { id: true, fullName: true, email: true } },
      reviewedBy: { select: { id: true, fullName: true, email: true } },
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          rootCause: true,
          remediation: true,
          fixedAt: true,
          assigneeName: true,
          status: true,
          evidences: {
            select: { id: true, url: true, fileName: true, mimeType: true },
          },
          violation: {
            select: {
              id: true,
              numErrors: true,
              repeatCount: true,
              isCriticalTriggered: true,
              isRiskTriggered: true,
              note: true,
              evidences: {
                select: { id: true, url: true, fileName: true, mimeType: true },
              },
              criteria: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  content: true,
                  flag: true,
                  group: { select: { id: true, code: true, name: true } },
                },
              },
            },
          },
        },
      },
    },
  });
}
