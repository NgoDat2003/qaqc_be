export type CriteriaInput = {
  id: string;
  groupId: string;
  groupCode: string;
  maxScore: number;
  deductionPerError: number;
  numErrors: number;
  repeatCount: number; // 1, 2, 3...
  flag: "none" | "critical" | "risk";
};

export type GroupWeight = {
  groupId: string;
  groupCode: string;
  weight: number;
};

export type GroupScoreResult = {
  groupId: string;
  groupCode: string;
  weight: number;
  reachedScore: number;
  maxScore: number;
  percentage: number;
  triggeredCritical: boolean;
};

export type AuditResult = {
  finalScore: number;
  groups: Record<string, GroupScoreResult>;
  isRiskTriggered: boolean;
  grade: "excellent" | "good" | "pass" | "fail" | "alarm";
};

export function calculateAuditScore(
  items: CriteriaInput[],
  groupWeights: GroupWeight[]
): AuditResult {
  const groups: Record<string, GroupScoreResult> = {};

  groupWeights.forEach((gw) => {
    groups[gw.groupId] = {
      groupId: gw.groupId,
      groupCode: gw.groupCode,
      weight: gw.weight,
      reachedScore: 0,
      maxScore: 0,
      percentage: 0,
      triggeredCritical: false,
    };
  });

  let isRiskTriggered = false;

  // 1. Calculate base points for each item & check for RISK/Critical
  items.forEach((item) => {
    const group = groups[item.groupId];
    if (!group) return;

    group.maxScore += item.maxScore;

    // Check RISK (One strike out for the whole audit)
    if (item.flag === "risk" && item.numErrors > 0) {
      isRiskTriggered = true;
    }

    // Check Critical (One strike out for the group)
    if (item.flag === "critical" && item.numErrors > 0) {
      group.triggeredCritical = true;
    }
    
    if (item.repeatCount >= 4 && item.numErrors > 0) {
      group.triggeredCritical = true;
    }

    // Calculate deduction with repeat multiplier
    const multiplier = Math.min(item.repeatCount, 3);
    const totalDeduction = item.numErrors * item.deductionPerError * multiplier;
    
    const itemReached = Math.max(0, item.maxScore - totalDeduction);
    group.reachedScore += itemReached;
  });

  // 2. Finalize Group Scores
  let weightedTotal = 0;

  Object.values(groups).forEach((g) => {
    if (g.triggeredCritical) {
      g.percentage = 0;
    } else if (g.maxScore > 0) {
      g.percentage = (g.reachedScore / g.maxScore) * 100;
    } else {
      g.percentage = 100; // No items in group = full points
    }

    const weight = groupWeights.find((w) => w.groupId === g.groupId)?.weight || 0;
    weightedTotal += g.percentage * weight;
  });

  const finalScore = isRiskTriggered ? 0 : Number(weightedTotal.toFixed(2));
  
  let grade: AuditResult["grade"] = "excellent";
  if (isRiskTriggered) grade = "alarm";
  else if (finalScore >= 95) grade = "excellent";
  else if (finalScore >= 85) grade = "good";
  else if (finalScore >= 75) grade = "pass";
  else grade = "fail";

  return {
    finalScore,
    groups,
    isRiskTriggered,
    grade,
  };
}
