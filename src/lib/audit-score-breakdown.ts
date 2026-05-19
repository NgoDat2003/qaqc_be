import type { RepeatLabel } from "./scoring";

type ImageDto = {
  id: string;
  url: string;
  fileName: string | null;
  mimeType: string | null;
};

export type AuditDeductionEffect =
  | "normal_deduction"
  | "critical_group_zero"
  | "repeat_auto_ccp_group_zero"
  | "risk_audit_zero"
  | "no_deduction";

export type AuditDeductionLine = {
  violationId: string;
  criteriaId: string;
  criteriaCode: string;
  criteriaContent: string;
  groupId: string | null;
  groupCode: string | null;
  flag: "none" | "critical" | "risk";
  numErrors: number;
  repeatCount: number;
  repeatLabel: RepeatLabel;
  multiplier: number;
  deductionPerError: number;
  maxDeduction: number;
  rawDeduction: number;
  deductedScore: number;
  effect: AuditDeductionEffect;
  note: string | null;
  images: ImageDto[];
};

export type AuditScoreBreakdown = {
  groups: Array<{
    groupId: string;
    groupCode: string;
    groupName: string;
    criteriaCount: number;
    checkedCount: number;
    uncheckedCount: number;
    isComplete: boolean;
    maxScore: number;
    deductedScore: number;
    reachedScore: number;
    weight: number;
    weightedScore: number;
    percentage: number;
    violationCount: number;
    ccpCount: number;
    triggeredCritical: boolean;
    deductions: AuditDeductionLine[];
  }>;
  risk: {
    triggered: boolean;
    count: number;
    items: AuditDeductionLine[];
  };
  totals: {
    criteriaCount: number;
    checkedCount: number;
    uncheckedCount: number;
    violationCount: number;
    ccpCount: number;
    riskCount: number;
    maxScore: number;
    deductedScore: number;
    weightedScore: number;
    finalScore: number;
    grade: "excellent" | "good" | "pass" | "fail" | "alarm";
    isComplete: boolean;
  };
  warnings: string[];
};

type AuditForBreakdown = {
  finalScore: number;
  grade: "excellent" | "good" | "pass" | "fail" | "alarm";
  isRiskTriggered: boolean;
  form: {
    sections?: Array<{
      id: string;
      weight?: number | null;
      group?: {
        id: string;
        code: string;
        name: string;
        weight?: number | null;
      } | null;
      items?: Array<{
        criteria?: CriteriaForBreakdown | null;
      }>;
    }>;
  };
  groupScores?: Array<{
    groupId: string;
    groupCode: string;
    weight: number;
    maxScore: number;
    reachedScore: number;
    percentage: number;
    triggeredCritical: boolean;
  }>;
  violations?: Array<{
    id: string;
    numErrors: number;
    repeatCount: number;
    isCriticalTriggered: boolean;
    isRiskTriggered: boolean;
    note: string | null;
    criteria: CriteriaForBreakdown;
    evidences?: ImageDto[];
  }>;
};

type CriteriaForBreakdown = {
  id: string;
  code: string;
  content: string;
  flag: "none" | "critical" | "risk" | string;
  groupId?: string | null;
  deductionPerError?: number | null;
  maxDeduction?: number | null;
  group?: {
    id: string;
    code: string;
    name: string;
  } | null;
};

function roundScore(value: number) {
  return Math.round(value * 100) / 100;
}

export function repeatLabelFromCount(repeatCount: number): RepeatLabel {
  if (repeatCount === 1) return "second";
  if (repeatCount === 2) return "third";
  if (repeatCount === 3) return "auto_ccp";
  return "first";
}

export function multiplierFromRepeatLabel(label: RepeatLabel) {
  if (label === "second") return 2;
  if (label === "third") return 3;
  return 1;
}

function imageDto(image: any): ImageDto {
  return {
    id: image.id,
    url: image.url,
    fileName: image.fileName ?? null,
    mimeType: image.mimeType ?? null,
  };
}

function normalizedFlag(flag: string): "none" | "critical" | "risk" {
  if (flag === "critical" || flag === "risk") return flag;
  return "none";
}

function buildDeductionLine(violation: NonNullable<AuditForBreakdown["violations"]>[number]) {
  const criterion = violation.criteria;
  const flag = normalizedFlag(criterion.flag);
  const repeatLabel = violation.isCriticalTriggered
    ? "auto_ccp"
    : repeatLabelFromCount(violation.repeatCount);
  const multiplier = multiplierFromRepeatLabel(repeatLabel);
  const deductionPerError = criterion.deductionPerError ?? 0;
  const maxDeduction = criterion.maxDeduction ?? 0;

  let rawDeduction = 0;
  let deductedScore = 0;
  let effect: AuditDeductionEffect = "no_deduction";

  if (violation.numErrors > 0) {
    if (flag === "risk" || violation.isRiskTriggered) {
      effect = "risk_audit_zero";
    } else if (flag === "critical") {
      effect = "critical_group_zero";
    } else if (violation.isCriticalTriggered) {
      effect = "repeat_auto_ccp_group_zero";
    } else {
      rawDeduction = violation.numErrors * deductionPerError * multiplier;
      deductedScore = Math.min(rawDeduction, maxDeduction);
      effect = deductedScore > 0 ? "normal_deduction" : "no_deduction";
    }
  }

  const group = criterion.group ?? null;

  return {
    violationId: violation.id,
    criteriaId: criterion.id,
    criteriaCode: criterion.code,
    criteriaContent: criterion.content,
    groupId: flag === "risk" ? null : criterion.groupId ?? group?.id ?? null,
    groupCode: flag === "risk" ? null : group?.code ?? null,
    flag,
    numErrors: violation.numErrors,
    repeatCount: violation.repeatCount,
    repeatLabel,
    multiplier,
    deductionPerError,
    maxDeduction,
    rawDeduction: roundScore(rawDeduction),
    deductedScore: roundScore(deductedScore),
    effect,
    note: violation.note,
    images: (violation.evidences ?? []).map(imageDto),
  } satisfies AuditDeductionLine;
}

