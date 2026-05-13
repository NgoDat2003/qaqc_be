import assert from "assert/strict";
import { calculateRepeatInfo } from "../src/lib/audit-repeat";
import {
  ACTION_PLAN_STATUSES,
  canEditActionPlan,
  canReviewActionPlan,
  canSubmitActionPlan,
  getReviewedActionPlanStatus,
  isActionPlanClosedByReview,
  isActionPlanStatus,
} from "../src/lib/action-plan-workflow";
import { calculateAuditScore, CriteriaInput, GroupWeight } from "../src/lib/scoring";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const groupWeights: GroupWeight[] = [
  { groupId: "C", groupCode: "C", weight: 0.3 },
  { groupId: "H", groupCode: "H", weight: 0.15 },
  { groupId: "P", groupCode: "P", weight: 0.15 },
  { groupId: "E", groupCode: "E", weight: 0.4 },
];

function item(overrides: Partial<CriteriaInput> = {}): CriteriaInput {
  return {
    id: "criteria-1",
    groupId: "C",
    groupCode: "C",
    maxScore: 5,
    maxDeduction: 5,
    deductionPerError: 1,
    numErrors: 1,
    repeatCount: 1,
    flag: "none",
    ...overrides,
  };
}

function repeatDb(history: Record<string, number>) {
  return {
    violation: {
      groupBy: async (args: any) => {
        const ids: string[] = args.where.criteriaId.in;
        return ids
          .filter((id) => history[id] !== undefined)
          .map((criteriaId) => ({
            criteriaId,
            _count: { _all: history[criteriaId] },
          }));
      },
    },
  };
}

