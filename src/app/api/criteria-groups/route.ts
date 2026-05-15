import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import {
  criteriaGroupCreateSchema,
  criteriaGroupSelect,
  getValidationMessage,
  QAM_ROLES,
} from "@/lib/qam";

export async function GET(request: NextRequest) {
  const forbidden = requireRole(request, [...QAM_ROLES]);
  if (forbidden) return forbidden;

  try {
    const groups = await prisma.criteriaGroup.findMany({
      select: criteriaGroupSelect,
      orderBy: { code: "asc" },
    });

    return response.success(groups);
  } catch (error) {
    console.error("Get criteria groups error:", error);
    return response.error("Internal server error", 500);
  }
}

export async function POST(request: NextRequest) {
  const forbidden = requireRole(request, [...QAM_ROLES]);
  if (forbidden) return forbidden;

  try {
    const parsed = criteriaGroupCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return response.error(getValidationMessage(parsed.error), 400);
    }

    const duplicate = await prisma.criteriaGroup.findUnique({
      where: { code: parsed.data.code },
      select: { id: true },
    });

    if (duplicate) {
      return response.error("Criteria group code already exists", 400);
    }

    const group = await prisma.criteriaGroup.create({
      data: {
        code: parsed.data.code,
        name: parsed.data.name,
        color: parsed.data.color ?? undefined,
        isActive: parsed.data.isActive ?? true,
        weight: 0,
      },
      select: criteriaGroupSelect,
    });

    return response.created(group, "Criteria group created successfully");
  } catch (error) {
    console.error("Create criteria group error:", error);
    return response.error("Internal server error", 500);
  }
}
