import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { getValidationMessage } from "@/lib/qam";
import {
  correctionRequestDto,
  correctionReviewSchema,
  getRequestUser,
  getStoreManagerUserIds,
  notifyUsers,
} from "@/lib/audit-workflow";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const forbidden = requireRole(request, ["qa_manager"]);
    if (forbidden) return forbidden;

    const { userId } = getRequestUser(request);
    if (!userId) return response.unauthorized();

    const body = await request.json().catch(() => ({}));
    const parsed = correctionReviewSchema.safeParse(body);
    if (!parsed.success) {
      return response.error(getValidationMessage(parsed.error), 400);
    }

    const current = await (prisma as any).auditCorrectionRequest.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        status: true,
        storeId: true,
        auditId: true,
        requestedById: true,
        audit: {
          select: {
            actionPlan: { select: { id: true } },
          },
        },
      },
    });

    if (!current) return response.error("Correction request not found", 404);
    if (current.status !== "pending") {
      return response.error("Only pending correction request can be approved", 400);
    }
    if (current.audit.actionPlan) {
      return response.error(
        "Audit already has an action plan and cannot be corrected",
        400
      );
    }

    const updated = await (prisma as any).auditCorrectionRequest.update({
      where: { id: current.id },
      data: {
        status: "approved",
        reviewedById: userId,
        reviewedAt: new Date(),
        reviewNote: parsed.data.reviewNote ?? null,
      },
      select: correctionRequestSelect,
    });

    await notifyUsers({
      userIds: await getStoreManagerUserIds(current.storeId),
      title: "Yeu cau sua audit da duoc duyet",
      message: "QA da dong y mo lai bai audit de cap nhat.",
      type: "info",
      link: `/audit-results/${current.auditId}`,
    });

    return response.success(correctionRequestDto(updated), "Correction request approved");
  } catch (error) {
    console.error("Approve audit correction request error:", error);
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
