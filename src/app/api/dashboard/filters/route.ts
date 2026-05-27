import { NextRequest } from "next/server";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import {
  DASHBOARD_ROLE_BY_SCOPE,
  getDashboardFilters,
  isDashboardScope,
} from "@/lib/dashboard";
import { getRequestUser } from "@/lib/audit-workflow";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const forbidden = requireRole(request, [
      "company_admin",
      "qa_manager",
      "qc_auditor",
      "am",
      "store_manager",
      "executive_viewer",
    ]);
    if (forbidden) return forbidden;

    const { userId, roles } = getRequestUser(request);
    if (!userId) return response.unauthorized();

    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope");
    if (scope) {
      if (!isDashboardScope(scope)) {
        return response.error("Unknown dashboard scope", 404);
      }
      const scopeForbidden = requireRole(request, DASHBOARD_ROLE_BY_SCOPE[scope]);
      if (scopeForbidden) return scopeForbidden;
    }

    const data = await getDashboardFilters(userId, roles, searchParams);
    if (!data) return response.forbidden();
    return response.success(data);
  } catch (error) {
    console.error("Dashboard filters error:", error);
    return response.error("Internal server error", 500);
  }
}