const tests: TestCase[] = [
  {
    name: "scoring: tru diem thuong theo trong so group",
    run: () => {
      const result = calculateAuditScore(
        [item({ numErrors: 2, deductionPerError: 1 })],
        groupWeights
      );

      assert.equal(result.finalScore, 99.4);
      assert.equal(result.groups.C.percentage, 98);
      assert.equal(result.grade, "excellent");
    },
  },
  {
    name: "scoring: CCP dua group ve 0",
    run: () => {
      const result = calculateAuditScore(
        [item({ flag: "critical", numErrors: 1 })],
        groupWeights
      );

      assert.equal(result.groups.C.triggeredCritical, true);
      assert.equal(result.groups.C.percentage, 0);
      assert.equal(result.finalScore, 70);
    },
  },
  {
    name: "scoring: RISK dua final score ve 0 va grade alarm",
    run: () => {
      const result = calculateAuditScore(
        [item({ flag: "risk", numErrors: 1 })],
        groupWeights
      );

      assert.equal(result.isRiskTriggered, true);
      assert.equal(result.finalScore, 0);
      assert.equal(result.grade, "alarm");
    },
  },
  {
    name: "scoring: repeat lan 2 va 3 tang multiplier",
    run: () => {
      const repeat2 = calculateAuditScore(
        [item({ numErrors: 1, deductionPerError: 2, repeatCount: 2, maxDeduction: 20 })],
        groupWeights
      );
      const repeat3 = calculateAuditScore(
        [item({ numErrors: 1, deductionPerError: 2, repeatCount: 3, maxDeduction: 20 })],
        groupWeights
      );

      assert.equal(repeat2.groups.C.percentage, 96);
      assert.equal(repeat3.groups.C.percentage, 94);
    },
  },
  {
    name: "scoring: repeat lan 4 auto CCP",
    run: () => {
      const result = calculateAuditScore(
        [item({ repeatCount: 4, numErrors: 1 })],
        groupWeights
      );

      assert.equal(result.groups.C.triggeredCritical, true);
      assert.equal(result.groups.C.percentage, 0);
    },
  },
  {
    name: "scoring: maxDeduction cap diem tru",
    run: () => {
      const result = calculateAuditScore(
        [item({ numErrors: 10, deductionPerError: 2, maxDeduction: 5 })],
        groupWeights
      );

      assert.equal(result.groups.C.percentage, 95);
      assert.equal(result.finalScore, 98.5);
    },
  },
  {
    name: "repeat: khong co lich su thi la lan 1",
    run: async () => {
      const result = await calculateRepeatInfo(repeatDb({}), "store-1", [
        { criteriaId: "criteria-1", numErrors: 1 },
      ]);

      assert.deepEqual(result[0], {
        criteriaId: "criteria-1",
        numErrors: 1,
        repeatCount: 1,
        repeatLabel: "first",
        isCriticalTriggered: false,
      });
    },
  },
  {
    name: "repeat: lich su 1 va 2 lan thanh repeat lan 2 va 3",
    run: async () => {
      const result = await calculateRepeatInfo(
        repeatDb({ "criteria-1": 1, "criteria-2": 2 }),
        "store-1",
        [
          { criteriaId: "criteria-1", numErrors: 1 },
          { criteriaId: "criteria-2", numErrors: 1 },
        ]
      );

      assert.equal(result[0].repeatCount, 2);
      assert.equal(result[0].repeatLabel, "second");
      assert.equal(result[1].repeatCount, 3);
      assert.equal(result[1].repeatLabel, "third");
    },
  },
  {
    name: "repeat: lich su 3 lan thanh auto CCP",
    run: async () => {
      const result = await calculateRepeatInfo(repeatDb({ "criteria-1": 3 }), "store-1", [
        { criteriaId: "criteria-1", numErrors: 1 },
      ]);

      assert.equal(result[0].repeatCount, 4);
      assert.equal(result[0].repeatLabel, "auto_ccp");
      assert.equal(result[0].isCriticalTriggered, true);
    },
  },
  {
    name: "repeat: lich su 4 lan reset ve x1",
    run: async () => {
      const result = await calculateRepeatInfo(repeatDb({ "criteria-1": 4 }), "store-1", [
        { criteriaId: "criteria-1", numErrors: 1 },
      ]);

      assert.equal(result[0].repeatCount, 1);
      assert.equal(result[0].repeatLabel, "reset");
      assert.equal(result[0].isCriticalTriggered, false);
    },
  },
  {
    name: "repeat: numErrors bang 0 khong tinh lich su",
    run: async () => {
      const result = await calculateRepeatInfo(repeatDb({ "criteria-1": 3 }), "store-1", [
        { criteriaId: "criteria-1", numErrors: 0 },
      ]);

      assert.equal(result[0].repeatCount, 1);
      assert.equal(result[0].repeatLabel, "first");
      assert.equal(result[0].isCriticalTriggered, false);
    },
  },
  {
    name: "repeat: query chi hoi criteria co loi hien tai",
    run: async () => {
      let queriedIds: string[] = [];
      const db = {
        violation: {
          groupBy: async (args: any) => {
            queriedIds = args.where.criteriaId.in;
            return [];
          },
        },
      };

      await calculateRepeatInfo(db, "store-1", [
        { criteriaId: "criteria-1", numErrors: 1 },
        { criteriaId: "criteria-2", numErrors: 0 },
      ]);

      assert.deepEqual(queriedIds, ["criteria-1"]);
    },
  },
  {
    name: "action plan: chi chap nhan 4 status chinh thuc",
    run: () => {
      assert.deepEqual(ACTION_PLAN_STATUSES, ["draft", "submitted", "rejected", "closed"]);
      assert.equal(isActionPlanStatus("draft"), true);
      assert.equal(isActionPlanStatus("submitted"), true);
      assert.equal(isActionPlanStatus("rejected"), true);
      assert.equal(isActionPlanStatus("closed"), true);
      assert.equal(isActionPlanStatus("confirmed"), false);
      assert.equal(isActionPlanStatus("in_progress"), false);
    },
  },
  {
    name: "action plan: SM chi duoc edit va submit draft hoac rejected",
    run: () => {
      assert.equal(canEditActionPlan("draft"), true);
      assert.equal(canEditActionPlan("rejected"), true);
      assert.equal(canEditActionPlan("submitted"), false);
      assert.equal(canEditActionPlan("closed"), false);
      assert.equal(canSubmitActionPlan("draft"), true);
      assert.equal(canSubmitActionPlan("rejected"), true);
      assert.equal(canSubmitActionPlan("submitted"), false);
      assert.equal(canSubmitActionPlan("closed"), false);
    },
  },
  {
    name: "action plan: QAM chi review AP submitted",
    run: () => {
      assert.equal(canReviewActionPlan("submitted"), true);
      assert.equal(canReviewActionPlan("draft"), false);
      assert.equal(canReviewActionPlan("rejected"), false);
      assert.equal(canReviewActionPlan("closed"), false);
    },
  },
  {
    name: "action plan: confirm dong AP, reject tra ve rejected",
    run: () => {
      assert.equal(getReviewedActionPlanStatus("confirm"), "closed");
      assert.equal(getReviewedActionPlanStatus("reject"), "rejected");
      assert.equal(isActionPlanClosedByReview("confirm"), true);
      assert.equal(isActionPlanClosedByReview("reject"), false);
    },
  },
];

async function main() {
  let passed = 0;

  for (const test of tests) {
    await test.run();
    passed += 1;
    console.log(`PASS ${test.name}`);
  }

  console.log(`\n${passed}/${tests.length} tests passed`);
}

main().catch((error) => {
  console.error("TEST FAILED");
  console.error(error);
  process.exit(1);
});
