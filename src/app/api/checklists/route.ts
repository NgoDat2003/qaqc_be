import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { getPaginationMeta, getPaginationParams } from "@/lib/pagination";
import { withServerTiming } from "@/lib/server-timing";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createFormSchema = z.object({
  name: z.string().min(2, "Name is required"),
  version: z.string().min(1, "Version is required"),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
});
const checklistStatuses = ["draft", "published", "archived"] as const;

/**
 * GET /api/checklists
 */
export async function GET(request: NextRequest) {
  const startedAt = performance.now();

  try {
    const forbidden = requireRole(request, ["company_admin", "qa_manager", "qc_auditor"]);
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const pagination = getPaginationParams(searchParams);
    const status = searchParams.get("status");

    if (status && !checklistStatuses.includes(status as (typeof checklistStatuses)[number])) {
      return response.error("Invalid checklist status", 400);
    }

    const where = status ? { status } : {};

    let countDuration = 0;
    let rowsDuration = 0;
    const dbStartedAt = performance.now();
    const countStartedAt = performance.now();
    const totalPromise = prisma.checklistForm.count({ where }).finally(() => {
      countDuration = performance.now() - countStartedAt;
    });
    const rowsStartedAt = performance.now();
    const formsPromise = prisma.checklistForm.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        select: {
          id: true,
          name: true,
          version: true,
          status: true,
          publishedAt: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { sections: true, auditPlans: true, audits: true } },
        },
        orderBy: { createdAt: "desc" }
      }).finally(() => {
      rowsDuration = performance.now() - rowsStartedAt;
    });
    const [total, forms] = await Promise.all([totalPromise, formsPromise]);
    const dbDuration = performance.now() - dbStartedAt;

    return withServerTiming(
      response.success(forms, undefined, getPaginationMeta(pagination, total)),
      [
        { name: "count", durationMs: countDuration, description: "Prisma count query" },
        { name: "rows", durationMs: rowsDuration, description: "Prisma rows query" },
        { name: "db", durationMs: dbDuration, description: "Prisma list queries" },
        { name: "total", durationMs: performance.now() - startedAt, description: "Route handler" },
      ]
    );
  } catch (error) {
    console.error("[GET /api/checklists] Error:", error);
    return response.error("Internal server error", 500);
  }
}

/**
 * POST /api/checklists
 */
export async function POST(request: NextRequest) {
  try {
    const forbidden = requireRole(request, ["company_admin", "qa_manager"]);
    if (forbidden) return forbidden;

    const body = await request.json();
    const parsed = createFormSchema.safeParse(body);

    if (!parsed.success) {
      return response.error(parsed.error.errors[0].message, 400);
    }

    const form = await prisma.checklistForm.create({
      data: parsed.data
    });

    return response.created(form, "Checklist form created successfully");
  } catch (error) {
    console.error("[POST /api/checklists] Error:", error);
    return response.error("Internal server error", 500);
  }
}
