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
import { getPaginationMeta, getPaginationParams } from "../src/lib/pagination";
import { prisma } from "../src/lib/prisma";
import { calculateAuditScore, CriteriaInput, GroupWeight } from "../src/lib/scoring";
import { response } from "../src/lib/api-response";
import { withServerTiming } from "../src/lib/server-timing";

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
    { id: "store-sm", name: "Store SM", code: "SM", brandId: "brand-1", isActive: true, amId: "am-1", managerId: "sm-1" },
    { id: "store-am", name: "Store AM", code: "AM", brandId: "brand-1", isActive: false, amId: "am-1", managerId: "sm-other" },
    { id: "store-other", name: "Store Other", code: "OT", brandId: "brand-2", isActive: true, amId: "am-other", managerId: "sm-other" },
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
  if (where.brandId && record.brandId !== where.brandId) return false;
  if (where.groupId && record.groupId !== where.groupId) return false;
  if (where.isActive !== undefined && record.isActive !== where.isActive) return false;
  if (where.storeId) {
    if (typeof where.storeId === "string" && record.storeId !== where.storeId) return false;
    if (where.storeId.in && !where.storeId.in.includes(record.storeId)) return false;
  }
  if (where.auditorId && record.auditorId !== where.auditorId) return false;
  if (where.status) {
    if (typeof where.status === "string" && record.status !== where.status) return false;
    if (where.status.in && !where.status.in.includes(record.status)) return false;
    if (where.status.not && record.status === where.status.not) return false;
  }
  if (where.deadline?.lt && !(record.deadline < where.deadline.lt)) return false;
  if (where.submittedAt) {
    if (where.submittedAt.gte && !(record.submittedAt >= where.submittedAt.gte)) return false;
    if (where.submittedAt.lte && !(record.submittedAt <= where.submittedAt.lte)) return false;
  }

  return true;
}

function paginateRows<T>(rows: T[], args: any): T[] {
  const skip = args.skip || 0;
  const take = args.take ?? rows.length;
  return rows.slice(skip, skip + take);
}

function applySelect(record: any, select: any): any {
  if (!select) return record;

  return Object.fromEntries(
    Object.entries(select).flatMap(([key, value]) => {
      if (!value) return [];
      const field = record[key];

      if (value === true) return [[key, field]];
      if (field === null || field === undefined) return [[key, field]];
      if (typeof value === "object" && "select" in value) {
        return [[
          key,
          Array.isArray(field)
            ? field.map((item) => applySelect(item, value.select))
            : applySelect(field, value.select),
        ]];
      }

      return [[key, field]];
    })
  );
}

