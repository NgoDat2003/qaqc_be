import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { getValidationMessage } from "@/lib/qam";
import {
  correctionRejectSchema,
  correctionRequestDto,
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

    const body = await request.json();
    const parsed = correctionRejectSchema.safeParse(body);
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
      },
    });

    if (!current) return response.error("Correction request not found", 404);
    if (current.status !== "pending") {
      return response.error("Only pending correction request can be rejected", 400);
    }

    const updated = await (prisma as any).auditCorrectionRequest.update({
      where: { id: current.id },
      data: {
        status: "rejected",
        reviewedById: userId,
        reviewedAt: new Date(),
        reviewNote: parsed.data.reviewNote,
      },
      select: correctionRequestSelect,
    });

    await notifyUsers({
      userIds: await getStoreManagerUserIds(current.storeId),
      title: "Yeu cau sua audit bi tu choi",
      message: "QA da tu choi yeu cau mo lai bai audit.",
      type: "warning",
      link: `/audit-results/${current.auditId}`,
    });

    return response.success(correctionRequestDto(updated), "Correction request rejected");
  } catch (error) {
    console.error("Reject audit correction request error:", error);
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
