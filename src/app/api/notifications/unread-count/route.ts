import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get("x-user-id");
    if (!userId) return response.unauthorized();

    const count = await prisma.notification.count({
      where: { userId, isRead: false },
    });

    return response.success({ count });
  } catch (error) {
    console.error("Count unread notifications error:", error);
    return response.error("Internal server error", 500);
  }
}
