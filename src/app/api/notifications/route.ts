import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";

/**
 * GET /api/notifications
 * List notifications for the logged-in user.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get("x-user-id");
    if (!userId) return response.unauthorized();

    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50
    });

    return response.success(notifications);
  } catch (error) {
    console.error("[GET /api/notifications] Error:", error);
    return response.error("Internal server error", 500);
  }
}

/**
 * PATCH /api/notifications
 * Mark all notifications as read.
 */
export async function PATCH(request: NextRequest) {
  try {
    const userId = request.headers.get("x-user-id");
    if (!userId) return response.unauthorized();

    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true }
    });

    return response.success(null, "Notifications marked as read");
  } catch (error) {
    console.error("[PATCH /api/notifications] Error:", error);
    return response.error("Internal server error", 500);
  }
}
