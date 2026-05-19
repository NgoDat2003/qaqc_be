import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { notificationDto } from "@/lib/audit-workflow";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = request.headers.get("x-user-id");
    if (!userId) return response.unauthorized();

    const updated = await prisma.notification.updateMany({
      where: { id: params.id, userId },
      data: { isRead: true },
    });

    if (updated.count === 0) {
      return response.error("Notification not found", 404);
    }

    const notification = await prisma.notification.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        title: true,
        message: true,
        type: true,
        isRead: true,
        link: true,
        createdAt: true,
      },
    });

    return response.success(notificationDto(notification));
  } catch (error) {
    console.error("Mark notification read error:", error);
    return response.error("Internal server error", 500);
  }
}
