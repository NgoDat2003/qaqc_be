import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";

// GET /api/auth/me
// Middleware has already verified the JWT and injected x-user-id / x-user-roles headers.
// This endpoint fetches fresh user data from DB to ensure consistency.
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get("x-user-id");
    const roleKeysRaw = request.headers.get("x-user-roles");

    if (!userId || !roleKeysRaw) {
      return response.unauthorized();
    }

    let availableRoles: string[];
    try {
      availableRoles = JSON.parse(roleKeysRaw);
    } catch {
      return response.unauthorized("Malformed role data");
    }

    const activeRole = availableRoles.length > 0 ? availableRoles[0] : "";

    // Fetch latest user info from DB (not just from JWT)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { roleAssignments: true },
    });

    if (!user || !user.isActive) {
      return response.unauthorized("Account inactive or not found");
    }

    // Use fresh roles from DB, not from JWT (in case roles changed after login)
    const freshRoles = user.roleAssignments.map((r) => r.roleKey);
    const freshActiveRole = freshRoles.length > 0 ? freshRoles[0] : "";

    return response.success({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
      activeRole: freshActiveRole,
      availableRoles: freshRoles,
    });
  } catch (error) {
    console.error("Get ME error:", error);
    return response.error("Internal server error", 500);
  }
}
