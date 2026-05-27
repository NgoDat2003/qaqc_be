import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { getValidationMessage } from "@/lib/qam";
import {
  AP_READ_ROLES,
  actionPlanDetailDto,
  actionPlanUpdateSchema,
  assertImagesAttachable,
  getRequestUser,
  userCanAccessActionPlan,
  userCanManageStore,
} from "@/lib/audit-workflow";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const forbidden = requireRole(request, [...AP_READ_ROLES]);
    if (forbidden) return forbidden;

    const { userId, roles } = getRequestUser(request);
    if (!userId) return response.unauthorized();

    const actionPlan = await loadActionPlanDetail(params.id);
    if (!actionPlan) return response.error("Action plan not found", 404);

    const allowed = await userCanAccessActionPlan(actionPlan, userId, roles);
    if (!allowed) return response.forbidden();

    const auditor = await prisma.user.findUnique({
      where: { id: actionPlan.audit.auditorId },
      select: { id: true, fullName: true, email: true },
    });

    return response.success(actionPlanDetailDto(actionPlan, auditor));
  } catch (error) {
    console.error("Get action plan error:", error);
    return response.error("Internal server error", 500);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const forbidden = requireRole(request, ["store_manager"]);
    if (forbidden) return forbidden;

    const { userId, roles } = getRequestUser(request);
    if (!userId) return response.unauthorized();

    const body = await request.json();
    const parsed = actionPlanUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return response.error(getValidationMessage(parsed.error), 400);
    }

    const actionPlan = await loadActionPlanDetail(params.id);
    if (!actionPlan) return response.error("Action plan not found", 404);

    const allowed = await userCanManageStore(actionPlan.store.id, userId, roles);
    if (!allowed) return response.forbidden();

    if (!["draft", "rejected"].includes(actionPlan.status)) {
      return response.error("Only draft or rejected action plan can be updated", 400);
    }

    const itemIds = new Set(actionPlan.items.map((item: any) => item.id));
    const unknownItem = parsed.data.items.find((item) => !itemIds.has(item.itemId));
    if (unknownItem) {
      return response.error("All action plan items must belong to this AP", 400);
    }

    for (const item of parsed.data.items) {
      const imagesCheck = await assertImagesAttachable(item.imageIds ?? [], {
        actionPlanItemIds: [item.itemId],
      });
      if (!imagesCheck.ok) return response.error(imagesCheck.message, 400);
    }

    await prisma.$transaction(async (tx) => {
      for (const item of parsed.data.items) {
        const updateData: any = {};
        if ("rootCause" in item) updateData.rootCause = item.rootCause;
        if ("remediation" in item) updateData.remediation = item.remediation;
        if ("fixedAt" in item) {
          updateData.fixedAt = item.fixedAt ? new Date(item.fixedAt) : null;
        }
        if ("assigneeName" in item) updateData.assigneeName = item.assigneeName;

        if (Object.keys(updateData).length > 0) {
          await (tx as any).actionPlanItem.update({
            where: { id: item.itemId },
            data: updateData,
          });
        }

        if (item.imageIds) {
          await tx.evidence.updateMany({
            where: { actionPlanItemId: item.itemId },
            data: { actionPlanItemId: null },
          });
          if (item.imageIds.length > 0) {
            await tx.evidence.updateMany({
              where: { id: { in: item.imageIds } },
              data: { actionPlanItemId: item.itemId },
            });
          }
        }
      }
    });

    const updated = await loadActionPlanDetail(params.id);
    const auditor = await prisma.user.findUnique({
      where: { id: updated.audit.auditorId },
      select: { id: true, fullName: true, email: true },
    });

    return response.success(actionPlanDetailDto(updated, auditor), "Action plan updated");
  } catch (error) {
    console.error("Update action plan error:", error);
    return response.error("Internal server error", 500);
  }
}

async function loadActionPlanDetail(id: string) {
  return (prisma as any).actionPlan.findUnique({
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
