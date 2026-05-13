export type CriteriaInput = {
  id: string;
  groupId: string;
  groupCode: string;
  maxScore: number;
  maxDeduction?: number;
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
      reachedScore: 100,
      maxScore: 100,
      percentage: 0,
      triggeredCritical: false,
    };
  });

  let isRiskTriggered = false;

  // 1. Tru diem theo loi va kiem tra RISK/Critical.
  items.forEach((item) => {
    const group = groups[item.groupId];
    if (!group) return;

    if (item.numErrors <= 0) return;

    // RISK lam toan bai ve 0.
    if (item.flag === "risk") {
      isRiskTriggered = true;
    }

    // Critical lam group lien quan ve 0.
    if (item.flag === "critical") {
      group.triggeredCritical = true;
    }
    
    if (item.repeatCount >= 4) {
      group.triggeredCritical = true;
    }

    // Tinh diem tru voi repeat multiplier.
    const multiplier = Math.min(item.repeatCount, 3);
    const uncappedDeduction = item.numErrors * item.deductionPerError * multiplier;
    const totalDeduction = Math.min(
      uncappedDeduction,
      item.maxDeduction ?? item.maxScore
    );
    
    group.reachedScore = Math.max(0, group.reachedScore - totalDeduction);
  });

  // 2. Chot diem tung group.
  let weightedTotal = 0;

  Object.values(groups).forEach((g) => {
    if (g.triggeredCritical) {
      g.percentage = 0;
    } else if (g.maxScore > 0) {
      g.percentage = (g.reachedScore / g.maxScore) * 100;
    } else {
      g.percentage = 100; // Group khong co item thi tinh du diem.
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
