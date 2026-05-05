import { NextRequest } from "next/server";
import { response } from "./api-response";

export function getRoles(request: NextRequest): string[] {
  const rolesRaw = request.headers.get("x-user-roles");
  if (!rolesRaw) return [];
  try {
    return JSON.parse(rolesRaw);
  } catch {
    return [];
  }
}

export function hasRole(request: NextRequest, allowedRoles: string[]): boolean {
  const roles = getRoles(request);
  return roles.some((role) => allowedRoles.includes(role));
}

export function requireRole(request: NextRequest, allowedRoles: string[]) {
  if (!hasRole(request, allowedRoles)) {
    return response.forbidden();
  }
  return null; // Null means passed
}
