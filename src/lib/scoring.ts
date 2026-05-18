export type RepeatLabel = "first" | "second" | "third" | "auto_ccp" | "reset";

export type ScoringCriteria = {
  id: string;
  groupId: string;
  groupCode: string;
  deductionPerError: number;
  maxDeduction: number;
  flag: string;
};

export type ScoringGroup = {
  id: string;
  code: string;
  weight: number;
};

export type ScoringViolation = {
  criteriaId: string;
  numErrors: number;
  repeatCount: number;
  repeatLabel: RepeatLabel;
  isCriticalTriggered: boolean;
};

export type CalculatedGroupScore = {
  groupId: string;
  groupCode: string;
  weight: number;
  maxScore: number;
  reachedScore: number;
  percentage: number;
  triggeredCritical: boolean;
};

export type AuditScoreResult = {
  finalScore: number;
  grade: "excellent" | "good" | "pass" | "fail" | "alarm";
  isRiskTriggered: boolean;
  groupScores: CalculatedGroupScore[];
};

function roundScore(value: number) {
  return Math.round(value * 100) / 100;
}

function gradeFromScore(score: number): AuditScoreResult["grade"] {
  if (score < 70) return "fail";
  if (score < 85) return "pass";
  if (score < 95) return "good";
  return "excellent";
}

function multiplierFor(label: RepeatLabel) {
  if (label === "second") return 2;
  if (label === "third") return 3;
  return 1;
}

export function calculateAuditScore({
  groups,
  criteria,
  violations,
}: {
  groups: ScoringGroup[];
  criteria: ScoringCriteria[];
  violations: ScoringViolation[];
}): AuditScoreResult {
  const criteriaById = new Map(criteria.map((item) => [item.id, item]));
  const deductionsByGroup = new Map<string, number>();
  const criticalGroups = new Set<string>();
  let isRiskTriggered = false;

  for (const violation of violations) {
    if (violation.numErrors <= 0) continue;

    const criterion = criteriaById.get(violation.criteriaId);
    if (!criterion) continue;

    if (criterion.flag === "risk") {
      isRiskTriggered = true;
    }

    if (criterion.flag === "critical" || violation.isCriticalTriggered) {
      criticalGroups.add(criterion.groupId);
    }

    const rawDeduction =
      violation.numErrors *
      criterion.deductionPerError *
      multiplierFor(violation.repeatLabel);
    const cappedDeduction = Math.min(rawDeduction, criterion.maxDeduction);
    deductionsByGroup.set(
      criterion.groupId,
      (deductionsByGroup.get(criterion.groupId) ?? 0) + cappedDeduction
    );
  }

  const groupScores = groups.map((group) => {
    const maxScore = 100;
    const triggeredCritical = criticalGroups.has(group.id);
    const reachedScore = triggeredCritical
      ? 0
      : Math.max(0, maxScore - (deductionsByGroup.get(group.id) ?? 0));

    return {
      groupId: group.id,
      groupCode: group.code,
      weight: group.weight,
      maxScore,
      reachedScore: roundScore(reachedScore),
      percentage: roundScore((reachedScore / maxScore) * 100),
      triggeredCritical,
    };
  });

  const weightedScore = groupScores.reduce(
    (total, group) => total + group.reachedScore * (group.weight / 100),
    0
  );
  const finalScore = isRiskTriggered ? 0 : roundScore(weightedScore);

  return {
    finalScore,
    grade: isRiskTriggered ? "alarm" : gradeFromScore(finalScore),
    isRiskTriggered,
    groupScores,
  };
}
