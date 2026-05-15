import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import {
  assignAmSchema,
  getValidationMessage,
  storeDetailSelect,
} from "@/lib/admin";
import { activeUserHasRole } from "@/lib/admin-db";
import { invalidateAdminCache } from "@/lib/admin-cache";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const forbidden = requireRole(request, ["company_admin"]);
  if (forbidden) return forbidden;

  try {
    const parsed = assignAmSchema.safeParse(await request.json());
    if (!parsed.success) {
      return response.error(getValidationMessage(parsed.error), 400);
    }

    const currentStore = await prisma.store.findUnique({
      where: { id: params.id },
      select: { id: true },
    });

    if (!currentStore) {
      return response.error("Store not found", 404);
    }

    if (!(await activeUserHasRole(parsed.data.amId, "am"))) {
      return response.error("AM user must be active and have am role", 400);
    }

    const store = await prisma.store.update({
      where: { id: params.id },
      data: {
        amId: parsed.data.amId,
      },
      select: storeDetailSelect,
    });

    invalidateAdminCache("stores:", "users:");
    return response.success(store, "AM assigned successfully");
  } catch (error) {
    console.error("Assign AM error:", error);
    return response.error("Internal server error", 500);
  }
}