export function buildAuditScoreBreakdown(audit: AuditForBreakdown): AuditScoreBreakdown {
  const warnings: string[] = [];
  const savedScoreByGroupId = new Map(
    (audit.groupScores ?? []).map((score) => [score.groupId, score])
  );
  const sections = audit.form.sections ?? [];
  const violations = audit.violations ?? [];
  const deductionLines = violations.map(buildDeductionLine);
  const linesByCriteriaId = deductionLines.reduce<Map<string, AuditDeductionLine[]>>(
    (map, line) => {
      const current = map.get(line.criteriaId) ?? [];
      current.push(line);
      map.set(line.criteriaId, current);
      return map;
    },
    new Map()
  );
  const riskItems = deductionLines.filter(
    (line) => line.effect === "risk_audit_zero" || line.flag === "risk"
  );

  const groups = sections
    .filter((section) => section.group)
    .map((section) => {
      const group = section.group!;
      const saved = savedScoreByGroupId.get(group.id);
      const criteria = (section.items ?? [])
        .map((item) => item.criteria)
        .filter((criteria): criteria is CriteriaForBreakdown => Boolean(criteria))
        .filter((criteria) => normalizedFlag(criteria.flag) !== "risk");
      const groupLines = criteria.flatMap(
        (criteria) => linesByCriteriaId.get(criteria.id) ?? []
      );
      const positiveLines = groupLines.filter((line) => line.numErrors > 0);
      const checkedCriteriaIds = new Set(groupLines.map((line) => line.criteriaId));
      const ccpLines = positiveLines.filter(
        (line) =>
          line.effect === "critical_group_zero" ||
          line.effect === "repeat_auto_ccp_group_zero"
      );
      const triggeredCritical = saved?.triggeredCritical ?? ccpLines.length > 0;
      const sectionMaxScore = criteria
        .filter((criteria) => normalizedFlag(criteria.flag) === "none")
        .reduce((total, criteria) => total + (criteria.maxDeduction ?? 0), 0);
      const maxScore = saved?.maxScore ?? (sectionMaxScore > 0 ? sectionMaxScore : 100);
      const reachedScore = saved?.reachedScore ?? (triggeredCritical
        ? 0
        : Math.max(
            0,
            maxScore -
              positiveLines.reduce((total, line) => total + line.deductedScore, 0)
          ));
      const weight = saved?.weight ?? section.weight ?? group.weight ?? 0;
      const deductedScore = triggeredCritical
        ? maxScore - reachedScore
        : positiveLines.reduce((total, line) => total + line.deductedScore, 0);

      if (weight === 0) {
        warnings.push(`Group ${group.code} has zero weight`);
      }

      return {
        groupId: group.id,
        groupCode: group.code,
        groupName: group.name,
        criteriaCount: criteria.length,
        checkedCount: checkedCriteriaIds.size,
        uncheckedCount: Math.max(0, criteria.length - checkedCriteriaIds.size),
        isComplete: checkedCriteriaIds.size >= criteria.length,
        maxScore: roundScore(maxScore),
        deductedScore: roundScore(deductedScore),
        reachedScore: roundScore(reachedScore),
        weight: roundScore(weight),
        weightedScore: roundScore(
          maxScore > 0 ? (reachedScore / maxScore) * weight : 0
        ),
        percentage: roundScore(
          saved?.percentage ?? (maxScore > 0 ? (reachedScore / maxScore) * 100 : 0)
        ),
        violationCount: positiveLines.length,
        ccpCount: ccpLines.length,
        triggeredCritical,
        deductions: groupLines,
      };
    });

  const totals = groups.reduce(
    (acc, group) => {
      acc.criteriaCount += group.criteriaCount;
      acc.checkedCount += group.checkedCount;
      acc.uncheckedCount += group.uncheckedCount;
      acc.violationCount += group.violationCount;
      acc.ccpCount += group.ccpCount;
      acc.maxScore += group.maxScore;
      acc.deductedScore += group.deductedScore;
      acc.weightedScore += group.weightedScore;
      acc.isComplete = acc.isComplete && group.isComplete;
      return acc;
    },
    {
      criteriaCount: 0,
      checkedCount: 0,
      uncheckedCount: 0,
      violationCount: 0,
      ccpCount: 0,
      riskCount: riskItems.filter((line) => line.numErrors > 0).length,
      maxScore: 0,
      deductedScore: 0,
      weightedScore: 0,
      finalScore: audit.finalScore,
      grade: audit.grade,
      isComplete: true,
    }
  );

  return {
    groups,
    risk: {
      triggered: audit.isRiskTriggered || riskItems.some((line) => line.numErrors > 0),
      count: totals.riskCount,
      items: riskItems,
    },
    totals: {
      ...totals,
      maxScore: roundScore(totals.maxScore),
      deductedScore: roundScore(totals.deductedScore),
      weightedScore: roundScore(totals.weightedScore),
      finalScore: roundScore(totals.finalScore),
    },
    warnings,
  };
}
