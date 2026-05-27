import { NextRequest } from "next/server";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import {
  DASHBOARD_ROLE_BY_SCOPE,
  dashboardToCsv,
  getDashboard,
  isDashboardScope,
} from "@/lib/dashboard";
import { getRequestUser } from "@/lib/audit-workflow";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope") || "admin";

    if (!isDashboardScope(scope)) {
      return response.error("Unknown dashboard scope", 404);
    }

    const forbidden = requireRole(request, DASHBOARD_ROLE_BY_SCOPE[scope]);
    if (forbidden) return forbidden;

    const { userId, roles } = getRequestUser(request);
    if (!userId) return response.unauthorized();

    const data = await getDashboard(scope, userId, roles, searchParams);
    const csv = dashboardToCsv(data);

    return new Response(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="dashboard-${scope}.csv"`,
      },
    });
  } catch (error) {
    console.error("Dashboard export error:", error);
    return response.error("Internal server error", 500);
  }
}
