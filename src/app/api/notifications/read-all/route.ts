import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  try {
    const userId = request.headers.get("x-user-id");
    if (!userId) return response.unauthorized();

    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    return response.success({ ok: true }, "Notifications marked as read");
  } catch (error) {
    console.error("Mark all notifications read error:", error);
    return response.error("Internal server error", 500);
  }
}
