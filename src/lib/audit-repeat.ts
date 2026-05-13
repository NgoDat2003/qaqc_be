export type RepeatLabel = "first" | "second" | "third" | "auto_ccp" | "reset";

export type RepeatInfo = {
  criteriaId: string;
  numErrors: number;
  repeatCount: number;
  repeatLabel: RepeatLabel;
  isCriticalTriggered: boolean;
};

type RepeatDb = {
  violation: {
    groupBy: (args: any) => Promise<Array<{ criteriaId: string; _count: { _all: number } }>>;
  };
};

export function getRepeatLabel(occurrence: number): RepeatLabel {
  if (occurrence === 2) return "second";
  if (occurrence === 3) return "third";
  if (occurrence === 4) return "auto_ccp";
  if (occurrence === 5) return "reset";
  return "first";
}

export function getEffectiveRepeatCount(occurrence: number): number {
  return occurrence === 5 ? 1 : occurrence;
}

export async function calculateRepeatInfo(
  db: RepeatDb,
  storeId: string,
  violations: Array<{ criteriaId: string; numErrors: number }>
): Promise<RepeatInfo[]> {
  const criteriaIds = Array.from(
    new Set(violations.filter((v) => v.numErrors > 0).map((v) => v.criteriaId))
  );

  if (criteriaIds.length === 0) {
    return violations.map((v) => ({
      criteriaId: v.criteriaId,
      numErrors: v.numErrors,
      repeatCount: 1,
      repeatLabel: "first",
      isCriticalTriggered: false,
    }));
  }

  const history = await db.violation.groupBy({
    by: ["criteriaId"],
    where: {
      criteriaId: { in: criteriaIds },
      numErrors: { gt: 0 },
      audit: {
        storeId,
        submittedAt: { not: null },
      },
    },
    _count: { _all: true },
  });

  const previousByCriteria = new Map(
    history.map((row) => [row.criteriaId, row._count._all])
  );

  return violations.map((v) => {
    if (v.numErrors <= 0) {
      return {
        criteriaId: v.criteriaId,
        numErrors: v.numErrors,
        repeatCount: 1,
        repeatLabel: "first",
        isCriticalTriggered: false,
      };
    }

    const previousCount = previousByCriteria.get(v.criteriaId) || 0;
    const occurrence = (previousCount % 5) + 1;
    const repeatCount = getEffectiveRepeatCount(occurrence);
    const repeatLabel = getRepeatLabel(occurrence);

    return {
      criteriaId: v.criteriaId,
      numErrors: v.numErrors,
      repeatCount,
      repeatLabel,
      isCriticalTriggered: repeatLabel === "auto_ccp",
    };
  });
}
