import assert from "assert/strict";
import path from "path";
import Module from "module";
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
import {
  assertAssignmentOwner,
  assertActionPlanAccess,
  assertAuditAccess,
  canAccessActionPlanRecord,
  canAccessAuditRecord,
  canAccessStore,
  canReadAllQaData,
  getAssignedStoreIds,
  getRequestUser,
  getReadableStoreIds,
} from "../src/lib/scope";
import { prisma } from "../src/lib/prisma";
import { calculateAuditScore, CriteriaInput, GroupWeight } from "../src/lib/scoring";

const originalResolveFilename = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function resolveAlias(
  request: string,
  parent: unknown,
  isMain: boolean,
  options: unknown
) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(
      this,
      path.join(__dirname, "..", "src", request.slice(2)),
      parent,
      isMain,
      options
    );
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};

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

function scopeDb() {
  const roleAssignments = [
    { userId: "sm-1", roleKey: "store_manager", storeId: "store-role-sm" },
    { userId: "sm-1", roleKey: "store_manager", storeId: "store-direct-sm" },
    { userId: "sm-1", roleKey: "store_manager", storeId: null },
    { userId: "am-1", roleKey: "am", storeId: "store-role-am" },
    { userId: "am-1", roleKey: "am", storeId: "store-direct-am" },
  ];
  const stores = [
    { id: "store-direct-sm", amId: "am-other", managerId: "sm-1" },
    { id: "store-direct-am", amId: "am-1", managerId: "sm-other" },
    { id: "store-other", amId: "am-other", managerId: "sm-other" },
  ];
  const assignments = [{ id: "assignment-1", auditorId: "qc-1" }];
  const audits = [
    { id: "audit-1", storeId: "store-direct-sm", auditorId: "qc-1" },
    { id: "audit-2", storeId: "store-other", auditorId: "qc-2" },
  ];
  const actionPlans = [
    { id: "ap-1", storeId: "store-direct-sm" },
    { id: "ap-2", storeId: "store-other" },
  ];

  return {
    roleAssignment: {
      findMany: async (args: any) =>
        roleAssignments
          .filter((scope) => scope.userId === args.where.userId && scope.roleKey === args.where.roleKey)
          .map((scope) => ({ storeId: scope.storeId })),
    },
    store: {
      findMany: async (args: any) => {
        const where = args.where || {};
        const candidates = stores.filter((store) => {
          if (where.amId) return store.amId === where.amId;
          if (where.managerId) return store.managerId === where.managerId;
          if (where.OR) {
            return where.OR.some((condition: any) => {
              if (condition.amId) return store.amId === condition.amId;
              if (condition.managerId) return store.managerId === condition.managerId;
              if (condition.id?.in) return condition.id.in.includes(store.id);
              return false;
            });
          }
          return false;
        });

        return candidates.map((store) => ({ id: store.id }));
      },
    },
    auditAssignment: {
      findUnique: async (args: any) =>
        assignments.find((assignment) => assignment.id === args.where.id) || null,
    },
    audit: {
      findUnique: async (args: any) =>
        audits.find((audit) => audit.id === args.where.id) || null,
    },
    actionPlan: {
      findUnique: async (args: any) =>
        actionPlans.find((actionPlan) => actionPlan.id === args.where.id) || null,
    },
  };
}

function fakeRequest(headers: Record<string, string | undefined>) {
  return {
    headers: {
      get: (name: string) => headers[name],
    },
  } as any;
}

function fakeRouteRequest({
  url = "http://localhost/api/test",
  userId,
  roles,
}: {
  url?: string;
  userId?: string;
  roles?: string[];
}) {
  return {
    url,
    headers: {
      get: (name: string) => {
        if (name === "x-user-id") return userId;
        if (name === "x-user-roles") return roles ? JSON.stringify(roles) : undefined;
        return undefined;
      },
    },
  } as any;
}

async function responseJson(result: Response) {
  return result.json() as Promise<any>;
}

function setPrismaModel(model: string, implementation: Record<string, unknown>) {
  Object.defineProperty(prisma, model, {
    value: implementation,
    configurable: true,
  });
}

