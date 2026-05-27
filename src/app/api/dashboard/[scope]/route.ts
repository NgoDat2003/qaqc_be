import { NextRequest } from "next/server";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import {
  DASHBOARD_ROLE_BY_SCOPE,
  getDashboard,
  isDashboardScope,
} from "@/lib/dashboard";
import { getRequestUser } from "@/lib/audit-workflow";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { scope: string } }
) {
  try {
    if (!isDashboardScope(params.scope)) {
      return response.error("Unknown dashboard scope", 404);
    }

    const forbidden = requireRole(request, DASHBOARD_ROLE_BY_SCOPE[params.scope]);
    if (forbidden) return forbidden;

    const { userId, roles } = getRequestUser(request);
    if (!userId) return response.unauthorized();

    const { searchParams } = new URL(request.url);
    const data = await getDashboard(params.scope, userId, roles, searchParams);
    return response.success(data);
  } catch (error) {
    console.error("Dashboard error:", error);
    return response.error("Internal server error", 500);
  }
}
