import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { z } from "zod";

/**
 * answer schema:
 * - itemId: string
 * - value: number (0 for fail, 1 for pass, or custom point)
 * - isNA: boolean
 */
const calculateSchema = z.object({
  checklistId: z.string(),
  answers: z.array(z.object({
    itemId: z.string(),
    value: z.number(),
    isNA: z.boolean().default(false),
  })),
});

/**
 * POST /api/audits/calculate
 * Dry-run calculation of audit score.
 */
export async function POST(request: NextRequest) {
  try {
    const forbidden = requireRole(request, ["qc_auditor", "qa_manager", "company_admin"]);
    if (forbidden) return forbidden;

    const body = await request.json();
    const parsed = calculateSchema.safeParse(body);

    if (!parsed.success) {
      return response.error(parsed.error.errors[0].message, 400);
    }

    const { checklistId, answers } = parsed.data;

    // Fetch form structure to get max points and weights
    const form = await prisma.checklistForm.findUnique({
      where: { id: checklistId },
      include: {
        sections: {
          include: { 
            group: true,
            items: { include: { criteria: true } }
          }
        }
      }
    });

    if (!form) return response.error("Checklist form not found", 404);

    let totalPointsEarned = 0;
    let totalMaxPossible = 0;
    const sectionResults: any[] = [];

    for (const section of form.sections) {
      let sectionDeductions = 0;

      for (const item of section.items) {
        const answer = answers.find(a => a.itemId === item.id);
        if (answer && !answer.isNA) {
          const deduction = Math.min(answer.value * item.criteria.deductionPerError, item.criteria.maxDeduction);
          sectionDeductions += deduction;
        }
      }

      const reachedScore = Math.max(0, 100 - sectionDeductions);
      
      sectionResults.push({
        sectionId: section.id,
        sectionName: section.name,
        score: reachedScore,
        weight: section.group.weight
      });

      totalPointsEarned += (reachedScore * section.group.weight);
      totalMaxPossible += (100 * section.group.weight);
    }

    const finalScore = totalMaxPossible > 0 ? (totalPointsEarned / totalMaxPossible) * 100 : 0;

    return response.success({
      finalScore: parseFloat(finalScore.toFixed(2)),
      sections: sectionResults
    });
  } catch (error) {
    console.error("[POST /api/audits/calculate] Error:", error);
    return response.error("Internal server error", 500);
  }
}