function routeScopeFixtures() {
  const stores = [
    { id: "store-sm", name: "Store SM", code: "SM", amId: "am-1", managerId: "sm-1" },
    { id: "store-am", name: "Store AM", code: "AM", amId: "am-1", managerId: "sm-other" },
    { id: "store-other", name: "Store Other", code: "OT", amId: "am-other", managerId: "sm-other" },
  ];
  const audits = [
    { id: "audit-sm", storeId: "store-sm", auditorId: "qc-other", finalScore: 90, grade: "good", submittedAt: new Date("2026-05-01"), store: stores[0] },
    { id: "audit-own", storeId: "store-other", auditorId: "qc-1", finalScore: 80, grade: "pass", submittedAt: new Date("2026-05-02"), store: stores[2] },
    { id: "audit-own-sm", storeId: "store-other", auditorId: "sm-1", finalScore: 85, grade: "good", submittedAt: new Date("2026-05-02"), store: stores[2] },
    { id: "audit-other", storeId: "store-other", auditorId: "qc-other", finalScore: 70, grade: "fail", submittedAt: new Date("2026-05-03"), store: stores[2] },
  ];
  const actionPlans = [
    { id: "ap-sm", storeId: "store-sm", status: "draft", remediation: "Fix", deadline: new Date("2026-05-20"), store: stores[0], audit: { id: "audit-sm", finalScore: 90, grade: "good", submittedAt: new Date("2026-05-01") }, closedBy: null },
    { id: "ap-other", storeId: "store-other", status: "draft", remediation: "Fix", deadline: new Date("2026-05-20"), store: stores[2], audit: { id: "audit-other", finalScore: 70, grade: "fail", submittedAt: new Date("2026-05-03") }, closedBy: null },
  ];

  return { stores, audits, actionPlans };
}

function matchesWhere(record: any, where: any): boolean {
  if (!where) return true;

  if (where.OR) return where.OR.some((condition: any) => matchesWhere(record, condition));
  if (where.AND) return where.AND.every((condition: any) => matchesWhere(record, condition));
  if (where.storeId) {
    if (typeof where.storeId === "string" && record.storeId !== where.storeId) return false;
    if (where.storeId.in && !where.storeId.in.includes(record.storeId)) return false;
  }
  if (where.auditorId && record.auditorId !== where.auditorId) return false;
  if (where.status && record.status !== where.status) return false;

  return true;
}

