import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import {
  criteriaCreateSchema,
  criteriaSelect,
  getValidationMessage,
  normalizeCriteriaCreateInput,
  QAM_ROLES,
} from "@/lib/qam";

export async function GET(request: NextRequest) {
  const forbidden = requireRole(request, [...QAM_ROLES]);
  if (forbidden) return forbidden;

  try {
    const searchParams = new URL(request.url).searchParams;
    const groupId = searchParams.get("groupId")?.trim();
    const activeParam = searchParams.get("isActive")?.trim();
    const isActive =
      activeParam === undefined || activeParam === null
        ? undefined
        : activeParam === "true"
          ? true
          : activeParam === "false"
            ? false
            : undefined;

    const criteria = await prisma.criteria.findMany({
      where: {
        groupId: groupId || undefined,
        isActive,
      },
      select: criteriaSelect,
      orderBy: { code: "asc" },
    });

    return response.success(criteria);
  } catch (error) {
    console.error("Get criteria error:", error);
    return response.error("Internal server error", 500);
  }
}

export async function POST(request: NextRequest) {
  const forbidden = requireRole(request, [...QAM_ROLES]);
  if (forbidden) return forbidden;

  try {
    const parsed = criteriaCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return response.error(getValidationMessage(parsed.error), 400);
    }

    const input = normalizeCriteriaCreateInput(parsed.data);
    const [duplicate, group] = await Promise.all([
      prisma.criteria.findUnique({
        where: { code: input.code },
        select: { id: true },
      }),
      input.groupId
        ? prisma.criteriaGroup.findFirst({
            where: { id: input.groupId, isActive: true },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);

    if (duplicate) {
      return response.error("Criteria code already exists", 400);
    }

    if (input.groupId && !group) {
      return response.error("Criteria group not found or inactive", 400);
    }

    const criteria = await prisma.criteria.create({
      data: input as any,
      select: criteriaSelect,
    });

    return response.created(criteria, "Criteria created successfully");
  } catch (error) {
    console.error("Create criteria error:", error);
    return response.error("Internal server error", 500);
  }
}