function setupRoutePrisma() {
  const fixtures = routeScopeFixtures();
  const brands = [
    { id: "brand-1", code: "MC", name: "Maycha", isActive: true, createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-02"), _count: { stores: 2 } },
    { id: "brand-2", code: "TH", name: "Tam Hao", isActive: true, createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-02"), _count: { stores: 1 } },
  ];
  const users = [
    { id: "user-1", email: "one@example.com", fullName: "User One", phone: null, isActive: true, createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-02"), roleAssignments: [{ id: "ra-1", roleKey: "qa_manager", storeId: null }] },
    { id: "user-2", email: "two@example.com", fullName: "User Two", phone: null, isActive: true, createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-02"), roleAssignments: [{ id: "ra-2", roleKey: "store_manager", storeId: "store-sm" }] },
  ];
  const criteriaGroups = [{ id: "group-c", code: "C", name: "Chat luong", weight: 0.3 }];
  const criteria = [
    { id: "criteria-1", groupId: "group-c", code: "C001", content: "Noi dung 1", deductionPerError: 1, maxDeduction: 5, flag: "none", isActive: true, createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-02"), group: criteriaGroups[0] },
    { id: "criteria-2", groupId: "group-c", code: "C002", content: "Noi dung 2", deductionPerError: 1, maxDeduction: 5, flag: "critical", isActive: true, createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-02"), group: criteriaGroups[0] },
  ];
  const checklistForms = [
    { id: "form-1", name: "Checklist 1", version: "v1", status: "published", publishedAt: new Date("2026-01-01"), createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-02"), _count: { sections: 2, auditPlans: 1, audits: 3 } },
    { id: "form-2", name: "Checklist 2", version: "v2", status: "draft", publishedAt: null, createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-02"), _count: { sections: 1, auditPlans: 0, audits: 0 } },
  ];
  const auditPlans = [
    { id: "plan-1", name: "Plan 1", type: "adhoc", scope: "company", status: "open", createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-02"), form: { id: "form-1", name: "Checklist 1", version: "v1", status: "published" }, _count: { assignments: 2 } },
    { id: "plan-2", name: "Plan 2", type: "adhoc", scope: "company", status: "closed", createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-02"), form: { id: "form-2", name: "Checklist 2", version: "v2", status: "draft" }, _count: { assignments: 1 } },
  ];

  Object.defineProperty(prisma, "$transaction", {
    value: async (queries: any[]) => Promise.all(queries),
    configurable: true,
  });

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
    count: async (args: any = {}) =>
      fixtures.stores.filter((store) => matchesWhere(store, args.where)).length,
    findMany: async (args: any) => {
      const where = args.where || {};
      const stores = fixtures.stores
        .filter((store) => {
          if (where.brandId || where.isActive !== undefined) return matchesWhere(store, where);
          if (where.id?.in) return where.id.in.includes(store.id);
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
        .map((store) => ({
          id: store.id,
          name: store.name,
          code: store.code,
          brand: { id: "brand-1", code: "MC", name: "Maycha" },
          am: { id: "am-1", fullName: "AM One" },
          manager: { id: "sm-1", fullName: "SM One" },
        }))
        .map((store) => applySelect(store, args.select));

      return paginateRows(stores, args);
    },
    findUnique: async (args: any) => {
      const store = fixtures.stores.find((item) => item.id === args.where.id);
      if (!store) return null;
      return {
        ...store,
        modelType: "standard",
        region: "Mien Nam",
        province: "HCM",
        district: "Q1",
        ward: "Ben Nghe",
        address: "1 Nguyen Hue",
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-02"),
        brand: { id: "brand-1", code: "MC", name: "Maycha" },
        am: { id: "am-1", fullName: "AM One", email: "am@example.com" },
        manager: { id: "sm-1", fullName: "SM One", email: "sm@example.com" },
      };
    },
  });
  setPrismaModel("audit", {
    count: async (args: any = {}) =>
      fixtures.audits.filter((audit) => matchesWhere(audit, args.where)).length,
    findMany: async (args: any) =>
      paginateRows(
        fixtures.audits
        .filter((audit) => matchesWhere(audit, args.where))
        .map((audit) => ({
          ...audit,
          assignment: { plan: { name: "Plan 1" } },
        }))
        .map((audit) => applySelect(audit, args.select)),
        args
      ),
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
    aggregate: async (args: any) => {
      const audits = fixtures.audits.filter((audit) => matchesWhere(audit, args.where));
      const total = audits.reduce((sum, audit) => sum + audit.finalScore, 0);
      return { _avg: { finalScore: audits.length > 0 ? total / audits.length : null } };
    },
    groupBy: async (args: any) => {
      const audits = fixtures.audits.filter((audit) => matchesWhere(audit, args.where));
      if (args.by.includes("grade")) {
        return Array.from(
          audits.reduce((groups, audit) => {
            groups.set(audit.grade, (groups.get(audit.grade) || 0) + 1);
            return groups;
          }, new Map<string, number>())
        ).map(([grade, count]) => ({ grade, _count: { _all: count } }));
      }
      return Array.from(
        audits.reduce((groups, audit) => {
          const current = groups.get(audit.storeId) || { total: 0, count: 0 };
          current.total += audit.finalScore;
          current.count += 1;
          groups.set(audit.storeId, current);
          return groups;
        }, new Map<string, { total: number; count: number }>())
      ).map(([storeId, value]) => ({
        storeId,
        _avg: { finalScore: value.total / value.count },
      }));
    },
  });
  setPrismaModel("actionPlan", {
    count: async (args: any = {}) =>
      fixtures.actionPlans.filter((actionPlan) => matchesWhere(actionPlan, args.where)).length,
    findMany: async (args: any) =>
      paginateRows(
        fixtures.actionPlans
          .filter((actionPlan) => matchesWhere(actionPlan, args.where))
          .map((actionPlan) => applySelect(actionPlan, args.select)),
        args
      ),
    findUnique: async (args: any) =>
      fixtures.actionPlans.find((actionPlan) => actionPlan.id === args.where.id) || null,
    update: async (args: any) => {
      const actionPlan = fixtures.actionPlans.find((item) => item.id === args.where.id);
      return { ...actionPlan, ...args.data };
    },
  });
  setPrismaModel("auditPlan", {
    findMany: async (args: any) => paginateRows(auditPlans, args),
    findUnique: async (args: any) => ({
      id: args.where.id,
      name: "Plan detail",
      form: { id: "form-1" },
      assignments: [],
    }),
    count: async (args: any = {}) => {
      if (!args.where?.assignments) return auditPlans.length;
      return 1;
    },
  });
  setPrismaModel("brand", {
    count: async () => brands.length,
    findMany: async (args: any) => paginateRows(brands, args),
  });
  setPrismaModel("user", {
    count: async () => users.length,
    findMany: async (args: any) => paginateRows(users, args),
  });
  setPrismaModel("criteria", {
    count: async (args: any = {}) =>
      criteria.filter((item) => matchesWhere(item, args.where)).length,
    findMany: async (args: any) =>
      paginateRows(criteria.filter((item) => matchesWhere(item, args.where)), args),
  });
  setPrismaModel("checklistForm", {
    count: async (args: any = {}) =>
      checklistForms.filter((item) => matchesWhere(item, args.where)).length,
    findMany: async (args: any) =>
      paginateRows(checklistForms.filter((item) => matchesWhere(item, args.where)), args),
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
    name: "pagination: mac dinh page 1 limit 20",
    run: () => {
      const params = getPaginationParams(new URLSearchParams());

      assert.deepEqual(params, { page: 1, limit: 20, skip: 0, take: 20 });
    },
  },
  {
    name: "pagination: query khong hop le fallback ve mac dinh",
    run: () => {
      const params = getPaginationParams(new URLSearchParams("page=-1&limit=abc"));

      assert.deepEqual(params, { page: 1, limit: 20, skip: 0, take: 20 });
    },
  },
  {
    name: "pagination: limit bi cap toi da 100 va tinh skip",
    run: () => {
      const params = getPaginationParams(new URLSearchParams("page=3&limit=999"));

      assert.deepEqual(params, { page: 3, limit: 100, skip: 200, take: 100 });
    },
  },
  {
    name: "pagination: meta tinh totalPages dung",
    run: () => {
      assert.deepEqual(getPaginationMeta({ page: 1, limit: 20 }, 0), {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      });
      assert.deepEqual(getPaginationMeta({ page: 2, limit: 20 }, 41), {
        page: 2,
        limit: 20,
        total: 41,
        totalPages: 3,
      });
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
      assert.deepEqual(body.meta, { page: 1, limit: 20, total: 1, totalPages: 1 });
    },
  },
  {
    name: "route: audit list tra pagination meta theo query",
    run: async () => {
      setupRoutePrisma();
      const route = await import("../src/app/api/audits/route");
      const result = await route.GET(
        fakeRouteRequest({
          userId: "qam-1",
          roles: ["qa_manager"],
          url: "http://localhost/api/audits?page=2&limit=2",
        })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 200);
      assert.equal(body.data.length, 2);
      assert.deepEqual(body.meta, { page: 2, limit: 2, total: 4, totalPages: 2 });
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
      assert.deepEqual(body.meta, { page: 1, limit: 20, total: 2, totalPages: 1 });
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
      assert.deepEqual(body.meta, { page: 1, limit: 20, total: 1, totalPages: 1 });
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
      assert.deepEqual(body.meta, { page: 1, limit: 20, total: 1, totalPages: 1 });
      assert.equal(body.data[0].store.name, "Store SM");
      assert.equal(body.data[0].audit.grade, "good");
    },
  },
  {
    name: "route: action plan list filter status co pagination meta",
    run: async () => {
      setupRoutePrisma();
      const route = await import("../src/app/api/action-plans/route");
      const result = await route.GET(
        fakeRouteRequest({
          userId: "qam-1",
          roles: ["qa_manager"],
          url: "http://localhost/api/action-plans?status=draft&page=1&limit=1",
        })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 200);
      assert.equal(body.data.length, 1);
      assert.deepEqual(body.meta, { page: 1, limit: 1, total: 2, totalPages: 2 });
    },
  },
  {
    name: "route: action plan list ngoai store scope tra meta rong",
    run: async () => {
      setupRoutePrisma();
      const route = await import("../src/app/api/action-plans/route");
      const result = await route.GET(
        fakeRouteRequest({
          userId: "sm-1",
          roles: ["store_manager"],
          url: "http://localhost/api/action-plans?storeId=store-other&page=2&limit=5",
        })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 200);
      assert.deepEqual(body.data, []);
      assert.deepEqual(body.meta, { page: 2, limit: 5, total: 0, totalPages: 0 });
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
  {
    name: "route: audit plans list co pagination meta va checklist display fields",
    run: async () => {
      setupRoutePrisma();
      const route = await import("../src/app/api/audit-plans/route");
      const result = await route.GET(
        fakeRouteRequest({
          userId: "qam-1",
          roles: ["qa_manager"],
          url: "http://localhost/api/audit-plans?page=1&limit=1",
        })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 200);
      assert.equal(body.data.length, 1);
      assert.deepEqual(body.meta, { page: 1, limit: 1, total: 2, totalPages: 2 });
      assert.deepEqual(Object.keys(body.data[0].form).sort(), ["id", "name", "status", "version"]);
    },
  },
  {
    name: "route: stores list co pagination meta va relation display fields",
    run: async () => {
      setupRoutePrisma();
      const route = await import("../src/app/api/stores/route");
      const result = await route.GET(
        fakeRouteRequest({
          userId: "admin-1",
          roles: ["company_admin"],
          url: "http://localhost/api/stores?page=1&limit=2",
        })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 200);
      assert.deepEqual(body.meta, { page: 1, limit: 2, total: 3, totalPages: 2 });
      assert.equal(body.data[0].brand.name, "Maycha");
      assert.equal(body.data[0].manager.fullName, "SM One");
      assert.equal("address" in body.data[0], false);
      assert.equal("email" in body.data[0].manager, false);
    },
  },
  {
    name: "route: stores detail tra field day du cho row drill-down",
    run: async () => {
      setupRoutePrisma();
      const route = await import("../src/app/api/stores/[id]/route");
      const result = await route.GET(
        fakeRouteRequest({
          userId: "admin-1",
          roles: ["company_admin"],
        }),
        { params: { id: "store-sm" } }
      );
      const body = await responseJson(result);

      assert.equal(result.status, 200);
      assert.equal(body.data.address, "1 Nguyen Hue");
      assert.equal(body.data.manager.email, "sm@example.com");
    },
  },
  {
    name: "route: stores list filter brand va active count dung where",
    run: async () => {
      setupRoutePrisma();
      const route = await import("../src/app/api/stores/route");
      const result = await route.GET(
        fakeRouteRequest({
          userId: "admin-1",
          roles: ["company_admin"],
          url: "http://localhost/api/stores?brandId=brand-1&isActive=true",
        })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 200);
      assert.deepEqual(body.data.map((store: any) => store.id), ["store-sm"]);
      assert.deepEqual(body.meta, { page: 1, limit: 20, total: 1, totalPages: 1 });
    },
  },
  {
    name: "route: users list co pagination meta va khong tra password",
    run: async () => {
      setupRoutePrisma();
      const route = await import("../src/app/api/users/route");
      const result = await route.GET(
        fakeRouteRequest({
          userId: "admin-1",
          roles: ["company_admin"],
          url: "http://localhost/api/users?page=1&limit=1",
        })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 200);
      assert.deepEqual(body.meta, { page: 1, limit: 1, total: 2, totalPages: 2 });
      assert.equal(body.data[0].fullName, "User One");
      assert.equal("password" in body.data[0], false);
    },
  },
  {
    name: "route: users list tra store display fields cho role assignment",
    run: async () => {
      setupRoutePrisma();
      const route = await import("../src/app/api/users/route");
      const result = await route.GET(
        fakeRouteRequest({
          userId: "admin-1",
          roles: ["company_admin"],
          url: "http://localhost/api/users?page=2&limit=1",
        })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 200);
      assert.deepEqual(body.data[0].roleAssignments[0].store, {
        id: "store-sm",
        code: "SM",
        name: "Store SM",
      });
    },
  },
  {
    name: "server timing: production mac dinh khong expose header debug",
    run: () => {
      const originalNodeEnv = process.env.NODE_ENV;
      const originalFlag = process.env.ENABLE_SERVER_TIMING;
      const mutableEnv = process.env as Record<string, string | undefined>;
      mutableEnv.NODE_ENV = "production";
      delete process.env.ENABLE_SERVER_TIMING;

      try {
        const result = withServerTiming(response.success({ ok: true }), [
          { name: "lookup", durationMs: 12, description: "User lookup" },
        ]);
        assert.equal(result.headers.get("server-timing"), null);
      } finally {
        mutableEnv.NODE_ENV = originalNodeEnv;
        if (originalFlag === undefined) {
          delete process.env.ENABLE_SERVER_TIMING;
        } else {
          process.env.ENABLE_SERVER_TIMING = originalFlag;
        }
      }
    },
  },
  {
    name: "route: audits list chi tra summary fields cho table",
    run: async () => {
      setupRoutePrisma();
      const route = await import("../src/app/api/audits/route");
      const result = await route.GET(
        fakeRouteRequest({
          userId: "qam-1",
          roles: ["qa_manager"],
          url: "http://localhost/api/audits?page=1&limit=1",
        })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 200);
      assert.equal("assignment" in body.data[0], false);
      assert.equal(body.data[0].store.name, "Store SM");
    },
  },
  {
    name: "route: action plans list chi tra summary fields cho table",
    run: async () => {
      setupRoutePrisma();
      const route = await import("../src/app/api/action-plans/route");
      const result = await route.GET(
        fakeRouteRequest({
          userId: "qam-1",
          roles: ["qa_manager"],
          url: "http://localhost/api/action-plans?page=1&limit=1",
        })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 200);
      assert.equal("remediation" in body.data[0], false);
      assert.equal("closedAt" in body.data[0], false);
      assert.equal("closedBy" in body.data[0], false);
      assert.equal(body.data[0].audit.grade, "good");
    },
  },
  {
    name: "route: brands criteria checklists list co pagination meta",
    run: async () => {
      setupRoutePrisma();
      const brandRoute = await import("../src/app/api/brands/route");
      const criteriaRoute = await import("../src/app/api/criteria/route");
      const checklistRoute = await import("../src/app/api/checklists/route");

      const brandBody = await responseJson(await brandRoute.GET(
        fakeRouteRequest({ userId: "qam-1", roles: ["qa_manager"], url: "http://localhost/api/brands?limit=1" })
      ));
      const criteriaBody = await responseJson(await criteriaRoute.GET(
        fakeRouteRequest({ userId: "qam-1", roles: ["qa_manager"], url: "http://localhost/api/criteria?groupId=group-c&limit=1" })
      ));
      const checklistBody = await responseJson(await checklistRoute.GET(
        fakeRouteRequest({ userId: "qam-1", roles: ["qa_manager"], url: "http://localhost/api/checklists?limit=1" })
      ));

      assert.deepEqual(brandBody.meta, { page: 1, limit: 1, total: 2, totalPages: 2 });
      assert.deepEqual(criteriaBody.meta, { page: 1, limit: 1, total: 2, totalPages: 2 });
      assert.deepEqual(checklistBody.meta, { page: 1, limit: 1, total: 2, totalPages: 2 });
      assert.equal(criteriaBody.data[0].group.weight, 0.3);
      assert.equal(checklistBody.data[0]._count.sections, 2);
      assert.equal("sections" in checklistBody.data[0], false);
    },
  },
  {
    name: "route: checklists list ton trong status filter",
    run: async () => {
      setupRoutePrisma();
      const route = await import("../src/app/api/checklists/route");
      const result = await route.GET(
        fakeRouteRequest({
          userId: "qam-1",
          roles: ["qa_manager"],
          url: "http://localhost/api/checklists?status=published",
        })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 200);
      assert.deepEqual(body.data.map((item: any) => item.id), ["form-1"]);
      assert.deepEqual(body.meta, { page: 1, limit: 20, total: 1, totalPages: 1 });
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