function setupRoutePrisma() {
  const fixtures = routeScopeFixtures();

  setPrismaModel("roleAssignment", {
    findMany: async (args: any) => {
      if (args.where.userId === "sm-1" && args.where.roleKey === "store_manager") {
        return [{ storeId: "store-sm" }];
      }
      if (args.where.userId === "am-1" && args.where.roleKey === "am") {
        return [{ storeId: "store-am" }];
      }
      return [];
    },
  });
  setPrismaModel("store", {
    findMany: async (args: any) => {
      const where = args.where || {};
      return fixtures.stores
        .filter((store) => {
          if (where.amId) return store.amId === where.amId;
          if (where.managerId) return store.managerId === where.managerId;
          if (where.OR) {
            return where.OR.some((condition: any) => {
              if (condition.amId) return store.amId === condition.amId;
              if (condition.managerId) return store.managerId === condition.managerId;
              if (condition.id?.in) return condition.id.in.includes(store.id);
              return false;
            });
          }
          return true;
        })
        .map((store) => ({ id: store.id, name: store.name, code: store.code }));
    },
  });
  setPrismaModel("audit", {
    findMany: async (args: any) =>
      fixtures.audits
        .filter((audit) => matchesWhere(audit, args.where))
        .map((audit) => ({
          ...audit,
          assignment: { plan: { name: "Plan 1" } },
        })),
    findUnique: async (args: any) => {
      const audit = fixtures.audits.find((item) => item.id === args.where.id);
      if (!audit) return null;
      return {
        ...audit,
        groupScores: [],
        violations: [],
        assignment: { plan: { form: { id: "form-1" } } },
      };
    },
  });
  setPrismaModel("actionPlan", {
    findMany: async (args: any) =>
      fixtures.actionPlans.filter((actionPlan) => matchesWhere(actionPlan, args.where)),
    findUnique: async (args: any) =>
      fixtures.actionPlans.find((actionPlan) => actionPlan.id === args.where.id) || null,
    update: async (args: any) => {
      const actionPlan = fixtures.actionPlans.find((item) => item.id === args.where.id);
      return { ...actionPlan, ...args.data };
    },
  });
  setPrismaModel("auditPlan", {
    findUnique: async (args: any) => ({
      id: args.where.id,
      name: "Plan detail",
      form: { id: "form-1" },
      assignments: [],
    }),
    count: async (args: any) => {
      if (!args.where.assignments) return 3;
      return 1;
    },
  });
  setPrismaModel("auditAssignment", {
    count: async (args: any) => {
      if (args.where.status === "completed") return 1;
      return 2;
    },
  });

  return fixtures;
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
  {
    name: "scope: QAM company admin va executive duoc read all QA data",
    run: () => {
      assert.equal(canReadAllQaData(["qa_manager"]), true);
      assert.equal(canReadAllQaData(["company_admin"]), true);
      assert.equal(canReadAllQaData(["executive_viewer"]), true);
      assert.equal(canReadAllQaData(["qc_auditor"]), false);
    },
  },
  {
    name: "scope: getRequestUser thieu user id thi tra null",
    run: () => {
      const request = fakeRequest({ "x-user-roles": JSON.stringify(["qa_manager"]) });

      assert.equal(getRequestUser(request), null);
    },
  },
  {
    name: "scope: getRequestUser roles sai JSON thi tra null",
    run: () => {
      const request = fakeRequest({ "x-user-id": "user-1", "x-user-roles": "not-json" });

      assert.equal(getRequestUser(request), null);
    },
  },
  {
    name: "scope: getRequestUser hop le tra user context",
    run: () => {
      const request = fakeRequest({
        "x-user-id": "user-1",
        "x-user-roles": JSON.stringify(["qa_manager"]),
      });

      assert.deepEqual(getRequestUser(request), {
        userId: "user-1",
        roles: ["qa_manager"],
      });
    },
  },
  {
    name: "scope: SM lay store tu roleAssignment va managerId, bo null va duplicate",
    run: async () => {
      const result = await getAssignedStoreIds(scopeDb(), "sm-1", "store_manager");

      assert.deepEqual(result.sort(), ["store-direct-sm", "store-role-sm"]);
    },
  },
  {
    name: "scope: AM lay store tu roleAssignment va amId, khong duplicate",
    run: async () => {
      const result = await getAssignedStoreIds(scopeDb(), "am-1", "am");

      assert.deepEqual(result.sort(), ["store-direct-am", "store-role-am"]);
    },
  },
  {
    name: "scope: read all role khong bi filter store",
    run: async () => {
      const result = await getReadableStoreIds(scopeDb(), "qam-1", ["qa_manager"]);

      assert.equal(result, undefined);
    },
  },
  {
    name: "scope: role la khong co read-all va khong co store access",
    run: async () => {
      const db = scopeDb();

      assert.deepEqual(await getReadableStoreIds(db, "user-unknown", ["guest"]), []);
      assert.equal(await canAccessStore(db, "user-unknown", ["guest"], "store-direct-sm"), false);
    },
  },
  {
    name: "scope: multi-role QAM va SM thi read-all thang store scope",
    run: async () => {
      const db = scopeDb();

      assert.equal(
        await getReadableStoreIds(db, "sm-1", ["qa_manager", "store_manager"]),
        undefined
      );
      assert.equal(
        await canAccessStore(db, "sm-1", ["qa_manager", "store_manager"], "store-other"),
        true
      );
    },
  },
  {
    name: "scope: multi-role QC va SM duoc union own audit va store scope",
    run: async () => {
      const db = scopeDb();

      assert.equal(
        await canAccessAuditRecord(db, "sm-1", ["qc_auditor", "store_manager"], {
          storeId: "store-other",
          auditorId: "sm-1",
        }),
        true
      );
      assert.equal(
        await canAccessAuditRecord(db, "sm-1", ["qc_auditor", "store_manager"], {
          storeId: "store-direct-sm",
          auditorId: "qc-other",
        }),
        true
      );
      assert.equal(
        await canAccessAuditRecord(db, "sm-1", ["qc_auditor", "store_manager"], {
          storeId: "store-other",
          auditorId: "qc-other",
        }),
        false
      );
    },
  },
  {
    name: "scope: QC chi xem audit cua chinh minh",
    run: async () => {
      const db = scopeDb();

      assert.equal(
        await canAccessAuditRecord(db, "qc-1", ["qc_auditor"], {
          storeId: "store-other",
          auditorId: "qc-1",
        }),
        true
      );
      assert.equal(
        await canAccessAuditRecord(db, "qc-1", ["qc_auditor"], {
          storeId: "store-other",
          auditorId: "qc-2",
        }),
        false
      );
    },
  },
  {
    name: "scope: SM khong xem AP store khac",
    run: async () => {
      const db = scopeDb();

      assert.equal(
        await canAccessActionPlanRecord(db, "sm-1", ["store_manager"], {
          storeId: "store-direct-sm",
        }),
        true
      );
      assert.equal(
        await canAccessActionPlanRecord(db, "sm-1", ["store_manager"], {
          storeId: "store-other",
        }),
        false
      );
    },
  },
  {
    name: "scope: assignment owner dung auditor duoc assign",
    run: async () => {
      const db = scopeDb();

      assert.equal(await assertAssignmentOwner(db, "qc-1", "assignment-1"), true);
      assert.equal(await assertAssignmentOwner(db, "qc-2", "assignment-1"), false);
    },
  },
  {
    name: "scope: assertAuditAccess tra false khi audit khong ton tai",
    run: async () => {
      const db = scopeDb();

      assert.equal(await assertAuditAccess(db, "qc-1", ["qc_auditor"], "missing-audit"), false);
    },
  },
  {
    name: "scope: assertActionPlanAccess tra false khi AP khong ton tai",
    run: async () => {
      const db = scopeDb();

      assert.equal(
        await assertActionPlanAccess(db, "sm-1", ["store_manager"], "missing-ap"),
        false
      );
    },
  },
  {
    name: "scope: assert access helper dung record lookup va scope",
    run: async () => {
      const db = scopeDb();

      assert.equal(await assertAuditAccess(db, "qc-1", ["qc_auditor"], "audit-1"), true);
      assert.equal(await assertAuditAccess(db, "qc-1", ["qc_auditor"], "audit-2"), false);
      assert.equal(await assertActionPlanAccess(db, "sm-1", ["store_manager"], "ap-1"), true);
      assert.equal(await assertActionPlanAccess(db, "sm-1", ["store_manager"], "ap-2"), false);
    },
  },
  {
    name: "scope: DB scope loi thi khong fallback thanh read-all",
    run: async () => {
      const db = {
        roleAssignment: {
          findMany: async () => {
            throw new Error("db down");
          },
        },
        store: {
          findMany: async () => [{ id: "store-direct-sm" }],
        },
      };

      await assert.rejects(
        () => getReadableStoreIds(db, "sm-1", ["store_manager"]),
        /db down/
      );
    },
  },
  {
    name: "route: QC bi chan khi xem audit plan management detail",
    run: async () => {
      setupRoutePrisma();
      const route = await import("../src/app/api/audit-plans/[id]/route");
      const result = await route.GET(
        fakeRouteRequest({ userId: "qc-1", roles: ["qc_auditor"] }),
        { params: { id: "plan-1" } }
      );
      const body = await responseJson(result);

      assert.equal(result.status, 403);
      assert.equal(body.success, false);
    },
  },
  {
    name: "route: QAM xem duoc audit plan management detail",
    run: async () => {
      setupRoutePrisma();
      const route = await import("../src/app/api/audit-plans/[id]/route");
      const result = await route.GET(
        fakeRouteRequest({ userId: "qam-1", roles: ["qa_manager"] }),
        { params: { id: "plan-1" } }
      );
      const body = await responseJson(result);

      assert.equal(result.status, 200);
      assert.equal(body.success, true);
      assert.equal(body.data.id, "plan-1");
    },
  },
  {
    name: "route: QC audit list chi thay audit cua minh",
    run: async () => {
      setupRoutePrisma();
      const route = await import("../src/app/api/audits/route");
      const result = await route.GET(
        fakeRouteRequest({ userId: "qc-1", roles: ["qc_auditor"], url: "http://localhost/api/audits" })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 200);
      assert.deepEqual(body.data.map((audit: any) => audit.id), ["audit-own"]);
    },
  },
  {
    name: "route: multi-role QC va SM audit list la union own audit va store scope",
    run: async () => {
      setupRoutePrisma();
      const route = await import("../src/app/api/audits/route");
      const result = await route.GET(
        fakeRouteRequest({
          userId: "sm-1",
          roles: ["qc_auditor", "store_manager"],
          url: "http://localhost/api/audits",
        })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 200);
      assert.deepEqual(
        body.data.map((audit: any) => audit.id).sort(),
        ["audit-own-sm", "audit-sm"]
      );
    },
  },
  {
    name: "route: multi-role QC va SM storeId ngoai scope chi thay audit cua minh trong store do",
    run: async () => {
      setupRoutePrisma();
      const route = await import("../src/app/api/audits/route");
      const result = await route.GET(
        fakeRouteRequest({
          userId: "qc-1",
          roles: ["qc_auditor", "store_manager"],
          url: "http://localhost/api/audits?storeId=store-other",
        })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 200);
      assert.deepEqual(body.data.map((audit: any) => audit.id), ["audit-own"]);
    },
  },
  {
    name: "route: QC khong xem duoc audit detail cua nguoi khac",
    run: async () => {
      setupRoutePrisma();
      const route = await import("../src/app/api/audits/[id]/route");
      const result = await route.GET(
        fakeRouteRequest({ userId: "qc-1", roles: ["qc_auditor"] }),
        { params: { id: "audit-other" } }
      );
      const body = await responseJson(result);

      assert.equal(result.status, 403);
      assert.equal(body.success, false);
    },
  },
  {
    name: "route: SM action plan list chi thay AP store minh",
    run: async () => {
      setupRoutePrisma();
      const route = await import("../src/app/api/action-plans/route");
      const result = await route.GET(
        fakeRouteRequest({
          userId: "sm-1",
          roles: ["store_manager"],
          url: "http://localhost/api/action-plans",
        })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 200);
      assert.deepEqual(body.data.map((actionPlan: any) => actionPlan.id), ["ap-sm"]);
    },
  },
  {
    name: "route: SM khong xem duoc AP detail store khac",
    run: async () => {
      setupRoutePrisma();
      const route = await import("../src/app/api/action-plans/[id]/route");
      const result = await route.GET(
        fakeRouteRequest({ userId: "sm-1", roles: ["store_manager"] }),
        { params: { id: "ap-other" } }
      );
      const body = await responseJson(result);

      assert.equal(result.status, 403);
      assert.equal(body.success, false);
    },
  },
  {
    name: "route: SM khong submit duoc AP store khac",
    run: async () => {
      setupRoutePrisma();
      const route = await import("../src/app/api/action-plans/[id]/submit/route");
      const result = await route.POST(
        fakeRouteRequest({ userId: "sm-1", roles: ["store_manager"] }),
        { params: { id: "ap-other" } }
      );
      const body = await responseJson(result);

      assert.equal(result.status, 403);
      assert.equal(body.success, false);
    },
  },
  {
    name: "route: QC bi chan analytics overview",
    run: async () => {
      setupRoutePrisma();
      const route = await import("../src/app/api/analytics/overview/route");
      const result = await route.GET(
        fakeRouteRequest({ userId: "qc-1", roles: ["qc_auditor"] })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 403);
      assert.equal(body.success, false);
    },
  },
  {
    name: "route: SM analytics overview bi filter theo store scope",
    run: async () => {
      setupRoutePrisma();
      const route = await import("../src/app/api/analytics/overview/route");
      const result = await route.GET(
        fakeRouteRequest({ userId: "sm-1", roles: ["store_manager"] })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 200);
      assert.equal(body.success, true);
      assert.equal(body.data.openAuditPlans, 1);
      assert.equal(body.data.pendingActionPlans, 1);
      assert.deepEqual(body.data.recentAudits.map((audit: any) => audit.id), ["audit-sm"]);
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
