import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const forbidden = requireRole(request, ["company_admin", "qa_manager", "qc_auditor"]);
    if (forbidden) return forbidden;

    const { id } = params;

    const plan = await prisma.auditPlan.findUnique({
      where: { id },
      include: {
        form: true,
        assignments: {
          include: {
            store: true,
            auditor: { select: { id: true, fullName: true, email: true } },
            audit: { select: { id: true, finalScore: true, grade: true } },
          },
          orderBy: { scheduledDate: "asc" },
        },
      },
    });

    if (!plan) return response.error("Audit Plan not found", 404);

    return response.success(plan);
  } catch (error) {
    console.error("GET Audit Plan Detail Error:", error);
    return response.error("Internal server error", 500);
  }
}
