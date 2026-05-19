import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { getValidationMessage } from "@/lib/qam";
import {
  getRequestUser,
  getStoreManagerUserIds,
  notifyUsers,
} from "@/lib/audit-workflow";

const rejectSchema = z.object({
  reviewNote: z.string().trim().min(3).max(2000),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const forbidden = requireRole(request, ["qa_manager"]);
    if (forbidden) return forbidden;

    const { userId } = getRequestUser(request);
    if (!userId) return response.unauthorized();

    const parsed = rejectSchema.safeParse(await request.json());
    if (!parsed.success) {
      return response.error(getValidationMessage(parsed.error), 400);
    }

    const current = await prisma.actionPlan.findUnique({
      where: { id: params.id },
      select: { id: true, status: true, storeId: true },
    });

    if (!current) return response.error("Action plan not found", 404);
    if (current.status !== "submitted") {
      return response.error("Only submitted action plan can be rejected", 400);
    }

    const updated = await (prisma as any).actionPlan.update({
      where: { id: current.id },
      data: {
        status: "rejected",
        reviewedById: userId,
        reviewedAt: new Date(),
        reviewNote: parsed.data.reviewNote,
      },
      select: { id: true, status: true, reviewNote: true, reviewedAt: true },
    });

    await notifyUsers({
      userIds: await getStoreManagerUserIds(current.storeId),
      title: "Action Plan bi tu choi",
      message: "QA da tu choi Action Plan va yeu cau cap nhat lai.",
      type: "warning",
      link: `/action-plans/${current.id}`,
    });

    return response.success(updated, "Action plan rejected");
  } catch (error) {
    console.error("Reject action plan error:", error);
    return response.error("Internal server error", 500);
  }
}
