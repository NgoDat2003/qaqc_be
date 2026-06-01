import assert from "assert/strict";
import path from "path";
import Module from "module";
import { unlink } from "fs/promises";
import { pathToFileURL } from "url";
import { prisma } from "../src/lib/prisma";
import { response } from "../src/lib/api-response";
import { getRoles, hasRole } from "../src/lib/rbac";
import {
  clearAdminCache,
  invalidateAdminCache,
  readAdminCache,
} from "../src/lib/admin-cache";
import { getRepeatState } from "../src/lib/audit";
import { actionPlanDetailDto } from "../src/lib/audit-workflow";
import { calculateAuditScore } from "../src/lib/scoring";
import { buildAuditScoreBreakdown } from "../src/lib/audit-score-breakdown";

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

function fakeRequest(headers: Record<string, string | undefined>) {
  return {
    headers: {
      get: (name: string) => headers[name],
    },
  } as any;
}

function fakeRouteRequest({
  url = "http://localhost/api/test",
  userId = "admin-1",
  roles = ["company_admin"],
  body,
}: {
  url?: string;
  userId?: string;
  roles?: string[];
  body?: unknown;
}) {
  return {
    url,
    headers: {
      get: (name: string) => {
        if (name === "x-user-id") return userId;
        if (name === "x-user-roles") return JSON.stringify(roles);
        return undefined;
      },
    },
    json: async () => body,
  } as any;
}

async function responseJson(result: Response) {
  return result.json() as Promise<any>;
}

function setPrismaModel(model: string, implementation: unknown) {
  Object.defineProperty(prisma, model, {
    value: implementation,
    configurable: true,
  });
}

function auditPlanFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "plan-1",
    name: "Plan",
    type: "adhoc",
    scope: "company",
    status: "draft",
    formId: "form-1",
    startDate: new Date("2026-05-20"),
    endDate: new Date("2026-05-30"),
    createdAt: new Date("2026-05-01"),
    updatedAt: new Date("2026-05-02"),
    form: {
      id: "form-1",
      name: "Checklist",
      version: "v1",
      status: "published",
    },
    assignments: [
      {
        id: "assignment-1",
        status: "pending",
        auditId: null,
        storeId: "store-1",
        auditorId: "qc-1",
        store: { id: "store-1", code: "MC-001", name: "Store 1" },
        auditor: { id: "qc-1", fullName: "QC One", email: "qc1@example.com" },
      },
    ],
    ...overrides,
  };
}

async function importCleanupScript() {
  const importer = new Function("specifier", "return import(specifier)");
  return importer(
    pathToFileURL(path.join(__dirname, "..", "scripts", "cleanup-e2e-portfolio.mjs")).href
  );
}

function assertNoEmptyFilters(args: unknown) {
  if (!args || typeof args !== "object") return;
  const json = JSON.stringify(args);
  assert.equal(json.includes('"in":[]'), false, "Prisma filter must not contain in: []");
  assert.equal(json.includes('"OR":[]'), false, "Prisma filter must not contain OR: []");
}

function createCleanupPrismaMock(data: {
  plans?: Array<{ id: string; name: string }>;
  assignments?: Array<{ id: string; planId: string; auditId: string | null }>;
  actionPlans?: Array<{ id: string; auditId: string }>;
  violations?: Array<{ id: string; auditId: string }>;
  actionPlanItems?: Array<{ id: string; actionPlanId: string; violationId: string }>;
  evidences?: Array<{
    id: string;
    violationId?: string | null;
    actionPlanId?: string | null;
    actionPlanItemId?: string | null;
  }>;
  notifications?: Array<{ id: string; link: string | null }>;
  calls?: string[];
}) {
  const calls = data.calls ?? [];

  const idIn = (ids: string[] | undefined, id: string) => Array.isArray(ids) && ids.includes(id);
  const firstIn = (args: any, key: string) => args?.where?.[key]?.in as string[] | undefined;
  const matchesOr = (args: any, row: Record<string, any>) => {
    const or = args?.where?.OR;
    if (!Array.isArray(or)) return false;
    return or.some((condition: any) =>
      Object.entries(condition).some(([key, value]: [string, any]) => {
        if (value?.in) return idIn(value.in, row[key]);
        if (value?.contains) return String(row[key] ?? "").includes(value.contains);
        return false;
      })
    );
  };

  const model = <T extends { id: string }>(
    name: string,
    rows: T[],
    filter: (args: any, row: T) => boolean
  ) => ({
    findMany: async (args: any = {}) => {
      assertNoEmptyFilters(args);
      calls.push(`${name}.findMany`);
      return rows.filter((row) => filter(args, row));
    },
    deleteMany: async (args: any = {}) => {
      assertNoEmptyFilters(args);
      calls.push(`${name}.deleteMany:${JSON.stringify(args)}`);
      const ids = firstIn(args, "id");
      return { count: ids ? rows.filter((row) => ids.includes(row.id)).length : rows.length };
    },
    updateMany: async (args: any = {}) => {
      assertNoEmptyFilters(args);
      calls.push(`${name}.updateMany:${JSON.stringify(args)}`);
      const ids = firstIn(args, "id");
      return { count: ids ? rows.filter((row) => ids.includes(row.id)).length : rows.length };
    },
  });

  const prisma: any = {
    auditPlan: model("auditPlan", data.plans ?? [], (args, row) =>
      row.name.startsWith(args?.where?.name?.startsWith ?? "")
    ),
    auditAssignment: model("auditAssignment", data.assignments ?? [], (args, row) =>
      idIn(firstIn(args, "planId"), row.planId)
    ),
    actionPlan: model("actionPlan", data.actionPlans ?? [], (args, row) =>
      idIn(firstIn(args, "auditId"), row.auditId)
    ),
    violation: model("violation", data.violations ?? [], (args, row) =>
      idIn(firstIn(args, "auditId"), row.auditId)
    ),
    actionPlanItem: model("actionPlanItem", data.actionPlanItems ?? [], matchesOr),
    evidence: model("evidence", data.evidences ?? [], matchesOr),
    notification: model("notification", data.notifications ?? [], matchesOr),
    auditCorrectionRequest: {
      deleteMany: async (args: any = {}) => {
        assertNoEmptyFilters(args);
        calls.push(`auditCorrectionRequest.deleteMany:${JSON.stringify(args)}`);
        return { count: 0 };
      },
    },
    groupScore: {
      deleteMany: async (args: any = {}) => {
        assertNoEmptyFilters(args);
        calls.push(`groupScore.deleteMany:${JSON.stringify(args)}`);
        return { count: 0 };
      },
    },
    audit: model("audit", [], () => false),
    $transaction: async (callback: any) => callback(prisma),
  };

  return prisma;
}

const tests: TestCase[] = [
  {
    name: "response.success tra envelope thanh cong",
    run: async () => {
      const result = response.success({ ok: true }, "done");
      assert.equal(result.status, 200);
      assert.deepEqual(await responseJson(result), {
        success: true,
        data: { ok: true },
        message: "done",
      });
    },
  },
  {
    name: "response.error tra envelope loi",
    run: async () => {
      const result = response.error("bad request", 400, "BAD_REQUEST");
      assert.equal(result.status, 400);
      assert.deepEqual(await responseJson(result), {
        success: false,
        error: {
          statusCode: 400,
          message: "bad request",
          code: "BAD_REQUEST",
        },
      });
    },
  },
  {
    name: "repeat state dung zero-based repeat count",
    run: () => {
      assert.deepEqual(getRepeatState(0), {
        repeatCount: 0,
        repeatLabel: "first",
        isCriticalTriggered: false,
      });
      assert.deepEqual(getRepeatState(1), {
        repeatCount: 1,
        repeatLabel: "second",
        isCriticalTriggered: false,
      });
      assert.deepEqual(getRepeatState(2), {
        repeatCount: 2,
        repeatLabel: "third",
        isCriticalTriggered: false,
      });
      assert.deepEqual(getRepeatState(3), {
        repeatCount: 3,
        repeatLabel: "auto_ccp",
        isCriticalTriggered: true,
      });
      assert.deepEqual(getRepeatState(4), {
        repeatCount: 0,
        repeatLabel: "reset",
        isCriticalTriggered: false,
      });
    },
  },
  {
    name: "rbac doc roles hop le",
    run: () => {
      const request = fakeRequest({
        "x-user-roles": JSON.stringify(["company_admin", "qa_manager"]),
      });
      assert.deepEqual(getRoles(request), ["company_admin", "qa_manager"]);
      assert.equal(hasRole(request, ["company_admin"]), true);
      assert.equal(hasRole(request, ["store_manager"]), false);
    },
  },
  {
    name: "rbac fallback mang rong khi roles sai dinh dang",
    run: () => {
      const request = fakeRequest({
        "x-user-roles": "not-json",
      });
      assert.deepEqual(getRoles(request), []);
      assert.equal(hasRole(request, ["company_admin"]), false);
    },
  },
  {
    name: "admin cache tai mot lan va dung lai ket qua khi chua het han",
    run: async () => {
      clearAdminCache();
      let calls = 0;

      const first = await readAdminCache("brands:list", async () => {
        calls += 1;
        return [{ id: "brand-1" }];
      });
      const second = await readAdminCache("brands:list", async () => {
        calls += 1;
        return [{ id: "brand-2" }];
      });

      assert.equal(calls, 1);
      assert.equal(first.cacheHit, false);
      assert.equal(second.cacheHit, true);
      assert.deepEqual(second.value, [{ id: "brand-1" }]);
    },
  },
  {
    name: "admin cache xoa dung nhom key sau mutation",
    run: async () => {
      clearAdminCache();
      let brandCalls = 0;
      let userCalls = 0;

      await readAdminCache("brands:list", async () => {
        brandCalls += 1;
        return ["brands-v1"];
      });
      await readAdminCache("users:list", async () => {
        userCalls += 1;
        return ["users-v1"];
      });

      invalidateAdminCache("brands:");

      const brands = await readAdminCache("brands:list", async () => {
        brandCalls += 1;
        return ["brands-v2"];
      });
      const users = await readAdminCache("users:list", async () => {
        userCalls += 1;
        return ["users-v2"];
      });

      assert.equal(brandCalls, 2);
      assert.equal(userCalls, 1);
      assert.deepEqual(brands.value, ["brands-v2"]);
      assert.deepEqual(users.value, ["users-v1"]);
    },
  },
  {
    name: "route brands list tra full data khong kem meta",
    run: async () => {
      clearAdminCache();
      setPrismaModel("brand", {
        findMany: async () => [
          {
            id: "brand-1",
            code: "MC",
            name: "Maycha",
            isActive: true,
            createdAt: new Date("2026-05-01"),
            updatedAt: new Date("2026-05-02"),
            _count: { stores: 3 },
          },
        ],
      });

      const route = await import("../src/app/api/brands/route");
      const result = await route.GET(fakeRouteRequest({}));
      const body = await responseJson(result);

      assert.equal(result.status, 200);
      assert.equal(body.success, true);
      assert.equal(body.data.length, 1);
      assert.equal("meta" in body, false);
    },
  },
  {
    name: "route brands list dung cache cho lan goi tiep theo",
    run: async () => {
      clearAdminCache();
      let calls = 0;
      setPrismaModel("brand", {
        findMany: async () => {
          calls += 1;
          return [
            {
              id: "brand-1",
              code: "MC",
              name: "Maycha",
              isActive: true,
              createdAt: new Date("2026-05-01"),
              updatedAt: new Date("2026-05-02"),
              _count: { stores: 3 },
            },
          ];
        },
      });

      const route = await import("../src/app/api/brands/route");
      await route.GET(fakeRouteRequest({}));
      const second = await route.GET(fakeRouteRequest({}));

      assert.equal(calls, 1);
      assert.match(second.headers.get("Server-Timing") ?? "", /cache/);
    },
  },
  {
    name: "route stores list tra display fields cho table",
    run: async () => {
      clearAdminCache();
      setPrismaModel("store", {
        findMany: async () => [
          {
            id: "store-1",
            code: "MC-001",
            name: "Store 1",
            modelType: "standard",
            province: "HCM",
            ward: "Ward 1",
            address: "1 Street",
            isActive: true,
            createdAt: new Date("2026-05-01"),
            updatedAt: new Date("2026-05-02"),
            brandId: "brand-1",
            amId: "am-1",
            managerId: "sm-1",
            brand: { id: "brand-1", code: "MC", name: "Maycha" },
            am: { id: "am-1", fullName: "AM One", email: "am@example.com" },
            manager: {
              id: "sm-1",
              fullName: "SM One",
              email: "sm@example.com",
            },
          },
        ],
      });

      const route = await import("../src/app/api/stores/route");
      const result = await route.GET(fakeRouteRequest({}));
      const body = await responseJson(result);

      assert.equal(result.status, 200);
      assert.equal(body.data[0].brandId, "brand-1");
      assert.equal(body.data[0].managerId, "sm-1");
      assert.deepEqual(body.data[0].brand, {
        id: "brand-1",
        code: "MC",
        name: "Maycha",
      });
      assert.equal(body.data[0].am.fullName, "AM One");
      assert.equal(body.data[0].manager.email, "sm@example.com");
      assert.equal("meta" in body, false);
    },
  },
  {
    name: "route users list tra role assignments kem store display va khong lo password",
    run: async () => {
      clearAdminCache();
      setPrismaModel("user", {
        findMany: async () => [
          {
            id: "user-1",
            email: "sm@example.com",
            fullName: "SM One",
            phone: null,
            isActive: true,
            createdAt: new Date("2026-05-01"),
            updatedAt: new Date("2026-05-02"),
            roleAssignments: [
              { id: "ra-1", roleKey: "store_manager", storeId: "store-1" },
            ],
          },
        ],
      });
      setPrismaModel("store", {
        findMany: async () => [
          {
            id: "store-1",
            code: "MC-001",
            name: "Maycha Store 1",
          },
        ],
      });
      const route = await import("../src/app/api/users/route");
      const result = await route.GET(
        fakeRouteRequest({ url: "http://localhost/api/users?role=store_manager" })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 200);
      assert.equal("password" in body.data[0], false);
      assert.deepEqual(body.data[0].roleAssignments[0], {
        id: "ra-1",
        roleKey: "store_manager",
        storeId: "store-1",
        store: {
          id: "store-1",
          code: "MC-001",
          name: "Maycha Store 1",
        },
      });
    },
  },
  {
    name: "route brand create chan trung code",
    run: async () => {
      setPrismaModel("brand", {
        findFirst: async () => ({ code: "MC", name: "Other" }),
      });

      const route = await import("../src/app/api/brands/route");
      const result = await route.POST(
        fakeRouteRequest({
          body: {
            code: "mc",
            name: "Maycha",
          },
        })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 400);
      assert.equal(body.error.message, "Brand code already exists");
    },
  },
  {
    name: "route store create chan sai brand cloud",
    run: async () => {
      setPrismaModel("store", {
        findUnique: async () => null,
      });
      setPrismaModel("brand", {
        findUnique: async () => ({ id: "brand-cloud", code: "CLOUD" }),
      });

      const route = await import("../src/app/api/stores/route");
      const result = await route.POST(
        fakeRouteRequest({
          body: {
            code: "mc-001",
            name: "Store 1",
            modelType: "standard",
            brandId: "brand-cloud",
          },
        })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 400);
      assert.equal(body.error.message, "Standard stores cannot use the CLOUD brand");
    },
  },
  {
    name: "route store assign-am chan inactive AM",
    run: async () => {
      setPrismaModel("store", {
        findUnique: async () => ({ id: "store-1" }),
      });
      setPrismaModel("user", {
        findFirst: async () => null,
      });

      const route = await import("../src/app/api/stores/[id]/assign-am/route");
      const result = await route.PATCH(
        fakeRouteRequest({
          body: {
            amId: "am-inactive",
          },
        }),
        { params: { id: "store-1" } }
      );
      const body = await responseJson(result);

      assert.equal(result.status, 400);
      assert.equal(body.error.message, "AM user must be active and have am role");
    },
  },
  {
    name: "route user create bat storeId cho store manager",
    run: async () => {
      const route = await import("../src/app/api/users/route");
      const result = await route.POST(
        fakeRouteRequest({
          body: {
            email: "sm@example.com",
            fullName: "Store Manager",
            password: "123456",
            roleAssignments: [
              {
                roleKey: "store_manager",
              },
            ],
          },
        })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 400);
      assert.equal(body.error.message, "Store manager role requires storeId");
    },
  },
  {
    name: "route user create chan store scope khong ton tai",
    run: async () => {
      setPrismaModel("store", {
        findMany: async () => [],
      });

      const route = await import("../src/app/api/users/route");
      const result = await route.POST(
        fakeRouteRequest({
          body: {
            email: "sm@example.com",
            fullName: "Store Manager",
            password: "123456",
            roleAssignments: [
              {
                roleKey: "store_manager",
                storeId: "store-missing",
              },
            ],
          },
        })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 400);
      assert.equal(body.error.message, "Store scope not found");
    },
  },
  {
    name: "route user update thay role assignments trong transaction",
    run: async () => {
      setPrismaModel("user", {
        findUnique: async () => ({ id: "user-1" }),
      });
      setPrismaModel("store", {
        findMany: async () => [
          {
            id: "store-1",
            code: "MC-001",
            name: "Maycha Store 1",
          },
        ],
      });
      setPrismaModel("$transaction", async (callback: any) =>
        callback({
          user: {
            update: async () => ({ id: "user-1" }),
            findUniqueOrThrow: async () => ({
              id: "user-1",
              email: "sm@example.com",
              fullName: "Store Manager",
              phone: null,
              isActive: true,
              createdAt: new Date("2026-05-01"),
              updatedAt: new Date("2026-05-02"),
              roleAssignments: [
                { id: "ra-1", roleKey: "store_manager", storeId: "store-1" },
              ],
            }),
          },
          roleAssignment: {
            deleteMany: async () => ({ count: 1 }),
            createMany: async () => ({ count: 1 }),
          },
        })
      );

      const route = await import("../src/app/api/users/[id]/route");
      const result = await route.PATCH(
        fakeRouteRequest({
          body: {
            roleAssignments: [
              {
                roleKey: "store_manager",
                storeId: "store-1",
              },
            ],
          },
        }),
        { params: { id: "user-1" } }
      );
      const body = await responseJson(result);

      assert.equal(result.status, 200);
      assert.deepEqual(body.data.roleAssignments[0].store, {
        id: "store-1",
        code: "MC-001",
        name: "Maycha Store 1",
      });
    },
  },
  {
    name: "route user toggle chan tu disable chinh minh",
    run: async () => {
      setPrismaModel("user", {
        findUnique: async () => ({
          id: "admin-1",
          roleAssignments: [{ roleKey: "company_admin" }],
        }),
      });

      const route = await import("../src/app/api/users/[id]/toggle-active/route");
      const result = await route.PATCH(
        fakeRouteRequest({
          userId: "admin-1",
          body: {
            isActive: false,
          },
        }),
        { params: { id: "admin-1" } }
      );
      const body = await responseJson(result);

      assert.equal(result.status, 400);
      assert.equal(body.error.message, "You cannot disable your own account");
    },
  },
  {
    name: "route user toggle chan disable company_admin cuoi cung",
    run: async () => {
      setPrismaModel("user", {
        findUnique: async () => ({
          id: "admin-2",
          roleAssignments: [{ roleKey: "company_admin" }],
        }),
        count: async () => 0,
      });

      const route = await import("../src/app/api/users/[id]/toggle-active/route");
      const result = await route.PATCH(
        fakeRouteRequest({
          userId: "admin-1",
          body: {
            isActive: false,
          },
        }),
        { params: { id: "admin-2" } }
      );
      const body = await responseJson(result);

      assert.equal(result.status, 400);
      assert.equal(body.error.message, "At least one active company admin is required");
    },
  },
  {
    name: "route auth login tra 403 khi account bi tat",
    run: async () => {
      setPrismaModel("user", {
        findUnique: async () => ({
          id: "user-1",
          email: "admin@example.com",
          fullName: "Admin",
          password: "hash",
          isActive: false,
          roleAssignments: [],
        }),
      });

      const route = await import("../src/app/api/auth/login/route");
      const result = await route.POST(
        fakeRouteRequest({
          body: {
            email: "admin@example.com",
            password: "123456",
          },
        })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 403);
      assert.equal(body.error.message, "Account is disabled");
    },
  },
  {
    name: "route criteria-groups list khong expose weight cua group",
    run: async () => {
      setPrismaModel("criteriaGroup", {
        findMany: async () => [
          {
            id: "group-c",
            code: "C",
            name: "Cleanliness",
            color: "#22c55e",
            isActive: true,
            createdAt: new Date("2026-05-01"),
            updatedAt: new Date("2026-05-02"),
          },
        ],
      });

      const route = await import("../src/app/api/criteria-groups/route");
      const result = await route.GET(fakeRouteRequest({ roles: ["qa_manager"] }));
      const body = await responseJson(result);

      assert.equal(result.status, 200);
      assert.equal(body.data[0].code, "C");
      assert.equal("weight" in body.data[0], false);
    },
  },
  {
    name: "route criteria create bat buoc group active",
    run: async () => {
      setPrismaModel("criteria", {
        findUnique: async () => null,
      });
      setPrismaModel("criteriaGroup", {
        findFirst: async () => null,
      });

      const route = await import("../src/app/api/criteria/route");
      const result = await route.POST(
        fakeRouteRequest({
          roles: ["qa_manager"],
          body: {
            code: "c-001",
            name: "San nha",
            content: "San nha khong sach",
            groupId: "missing-group",
            deductionPerError: 1,
            maxDeduction: 3,
            flag: "none",
          },
        })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 400);
      assert.equal(body.error.message, "Criteria group not found or inactive");
    },
  },
  {
    name: "route criteria create cho phep ccp khong gui dbase dmax",
    run: async () => {
      let createdData: any = null;
      setPrismaModel("criteria", {
        findUnique: async () => null,
        create: async (args: any) => {
          createdData = args.data;
          return {
            id: "criteria-ccp",
            ...args.data,
            group: { id: "group-c", code: "C", name: "Cleanliness" },
            createdAt: new Date("2026-05-01"),
            updatedAt: new Date("2026-05-02"),
          };
        },
      });
      setPrismaModel("criteriaGroup", {
        findFirst: async () => ({ id: "group-c" }),
      });

      const route = await import("../src/app/api/criteria/route");
      const result = await route.POST(
        fakeRouteRequest({
          roles: ["qa_manager"],
          body: {
            code: "ccp-001",
            name: "CCP nhom",
            content: "Loi CCP lam mat diem nhom",
            groupId: "group-c",
            flag: "critical",
          },
        })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 201);
      assert.equal(body.data.name, "CCP nhom");
      assert.equal(createdData.deductionPerError, 0);
      assert.equal(createdData.maxDeduction, 0);
      assert.equal(body.data.flag, "critical");
    },
  },
  {
    name: "route criteria create cho phep risk global khong chon group",
    run: async () => {
      let groupLookupCalled = false;
      let createdData: any = null;
      setPrismaModel("criteria", {
        findUnique: async () => null,
        create: async (args: any) => {
          createdData = args.data;
          return {
            id: "criteria-risk",
            ...args.data,
            group: null,
            createdAt: new Date("2026-05-01"),
            updatedAt: new Date("2026-05-02"),
          };
        },
      });
      setPrismaModel("criteriaGroup", {
        findFirst: async () => {
          groupLookupCalled = true;
          return null;
        },
      });

      const route = await import("../src/app/api/criteria/route");
      const result = await route.POST(
        fakeRouteRequest({
          roles: ["qa_manager"],
          body: {
            code: "risk-001",
            name: "Risk toan bai",
            content: "Loi risk lam diem toan bai ve 0",
            flag: "risk",
            groupId: "",
            deductionPerError: 0,
            maxDeduction: 0,
          },
        })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 201);
      assert.equal(groupLookupCalled, false);
      assert.equal(createdData.groupId, null);
      assert.equal(createdData.deductionPerError, 0);
      assert.equal(createdData.maxDeduction, 0);
      assert.equal(body.data.name, "Risk toan bai");
      assert.equal(body.data.group, null);
    },
  },
  {
    name: "route criteria create cho phep risk global groupId null",
    run: async () => {
      let groupLookupCalled = false;
      let createdData: any = null;
      setPrismaModel("criteria", {
        findUnique: async () => null,
        create: async (args: any) => {
          createdData = args.data;
          return {
            id: "criteria-risk-null",
            ...args.data,
            group: null,
            createdAt: new Date("2026-05-01"),
            updatedAt: new Date("2026-05-02"),
          };
        },
      });
      setPrismaModel("criteriaGroup", {
        findFirst: async () => {
          groupLookupCalled = true;
          return null;
        },
      });

      const route = await import("../src/app/api/criteria/route");
      const result = await route.POST(
        fakeRouteRequest({
          roles: ["qa_manager"],
          body: {
            code: "risk-002",
            name: "Risk global",
            content: "Loi risk global khong can nhom",
            flag: "risk",
            groupId: null,
            deductionPerError: 0,
            maxDeduction: 0,
          },
        })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 201);
      assert.equal(groupLookupCalled, false);
      assert.equal(createdData.groupId, null);
      assert.equal(createdData.deductionPerError, 0);
      assert.equal(createdData.maxDeduction, 0);
      assert.equal(body.data.group, null);
    },
  },
  {
    name: "route criteria create bat dbase dmax cho tieu chi thuong",
    run: async () => {
      const route = await import("../src/app/api/criteria/route");
      const result = await route.POST(
        fakeRouteRequest({
          roles: ["qa_manager"],
          body: {
            code: "normal-001",
            name: "Loi thuong",
            content: "Loi thuong can diem tru",
            groupId: "group-c",
            flag: "none",
          },
        })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 400);
      assert.equal(body.error.message, "deductionPerError is required for normal criteria");
    },
  },
  {
    name: "route checklist publish chan tong section weight khac 100",
    run: async () => {
      setPrismaModel("checklistForm", {
        findUnique: async () => ({
          id: "form-1",
          name: "Checklist Cua Hang",
          version: "v1",
          status: "draft",
          publishedAt: null,
          createdAt: new Date("2026-05-01"),
          updatedAt: new Date("2026-05-02"),
          sections: [
            {
              id: "section-1",
              name: "C",
              order: 1,
              groupId: "group-c",
              weight: 70,
              createdAt: new Date("2026-05-01"),
              group: { id: "group-c", code: "C", name: "Cleanliness" },
              items: [
                {
                  id: "item-1",
                  order: 1,
                  criteriaId: "criteria-1",
                  criteria: {
                    id: "criteria-1",
                    code: "C-001",
                    content: "San sach",
                    groupId: "group-c",
                    deductionPerError: 1,
                    maxDeduction: 3,
                    flag: "none",
                    isActive: true,
                    createdAt: new Date("2026-05-01"),
                    updatedAt: new Date("2026-05-02"),
                    group: { id: "group-c", code: "C", name: "Cleanliness" },
                  },
                },
              ],
            },
          ],
        }),
      });

      const route = await import("../src/app/api/checklists/[id]/publish/route");
      const result = await route.POST(
        fakeRouteRequest({ roles: ["qa_manager"] }),
        { params: { id: "form-1" } }
      );
      const body = await responseJson(result);

      assert.equal(result.status, 400);
      assert.equal(body.error.message, "Checklist section weights must total 100");
    },
  },
  {
    name: "route audit-plan create khong nhan contract cu stores + auditorId",
    run: async () => {
      const route = await import("../src/app/api/audit-plans/route");
      const result = await route.POST(
        fakeRouteRequest({
          roles: ["qa_manager"],
          body: {
            name: "Plan Sai Contract",
            formId: "form-1",
            stores: ["store-1", "store-2"],
            auditorId: "qc-1",
          },
        })
      );

      assert.equal(result.status, 400);
    },
  },
  {
    name: "route audit-plan create chan audit window sai thu tu ngay",
    run: async () => {
      const route = await import("../src/app/api/audit-plans/route");
      const result = await route.POST(
        fakeRouteRequest({
          roles: ["qa_manager"],
          body: {
            name: "Plan Sai Window",
            formId: "form-1",
            startDate: "2026-05-30",
            endDate: "2026-05-01",
            assignments: [
              {
                storeId: "store-1",
                auditorId: "qc-1",
              },
            ],
          },
        })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 400);
      assert.equal(body.error.message, "startDate must be before or equal to endDate");
    },
  },
  {
    name: "route audit-plan create tao window va assignment theo tung store QC",
    run: async () => {
      let createdAssignments: any[] = [];
      let createdPlanWindow: any = {};
      let createdPlanStatus = "";
      setPrismaModel("checklistForm", {
        findUnique: async () => ({ id: "form-1", status: "published" }),
      });
      setPrismaModel("store", {
        findMany: async () => [{ id: "store-1" }, { id: "store-2" }],
      });
      setPrismaModel("user", {
        findMany: async () => [{ id: "qc-1" }, { id: "qc-2" }],
      });
      setPrismaModel("$transaction", async (callback: any) =>
        callback({
          auditPlan: {
            create: async (args: any) => {
              createdAssignments = args.data.assignments.create;
              createdPlanWindow = {
                startDate: args.data.startDate,
                endDate: args.data.endDate,
              };
              createdPlanStatus = args.data.status;
              return { id: "plan-1" };
            },
            findUniqueOrThrow: async () => ({
              id: "plan-1",
              name: "Plan Dung Contract",
              type: "adhoc",
              scope: "company",
              status: "draft",
              formId: "form-1",
              startDate: new Date("2026-05-20"),
              endDate: new Date("2026-05-30"),
              createdAt: new Date("2026-05-01"),
              updatedAt: new Date("2026-05-02"),
              form: {
                id: "form-1",
                name: "Checklist",
                version: "v1",
                status: "published",
              },
              assignments: [
                {
                  id: "assignment-1",
                  status: "pending",
                  auditId: null,
                  storeId: "store-1",
                  auditorId: "qc-1",
                  store: { id: "store-1", code: "MC-001", name: "Store 1" },
                  auditor: { id: "qc-1", fullName: "QC One", email: "qc1@example.com" },
                },
                {
                  id: "assignment-2",
                  status: "pending",
                  auditId: null,
                  storeId: "store-2",
                  auditorId: "qc-2",
                  store: { id: "store-2", code: "MC-002", name: "Store 2" },
                  auditor: { id: "qc-2", fullName: "QC Two", email: "qc2@example.com" },
                },
              ],
            }),
          },
        })
      );

      const route = await import("../src/app/api/audit-plans/route");
      const result = await route.POST(
        fakeRouteRequest({
          roles: ["qa_manager"],
          body: {
            name: "Plan Dung Contract",
            formId: "form-1",
            startDate: "2026-05-20",
            endDate: "2026-05-30",
            assignments: [
              {
                storeId: "store-1",
                auditorId: "qc-1",
              },
              {
                storeId: "store-2",
                auditorId: "qc-2",
              },
            ],
          },
        })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 201);
      assert.deepEqual(
        createdAssignments.map((assignment) => ({
          storeId: assignment.storeId,
          auditorId: assignment.auditorId,
          hasScheduledDate: "scheduledDate" in assignment,
        })),
        [
          { storeId: "store-1", auditorId: "qc-1", hasScheduledDate: false },
          { storeId: "store-2", auditorId: "qc-2", hasScheduledDate: false },
        ]
      );
      assert.equal(createdPlanWindow.startDate.toISOString(), "2026-05-20T00:00:00.000Z");
      assert.equal(createdPlanWindow.endDate.toISOString(), "2026-05-30T00:00:00.000Z");
      assert.equal(createdPlanStatus, "draft");
      assert.equal(body.data.status, "draft");
      assert.equal(body.data.startDate, new Date("2026-05-20").toISOString());
      assert.equal(body.data.endDate, new Date("2026-05-30").toISOString());
      assert.equal(body.data.progress.total, 2);
      assert.equal(body.data.assignments[1].auditor.fullName, "QC Two");
    },
  },
  {
    name: "route audit-plan publish chuyen draft thanh open",
    run: async () => {
      let updatedStatus = "";
      setPrismaModel("auditPlan", {
        findUnique: async () => ({
          id: "plan-1",
          status: "draft",
          startDate: new Date("2026-05-20"),
          endDate: new Date("2026-05-30"),
          form: { status: "published" },
          assignments: [
            {
              id: "assignment-1",
              store: { isActive: true },
              auditor: {
                isActive: true,
                roleAssignments: [{ roleKey: "qc_auditor" }],
              },
            },
          ],
        }),
        update: async (args: any) => {
          updatedStatus = args.data.status;
          return auditPlanFixture({ status: "open" });
        },
      });

      const route = await import("../src/app/api/audit-plans/[id]/publish/route");
      const result = await route.POST(
        fakeRouteRequest({ roles: ["qa_manager"] }),
        { params: { id: "plan-1" } }
      );
      const body = await responseJson(result);

      assert.equal(result.status, 200);
      assert.equal(updatedStatus, "open");
      assert.equal(body.data.status, "open");
    },
  },
  {
    name: "route audit-plan publish chan plan khong co assignment",
    run: async () => {
      setPrismaModel("auditPlan", {
        findUnique: async () => ({
          id: "plan-1",
          status: "draft",
          startDate: new Date("2026-05-20"),
          endDate: new Date("2026-05-30"),
          form: { status: "published" },
          assignments: [],
        }),
      });

      const route = await import("../src/app/api/audit-plans/[id]/publish/route");
      const result = await route.POST(
        fakeRouteRequest({ roles: ["qa_manager"] }),
        { params: { id: "plan-1" } }
      );
      const body = await responseJson(result);

      assert.equal(result.status, 400);
      assert.equal(body.error.message, "Audit plan requires at least one assignment");
    },
  },
  {
    name: "route audit-plan patch draft sua full assignments",
    run: async () => {
      let deletedPlanId = "";
      let createdAssignments: any[] = [];
      let updatedData: any = {};
      setPrismaModel("auditPlan", {
        findUnique: async () => ({
          id: "plan-1",
          status: "draft",
          formId: "form-1",
          startDate: new Date("2026-05-20"),
          endDate: new Date("2026-05-30"),
        }),
      });
      setPrismaModel("checklistForm", {
        findUnique: async () => ({ id: "form-2", status: "published" }),
      });
      setPrismaModel("store", {
        findMany: async () => [{ id: "store-2" }],
      });
      setPrismaModel("user", {
        findMany: async () => [{ id: "qc-2" }],
      });
      setPrismaModel("$transaction", async (callback: any) =>
        callback({
          auditPlan: {
            update: async (args: any) => {
              updatedData = args.data;
              return { id: "plan-1" };
            },
            findUniqueOrThrow: async () =>
              auditPlanFixture({
                name: "Plan Updated",
                formId: "form-2",
                assignments: [
                  {
                    id: "assignment-2",
                    status: "pending",
                    auditId: null,
                    storeId: "store-2",
                    auditorId: "qc-2",
                    store: { id: "store-2", code: "MC-002", name: "Store 2" },
                    auditor: { id: "qc-2", fullName: "QC Two", email: "qc2@example.com" },
                  },
                ],
              }),
          },
          auditAssignment: {
            deleteMany: async (args: any) => {
              deletedPlanId = args.where.planId;
              return { count: 1 };
            },
            createMany: async (args: any) => {
              createdAssignments = args.data;
              return { count: args.data.length };
            },
          },
        })
      );

      const route = await import("../src/app/api/audit-plans/[id]/route");
      const result = await route.PATCH(
        fakeRouteRequest({
          roles: ["qa_manager"],
          body: {
            name: "Plan Updated",
            formId: "form-2",
            startDate: "2026-06-01",
            endDate: "2026-06-10",
            assignments: [{ storeId: "store-2", auditorId: "qc-2" }],
          },
        }),
        { params: { id: "plan-1" } }
      );
      const body = await responseJson(result);

      assert.equal(result.status, 200);
      assert.equal(updatedData.name, "Plan Updated");
      assert.equal(updatedData.formId, "form-2");
      assert.equal(deletedPlanId, "plan-1");
      assert.deepEqual(createdAssignments, [
        {
          planId: "plan-1",
          storeId: "store-2",
          auditorId: "qc-2",
          status: "pending",
        },
      ]);
      assert.equal(body.data.assignments[0].auditor.fullName, "QC Two");
    },
  },
  {
    name: "route audit-plan patch open khong cho doi checklist",
    run: async () => {
      setPrismaModel("auditPlan", {
        findUnique: async () => ({
          id: "plan-1",
          status: "open",
          formId: "form-1",
          startDate: new Date("2026-05-20"),
          endDate: new Date("2026-05-30"),
        }),
      });

      const route = await import("../src/app/api/audit-plans/[id]/route");
      const result = await route.PATCH(
        fakeRouteRequest({
          roles: ["qa_manager"],
          body: { formId: "form-2" },
        }),
        { params: { id: "plan-1" } }
      );
      const body = await responseJson(result);

      assert.equal(result.status, 400);
      assert.equal(body.error.message, "Open audit plan can only update name and audit window");
    },
  },
  {
    name: "route audit-plan patch open cho sua audit window",
    run: async () => {
      let updatedData: any = {};
      setPrismaModel("auditPlan", {
        findUnique: async () => ({
          id: "plan-1",
          status: "open",
          formId: "form-1",
          startDate: new Date("2026-05-20"),
          endDate: new Date("2026-05-30"),
        }),
      });
      setPrismaModel("$transaction", async (callback: any) =>
        callback({
          auditPlan: {
            update: async (args: any) => {
              updatedData = args.data;
              return { id: "plan-1" };
            },
            findUniqueOrThrow: async () =>
              auditPlanFixture({
                status: "open",
                startDate: new Date("2026-06-01"),
                endDate: new Date("2026-06-10"),
              }),
          },
          auditAssignment: {
            deleteMany: async () => ({ count: 0 }),
            createMany: async () => ({ count: 0 }),
          },
        })
      );

      const route = await import("../src/app/api/audit-plans/[id]/route");
      const result = await route.PATCH(
        fakeRouteRequest({
          roles: ["qa_manager"],
          body: {
            startDate: "2026-06-01",
            endDate: "2026-06-10",
          },
        }),
        { params: { id: "plan-1" } }
      );
      const body = await responseJson(result);

      assert.equal(result.status, 200);
      assert.equal(updatedData.startDate.toISOString(), "2026-06-01T00:00:00.000Z");
      assert.equal(body.data.startDate, new Date("2026-06-01").toISOString());
    },
  },
  {
    name: "route audit assignment patch doi QC khi pending",
    run: async () => {
      let updatedAuditorId = "";
      setPrismaModel("auditAssignment", {
        findUnique: async () => ({
          id: "assignment-1",
          planId: "plan-1",
          status: "pending",
          auditId: null,
          plan: { status: "open" },
        }),
        update: async (args: any) => {
          updatedAuditorId = args.data.auditorId;
          return { id: args.where.id };
        },
      });
      setPrismaModel("user", {
        findFirst: async () => ({ id: "qc-2" }),
      });
      setPrismaModel("auditPlan", {
        findUniqueOrThrow: async () =>
          auditPlanFixture({
            status: "open",
            assignments: [
              {
                id: "assignment-1",
                status: "pending",
                auditId: null,
                storeId: "store-1",
                auditorId: "qc-2",
                store: { id: "store-1", code: "MC-001", name: "Store 1" },
                auditor: { id: "qc-2", fullName: "QC Two", email: "qc2@example.com" },
              },
            ],
          }),
      });

      const route = await import(
        "../src/app/api/audit-plans/[id]/assignments/[assignmentId]/route"
      );
      const result = await route.PATCH(
        fakeRouteRequest({
          roles: ["qa_manager"],
          body: { auditorId: "qc-2" },
        }),
        { params: { id: "plan-1", assignmentId: "assignment-1" } }
      );
      const body = await responseJson(result);

      assert.equal(result.status, 200);
      assert.equal(updatedAuditorId, "qc-2");
      assert.equal(body.data.assignments[0].auditor.fullName, "QC Two");
    },
  },
  {
    name: "route audit assignment patch chan assignment dang in_progress",
    run: async () => {
      setPrismaModel("auditAssignment", {
        findUnique: async () => ({
          id: "assignment-1",
          planId: "plan-1",
          status: "in_progress",
          auditId: null,
          plan: { status: "open" },
        }),
      });

      const route = await import(
        "../src/app/api/audit-plans/[id]/assignments/[assignmentId]/route"
      );
      const result = await route.PATCH(
        fakeRouteRequest({
          roles: ["qa_manager"],
          body: { auditorId: "qc-2" },
        }),
        { params: { id: "plan-1", assignmentId: "assignment-1" } }
      );
      const body = await responseJson(result);

      assert.equal(result.status, 400);
      assert.equal(body.error.message, "Only pending assignment can be changed");
    },
  },
  {
    name: "route audit assignment delete chan xoa assignment cuoi khi open",
    run: async () => {
      setPrismaModel("auditAssignment", {
        findUnique: async () => ({
          id: "assignment-1",
          planId: "plan-1",
          status: "pending",
          auditId: null,
          plan: { status: "open" },
        }),
        count: async () => 1,
      });

      const route = await import(
        "../src/app/api/audit-plans/[id]/assignments/[assignmentId]/route"
      );
      const result = await route.DELETE(
        fakeRouteRequest({ roles: ["qa_manager"] }),
        { params: { id: "plan-1", assignmentId: "assignment-1" } }
      );
      const body = await responseJson(result);

      assert.equal(result.status, 400);
      assert.equal(body.error.message, "Open audit plan requires at least one assignment");
    },
  },
  {
    name: "route audit assignment delete xoa pending thanh cong",
    run: async () => {
      let deletedAssignmentId = "";
      setPrismaModel("auditAssignment", {
        findUnique: async () => ({
          id: "assignment-1",
          planId: "plan-1",
          status: "pending",
          auditId: null,
          plan: { status: "draft" },
        }),
        delete: async (args: any) => {
          deletedAssignmentId = args.where.id;
          return { id: args.where.id };
        },
      });
      setPrismaModel("auditPlan", {
        findUniqueOrThrow: async () =>
          auditPlanFixture({
            assignments: [],
          }),
      });

      const route = await import(
        "../src/app/api/audit-plans/[id]/assignments/[assignmentId]/route"
      );
      const result = await route.DELETE(
        fakeRouteRequest({ roles: ["qa_manager"] }),
        { params: { id: "plan-1", assignmentId: "assignment-1" } }
      );
      const body = await responseJson(result);

      assert.equal(result.status, 200);
      assert.equal(deletedAssignmentId, "assignment-1");
      assert.equal(body.data.progress.total, 0);
    },
  },
  {
    name: "route my-assignments chi lay assignment cua QC hien tai",
    run: async () => {
      let scopedAuditorId = "";
      let scopedPlanStatus = "";
      setPrismaModel("auditAssignment", {
        findMany: async (args: any) => {
          scopedAuditorId = args.where.auditorId;
          scopedPlanStatus = args.where.plan.status;
          return [
            {
              id: "assignment-1",
              status: "pending",
              auditId: null,
              store: { id: "store-1", code: "MC-001", name: "Store 1" },
              plan: {
                id: "plan-1",
                name: "Plan 1",
                status: "open",
                startDate: new Date("2026-05-01"),
                endDate: new Date("2026-06-30"),
                form: { id: "form-1", name: "Checklist", version: "v1" },
              },
            },
          ];
        },
      });

      const route = await import("../src/app/api/audit-plans/my-assignments/route");
      const result = await route.GET(
        fakeRouteRequest({
          userId: "qc-1",
          roles: ["qc_auditor"],
        })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 200);
      assert.equal(scopedAuditorId, "qc-1");
      assert.equal(scopedPlanStatus, "open");
      assert.equal(body.data[0].plan.isAuditWindowOpen, true);
      assert.deepEqual(body.data[0].checklist, {
        id: "form-1",
        name: "Checklist",
        version: "v1",
      });
    },
  },
  {
    name: "route checklist section delete chi cho draft checklist",
    run: async () => {
      setPrismaModel("checklistSection", {
        findUnique: async () => ({
          id: "section-1",
          formId: "form-1",
          form: { status: "published" },
        }),
      });

      const route = await import(
        "../src/app/api/checklists/[id]/sections/[sectionId]/route"
      );
      const result = await route.DELETE(
        fakeRouteRequest({ roles: ["qa_manager"] }),
        { params: { id: "form-1", sectionId: "section-1" } }
      );
      const body = await responseJson(result);

      assert.equal(result.status, 400);
      assert.equal(body.error.message, "Only draft checklist can be changed");
    },
  },
  {
    name: "route checklist item create chan add risk vao section group",
    run: async () => {
      let duplicateLookupCalled = false;
      setPrismaModel("checklistSection", {
        findUnique: async () => ({
          id: "section-1",
          formId: "form-1",
          groupId: "group-c",
          form: { status: "draft" },
        }),
      });
      setPrismaModel("criteria", {
        findFirst: async () => ({
          id: "criteria-risk",
          groupId: null,
          flag: "risk",
        }),
      });
      setPrismaModel("checklistSectionItem", {
        findUnique: async () => {
          duplicateLookupCalled = true;
          return null;
        },
      });

      const route = await import(
        "../src/app/api/checklists/[id]/sections/[sectionId]/items/route"
      );
      const result = await route.POST(
        fakeRouteRequest({
          roles: ["qa_manager"],
          body: {
            criteriaId: "criteria-risk",
            order: 1,
          },
        }),
        { params: { id: "form-1", sectionId: "section-1" } }
      );
      const body = await responseJson(result);

      assert.equal(result.status, 400);
      assert.equal(duplicateLookupCalled, false);
      assert.equal(
        body.error.message,
        "Risk criteria are global and cannot be added to a group section"
      );
    },
  },
  {
    name: "route checklist item delete xoa dung item va tra checklist detail",
    run: async () => {
      let deletedItemId = "";
      setPrismaModel("checklistSectionItem", {
        findUnique: async () => ({
          id: "item-1",
          sectionId: "section-1",
          section: {
            formId: "form-1",
            form: { status: "draft" },
          },
        }),
        delete: async (args: any) => {
          deletedItemId = args.where.id;
          return { id: args.where.id };
        },
      });
      setPrismaModel("checklistForm", {
        findUniqueOrThrow: async () => ({
          id: "form-1",
          name: "Checklist",
          version: "v1",
          status: "draft",
          publishedAt: null,
          createdAt: new Date("2026-05-01"),
          updatedAt: new Date("2026-05-02"),
          sections: [],
        }),
      });

      const route = await import(
        "../src/app/api/checklists/[id]/sections/[sectionId]/items/[itemId]/route"
      );
      const result = await route.DELETE(
        fakeRouteRequest({ roles: ["qa_manager"] }),
        {
          params: {
            id: "form-1",
            sectionId: "section-1",
            itemId: "item-1",
          },
        }
      );
      const body = await responseJson(result);

      assert.equal(result.status, 200);
      assert.equal(deletedItemId, "item-1");
      assert.equal(body.data.id, "form-1");
      assert.deepEqual(body.data.sections, []);
    },
  },
  {
    name: "scoring tinh diem thuong, critical va risk dung rule",
    run: () => {
      const normal = calculateAuditScore({
        groups: [
          { id: "group-c", code: "C", weight: 50 },
          { id: "group-h", code: "H", weight: 50 },
        ],
        criteria: [
          {
            id: "criteria-c",
            groupId: "group-c",
            groupCode: "C",
            deductionPerError: 2,
            maxDeduction: 10,
            flag: "none",
          },
          {
            id: "criteria-h",
            groupId: "group-h",
            groupCode: "H",
            deductionPerError: 0,
            maxDeduction: 0,
            flag: "critical",
          },
        ],
        violations: [
          {
            criteriaId: "criteria-c",
            numErrors: 2,
            repeatCount: 1,
            repeatLabel: "second",
            isCriticalTriggered: false,
          },
          {
            criteriaId: "criteria-h",
            numErrors: 1,
            repeatCount: 0,
            repeatLabel: "first",
            isCriticalTriggered: false,
          },
        ],
      });

      assert.equal(normal.finalScore, 10);
      assert.equal(normal.groupScores[1].triggeredCritical, true);

      const risk = calculateAuditScore({
        groups: [{ id: "group-c", code: "C", weight: 100 }],
        criteria: [
          {
            id: "criteria-risk",
            groupId: null,
            groupCode: "",
            deductionPerError: 0,
            maxDeduction: 0,
            flag: "risk",
          },
        ],
        violations: [
          {
            criteriaId: "criteria-risk",
            numErrors: 1,
            repeatCount: 0,
            repeatLabel: "first",
            isCriticalTriggered: false,
          },
        ],
      });

      assert.equal(risk.finalScore, 0);
      assert.equal(risk.grade, "alarm");
    },
  },
  {
    name: "scoring dung diem chuan raw theo maxDeduction cua Excel",
    run: () => {
      const score = calculateAuditScore({
        groups: [
          { id: "group-c", code: "C", weight: 35 },
          { id: "group-h", code: "H", weight: 10 },
        ],
        criteria: [
          {
            id: "c1",
            groupId: "group-c",
            groupCode: "C",
            deductionPerError: 3,
            maxDeduction: 6,
            flag: "none",
          },
          {
            id: "c2",
            groupId: "group-c",
            groupCode: "C",
            deductionPerError: 5,
            maxDeduction: 10,
            flag: "none",
          },
          {
            id: "h1",
            groupId: "group-h",
            groupCode: "H",
            deductionPerError: 3,
            maxDeduction: 6,
            flag: "none",
          },
        ],
        violations: [
          {
            criteriaId: "c1",
            numErrors: 1,
            repeatCount: 0,
            repeatLabel: "first",
            isCriticalTriggered: false,
          },
        ],
      });

      assert.equal(score.groupScores[0].maxScore, 16);
      assert.equal(score.groupScores[0].reachedScore, 13);
      assert.equal(score.groupScores[0].percentage, 81.25);
      assert.equal(score.groupScores[1].maxScore, 6);
      assert.equal(score.finalScore, 38.44);
    },
  },
  {
    name: "score breakdown tra chi tiet tru diem theo group va risk",
    run: () => {
      const audit: any = {
        finalScore: 0,
        grade: "alarm",
        isRiskTriggered: true,
        form: {
          sections: [
            {
              id: "section-a",
              weight: 40,
              group: { id: "group-a", code: "A", name: "An toan", weight: 40 },
              items: [
                {
                  criteria: {
                    id: "criteria-a1",
                    code: "A1",
                    content: "Loi thuong",
                    flag: "none",
                    groupId: "group-a",
                    deductionPerError: 2,
                    maxDeduction: 10,
                    group: { id: "group-a", code: "A", name: "An toan" },
                  },
                },
                {
                  criteria: {
                    id: "criteria-a2",
                    code: "A2",
                    content: "Loi CCP",
                    flag: "critical",
                    groupId: "group-a",
                    deductionPerError: 0,
                    maxDeduction: 0,
                    group: { id: "group-a", code: "A", name: "An toan" },
                  },
                },
              ],
            },
            {
              id: "section-b",
              weight: 60,
              group: { id: "group-b", code: "B", name: "Dich vu", weight: 60 },
              items: [
                {
                  criteria: {
                    id: "criteria-b1",
                    code: "B1",
                    content: "Loi lap",
                    flag: "none",
                    groupId: "group-b",
                    deductionPerError: 3,
                    maxDeduction: 12,
                    group: { id: "group-b", code: "B", name: "Dich vu" },
                  },
                },
                {
                  criteria: {
                    id: "criteria-risk",
                    code: "R1",
                    content: "Risk",
                    flag: "risk",
                    groupId: null,
                    deductionPerError: 0,
                    maxDeduction: 0,
                    group: null,
                  },
                },
              ],
            },
          ],
        },
        groupScores: [
          {
            groupId: "group-a",
            groupCode: "A",
            weight: 40,
            maxScore: 100,
            reachedScore: 0,
            percentage: 0,
            triggeredCritical: true,
          },
          {
            groupId: "group-b",
            groupCode: "B",
            weight: 60,
            maxScore: 100,
            reachedScore: 91,
            percentage: 91,
            triggeredCritical: false,
          },
        ],
        violations: [
          {
            id: "violation-a1",
            numErrors: 2,
            repeatCount: 0,
            isCriticalTriggered: false,
            isRiskTriggered: false,
            note: "normal",
            evidences: [{ id: "img-1", url: "/img.jpg" }],
            criteria: {
              id: "criteria-a1",
              code: "A1",
              content: "Loi thuong",
              flag: "none",
              groupId: "group-a",
              deductionPerError: 2,
              maxDeduction: 10,
              group: { id: "group-a", code: "A", name: "An toan" },
            },
          },
          {
            id: "violation-a2",
            numErrors: 1,
            repeatCount: 0,
            isCriticalTriggered: false,
            isRiskTriggered: false,
            note: "ccp",
            evidences: [],
            criteria: {
              id: "criteria-a2",
              code: "A2",
              content: "Loi CCP",
              flag: "critical",
              groupId: "group-a",
              deductionPerError: 0,
              maxDeduction: 0,
              group: { id: "group-a", code: "A", name: "An toan" },
            },
          },
          {
            id: "violation-b1",
            numErrors: 1,
            repeatCount: 2,
            isCriticalTriggered: false,
            isRiskTriggered: false,
            note: "repeat",
            evidences: [],
            criteria: {
              id: "criteria-b1",
              code: "B1",
              content: "Loi lap",
              flag: "none",
              groupId: "group-b",
              deductionPerError: 3,
              maxDeduction: 12,
              group: { id: "group-b", code: "B", name: "Dich vu" },
            },
          },
          {
            id: "violation-risk",
            numErrors: 1,
            repeatCount: 0,
            isCriticalTriggered: false,
            isRiskTriggered: true,
            note: "risk",
            evidences: [],
            criteria: {
              id: "criteria-risk",
              code: "R1",
              content: "Risk",
              flag: "risk",
              groupId: null,
              deductionPerError: 0,
              maxDeduction: 0,
              group: null,
            },
          },
        ],
      };

      const breakdown = buildAuditScoreBreakdown(audit);

      assert.equal(breakdown.groups[0].criteriaCount, 2);
      assert.equal(breakdown.groups[0].checkedCount, 2);
      assert.equal(breakdown.groups[0].triggeredCritical, true);
      assert.equal(breakdown.groups[0].ccpCount, 1);
      assert.equal(breakdown.groups[0].deductions[0].deductedScore, 4);
      assert.equal(breakdown.groups[0].deductions[1].effect, "critical_group_zero");
      assert.equal(breakdown.groups[1].criteriaCount, 1);
      assert.equal(breakdown.groups[1].deductions[0].repeatLabel, "third");
      assert.equal(breakdown.groups[1].deductions[0].multiplier, 3);
      assert.equal(breakdown.groups[1].deductions[0].deductedScore, 9);
      assert.equal(breakdown.risk.triggered, true);
      assert.equal(breakdown.risk.count, 1);
      assert.equal(breakdown.totals.finalScore, 0);
    },
  },
  {
    name: "route audit detail tra scoreBreakdown cho FE",
    run: async () => {
      setPrismaModel("audit", {
        findUnique: async () => ({
          id: "audit-1",
          storeId: "store-1",
          auditorId: "qc-1",
          finalScore: 96,
          grade: "excellent",
          isRiskTriggered: false,
          submittedAt: new Date("2026-05-19"),
          editedAt: null,
          editNote: null,
          store: { id: "store-1", code: "ST001", name: "Store 1" },
          form: {
            id: "form-1",
            name: "Checklist",
            version: "v1",
            status: "published",
            sections: [
              {
                id: "section-a",
                weight: 100,
                group: { id: "group-a", code: "A", name: "An toan", weight: 100 },
                items: [
                  {
                    id: "item-a1",
                    criteria: {
                      id: "criteria-a1",
                      code: "A1",
                      content: "Loi thuong",
                      flag: "none",
                      groupId: "group-a",
                      deductionPerError: 2,
                      maxDeduction: 10,
                      group: { id: "group-a", code: "A", name: "An toan" },
                    },
                  },
                ],
              },
            ],
          },
          groupScores: [
            {
              id: "gs-1",
              groupId: "group-a",
              groupCode: "A",
              weight: 100,
              maxScore: 100,
              reachedScore: 96,
              percentage: 96,
              triggeredCritical: false,
            },
          ],
          violations: [
            {
              id: "violation-a1",
              numErrors: 2,
              repeatCount: 0,
              isCriticalTriggered: false,
              isRiskTriggered: false,
              note: "normal",
              evidences: [],
              criteria: {
                id: "criteria-a1",
                code: "A1",
                content: "Loi thuong",
                flag: "none",
                groupId: "group-a",
                deductionPerError: 2,
                maxDeduction: 10,
                group: { id: "group-a", code: "A", name: "An toan" },
              },
            },
          ],
          actionPlan: null,
          correctionRequests: [],
        }),
      });
      setPrismaModel("user", {
        findUnique: async () => ({
          id: "qc-1",
          fullName: "QC One",
          email: "qc@example.com",
        }),
      });

      const route = await import("../src/app/api/audits/[id]/route");
      const result = await route.GET(
        fakeRouteRequest({
          userId: "qam-1",
          roles: ["qa_manager"],
        }),
        { params: { id: "audit-1" } }
      );
      const body = await responseJson(result);

      assert.equal(result.status, 200);
      assert.equal(body.data.checklist.sections, undefined);
      assert.equal(body.data.scoreBreakdown.groups[0].groupCode, "A");
      assert.equal(body.data.scoreBreakdown.groups[0].deductions[0].deductedScore, 4);
    },
  },
  {
    name: "route audit session tra du lieu co ban va khong kem history bundle",
    run: async () => {
      setPrismaModel("auditAssignment", {
        findUnique: async () => ({
          id: "assignment-1",
          status: "pending",
          auditId: null,
          auditorId: "qc-1",
          storeId: "store-1",
          store: { id: "store-1", code: "MC-001", name: "Store 1" },
          plan: {
            id: "plan-1",
            name: "Plan 1",
            status: "open",
            startDate: new Date("2026-05-01"),
            endDate: new Date("2026-06-30"),
            formId: "form-1",
            form: {
              id: "form-1",
              name: "Checklist",
              version: "v1",
              status: "published",
              sections: [],
            },
          },
          audit: null,
        }),
      });
      setPrismaModel("criteria", {
        findMany: async () => [
          {
            id: "risk-1",
            code: "RISK-01",
            content: "Risk global",
            groupId: null,
            deductionPerError: 0,
            maxDeduction: 0,
            flag: "risk",
            isActive: true,
            group: null,
          },
        ],
      });

      const route = await import("../src/app/api/audits/assignments/[assignmentId]/route");
      const result = await route.GET(
        fakeRouteRequest({
          userId: "qc-1",
          roles: ["qc_auditor"],
        }),
        { params: { assignmentId: "assignment-1" } }
      );
      const body = await responseJson(result);

      assert.equal(result.status, 200);
      assert.equal(body.data.assignment.store.name, "Store 1");
      assert.equal(body.data.riskCriteria[0].code, "RISK-01");
      assert.equal("historiesByCriteriaId" in body.data, false);
    },
  },
  {
    name: "route audit history bundle gom lich su theo criteria trong mot lan",
    run: async () => {
      let violationCalls = 0;
      setPrismaModel("auditAssignment", {
        findUnique: async () => ({
          id: "assignment-1",
          status: "pending",
          auditId: null,
          auditorId: "qc-1",
          storeId: "store-1",
          store: { id: "store-1", code: "MC-001", name: "Store 1" },
          plan: {
            id: "plan-1",
            name: "Plan 1",
            status: "open",
            startDate: new Date("2026-05-01"),
            endDate: new Date("2026-06-30"),
            formId: "form-1",
            form: {
              id: "form-1",
              name: "Checklist",
              version: "v1",
              status: "published",
              sections: [
                {
                  group: { id: "group-c", code: "C" },
                  weight: 100,
                  items: [
                    { criteria: { id: "criteria-1" } },
                    { criteria: { id: "criteria-2" } },
                  ],
                },
              ],
            },
          },
          audit: null,
        }),
      });
      setPrismaModel("violation", {
        findMany: async () => {
          violationCalls += 1;
          return [
            {
              criteriaId: "criteria-1",
              numErrors: 1,
              repeatCount: 1,
              note: "old issue",
              audit: {
                id: "audit-old",
                submittedAt: new Date("2026-05-10"),
              },
              evidences: [{ id: "img-1", url: "/img-1.jpg" }],
            },
          ];
        },
      });

      const route = await import(
        "../src/app/api/audits/assignments/[assignmentId]/history/route"
      );
      const result = await route.GET(
        fakeRouteRequest({
          userId: "qc-1",
          roles: ["qc_auditor"],
        }),
        { params: { assignmentId: "assignment-1" } }
      );
      const body = await responseJson(result);

      assert.equal(result.status, 200);
      assert.equal(violationCalls, 1);
      assert.equal(body.data.historiesByCriteriaId["criteria-1"].repeatCount, 1);
      assert.equal(body.data.historiesByCriteriaId["criteria-2"].repeatCount, 0);
      assert.equal(
        body.data.historiesByCriteriaId["criteria-1"].history[0].images[0].id,
        "img-1"
      );
    },
  },
  {
    name: "route audit draft dau tien tao audit va chuyen assignment in_progress",
    run: async () => {
      let updatedStatus = "";
      setPrismaModel("auditAssignment", {
        findUnique: async () => ({
          id: "assignment-1",
          status: "pending",
          auditId: null,
          auditorId: "qc-1",
          storeId: "store-1",
          store: { id: "store-1", code: "MC-001", name: "Store 1" },
          plan: {
            id: "plan-1",
            name: "Plan 1",
            status: "open",
            startDate: new Date("2026-05-01"),
            endDate: new Date("2026-06-30"),
            formId: "form-1",
            form: {
              id: "form-1",
              name: "Checklist",
              version: "v1",
              status: "published",
              sections: [
                {
                  group: { id: "group-c", code: "C" },
                  weight: 100,
                  items: [{ criteria: { id: "criteria-1" } }],
                },
              ],
            },
          },
          audit: null,
        }),
      });
      setPrismaModel("$transaction", async (callback: any) =>
        callback({
          audit: {
            create: async () => ({ id: "audit-1" }),
          },
          auditAssignment: {
            updateMany: async (args: any) => {
              updatedStatus = args.data.status;
              return { count: 1 };
            },
            findUniqueOrThrow: async () => ({
              id: "assignment-1",
              status: "in_progress",
              auditId: "audit-1",
              auditorId: "qc-1",
              storeId: "store-1",
              store: { id: "store-1", code: "MC-001", name: "Store 1" },
              plan: {
                id: "plan-1",
                name: "Plan 1",
                status: "open",
                startDate: new Date("2026-05-01"),
                endDate: new Date("2026-06-30"),
                formId: "form-1",
                form: {
                  id: "form-1",
                  name: "Checklist",
                  version: "v1",
                  status: "published",
                  sections: [],
                },
              },
              audit: {
                id: "audit-1",
                submittedAt: null,
                violations: [],
              },
            }),
          },
          violation: {
            findMany: async () => [],
            deleteMany: async () => ({ count: 0 }),
            create: async () => ({ id: "violation-1" }),
          },
          evidence: {
            updateMany: async () => ({ count: 0 }),
          },
        })
      );

      const route = await import("../src/app/api/audits/draft/route");
      const result = await route.PATCH(
        fakeRouteRequest({
          userId: "qc-1",
          roles: ["qc_auditor"],
          body: {
            assignmentId: "assignment-1",
            violations: [
              {
                criteriaId: "criteria-1",
                numErrors: 1,
              },
            ],
          },
        })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 200);
      assert.equal(updatedStatus, "in_progress");
      assert.equal(body.data.audit.id, "audit-1");
    },
  },
  {
    name: "route audit draft tra 409 neu assignment bi doi trang thai giua luc xu ly",
    run: async () => {
      setPrismaModel("auditAssignment", {
        findUnique: async () => ({
          id: "assignment-1",
          status: "pending",
          auditId: null,
          auditorId: "qc-1",
          storeId: "store-1",
          store: { id: "store-1", code: "MC-001", name: "Store 1" },
          plan: {
            id: "plan-1",
            name: "Plan 1",
            status: "open",
            startDate: new Date("2026-05-01"),
            endDate: new Date("2026-06-30"),
            formId: "form-1",
            form: {
              id: "form-1",
              name: "Checklist",
              version: "v1",
              status: "published",
              sections: [
                {
                  group: { id: "group-c", code: "C" },
                  weight: 100,
                  items: [{ criteria: { id: "criteria-1" } }],
                },
              ],
            },
          },
          audit: null,
        }),
      });
      setPrismaModel("$transaction", async (callback: any) =>
        callback({
          audit: {
            create: async () => ({ id: "audit-race" }),
          },
          auditAssignment: {
            updateMany: async () => ({ count: 0 }),
          },
        })
      );

      const route = await import("../src/app/api/audits/draft/route");
      const result = await route.PATCH(
        fakeRouteRequest({
          userId: "qc-1",
          roles: ["qc_auditor"],
          body: {
            assignmentId: "assignment-1",
            violations: [],
          },
        })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 409);
      assert.equal(
        body.error.message,
        "Audit assignment changed while the request was in progress"
      );
    },
  },
  {
    name: "route audit submit tinh repeat va khong tu tao action plan",
    run: async () => {
      setPrismaModel("auditAssignment", {
        findUnique: async () => ({
          id: "assignment-1",
          status: "in_progress",
          auditId: "audit-1",
          auditorId: "qc-1",
          storeId: "store-1",
          store: { id: "store-1", code: "MC-001", name: "Store 1" },
          plan: {
            id: "plan-1",
            name: "Plan 1",
            status: "open",
            startDate: new Date("2026-05-01"),
            endDate: new Date("2026-06-30"),
            formId: "form-1",
            form: {
              id: "form-1",
              name: "Checklist",
              version: "v1",
              status: "published",
              sections: [
                {
                  group: { id: "group-c", code: "C" },
                  weight: 100,
                  items: [
                    {
                      criteria: {
                        id: "criteria-1",
                        deductionPerError: 2,
                        maxDeduction: 10,
                        flag: "none",
                      },
                    },
                  ],
                },
              ],
            },
          },
          audit: {
            id: "audit-1",
            submittedAt: null,
            violations: [],
          },
        }),
      });
      setPrismaModel("violation", {
        findMany: async (args?: any) => {
          if (args?.where?.auditId) return [];
          return [
            { criteriaId: "criteria-1" },
            { criteriaId: "criteria-1" },
            { criteriaId: "criteria-1" },
          ];
        },
      });
      setPrismaModel("$transaction", async (callback: any) =>
        callback({
          violation: {
            findMany: async () => [],
            deleteMany: async () => ({ count: 0 }),
            create: async () => ({ id: "violation-1" }),
          },
          evidence: {
            updateMany: async () => ({ count: 0 }),
          },
          groupScore: {
            deleteMany: async () => ({ count: 0 }),
            createMany: async () => ({ count: 1 }),
          },
          audit: {
            update: async () => ({
              id: "audit-1",
              finalScore: 0,
              grade: "fail",
              isRiskTriggered: false,
            }),
          },
          auditAssignment: {
            updateMany: async () => ({ count: 1 }),
            update: async () => ({ id: "assignment-1" }),
          },
        })
      );

      const route = await import("../src/app/api/audits/submit/route");
      const result = await route.POST(
        fakeRouteRequest({
          userId: "qc-1",
          roles: ["qc_auditor"],
          body: {
            assignmentId: "assignment-1",
            violations: [
              {
                criteriaId: "criteria-1",
                numErrors: 1,
              },
            ],
          },
        })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 200);
      assert.equal(body.data.repeatInfo[0].repeatCount, 3);
      assert.equal(body.data.repeatInfo[0].repeatLabel, "auto_ccp");
    },
  },
  {
    name: "route audit submit chon risk thi diem ve 0 va grade alarm",
    run: async () => {
      let auditUpdateData: any = null;
      let violationCreateData: any = null;

      setPrismaModel("auditAssignment", {
        findUnique: async () => ({
          id: "assignment-risk",
          status: "in_progress",
          auditId: "audit-risk",
          auditorId: "qc-1",
          storeId: "store-1",
          store: { id: "store-1", code: "MC-001", name: "Store 1" },
          plan: {
            id: "plan-1",
            name: "Plan 1",
            status: "open",
            startDate: new Date("2026-05-01"),
            endDate: new Date("2026-06-30"),
            formId: "form-1",
            form: {
              id: "form-1",
              name: "Checklist",
              version: "v1",
              status: "published",
              sections: [
                {
                  group: { id: "group-c", code: "C" },
                  weight: 100,
                  items: [],
                },
              ],
            },
          },
          audit: {
            id: "audit-risk",
            submittedAt: null,
            violations: [],
          },
        }),
      });
      setPrismaModel("criteria", {
        findMany: async () => [
          {
            id: "criteria-risk",
            code: "RISK-01",
            name: "Risk an toàn",
            content: "Risk toàn bài",
            groupId: null,
            deductionPerError: 0,
            maxDeduction: 0,
            flag: "risk",
            isActive: true,
            group: null,
          },
        ],
      });
      setPrismaModel("violation", {
        findMany: async () => [],
      });
      setPrismaModel("$transaction", async (callback: any) =>
        callback({
          violation: {
            findMany: async () => [],
            deleteMany: async () => ({ count: 0 }),
            create: async (args: any) => {
              violationCreateData = args.data;
              return { id: "violation-risk" };
            },
          },
          evidence: {
            updateMany: async () => ({ count: 0 }),
          },
          groupScore: {
            deleteMany: async () => ({ count: 0 }),
            createMany: async () => ({ count: 1 }),
          },
          audit: {
            update: async (args: any) => {
              auditUpdateData = args.data;
              return {
                id: "audit-risk",
                finalScore: args.data.finalScore,
                grade: args.data.grade,
                isRiskTriggered: args.data.isRiskTriggered,
              };
            },
          },
          auditAssignment: {
            updateMany: async () => ({ count: 1 }),
            update: async () => ({ id: "assignment-risk" }),
          },
        })
      );

      const route = await import("../src/app/api/audits/submit/route");
      const result = await route.POST(
        fakeRouteRequest({
          userId: "qc-1",
          roles: ["qc_auditor"],
          body: {
            assignmentId: "assignment-risk",
            violations: [
              {
                criteriaId: "criteria-risk",
                numErrors: 1,
              },
            ],
          },
        })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 200);
      assert.equal(auditUpdateData.finalScore, 0);
      assert.equal(auditUpdateData.grade, "alarm");
      assert.equal(auditUpdateData.isRiskTriggered, true);
      assert.equal(violationCreateData.isRiskTriggered, true);
      assert.equal(body.data.finalScore, 0);
      assert.equal(body.data.grade, "alarm");
      assert.equal(body.data.isRiskTriggered, true);
    },
  },
  {
    name: "route audit submit tra 409 neu assignment bi submit dong thoi",
    run: async () => {
      setPrismaModel("auditAssignment", {
        findUnique: async () => ({
          id: "assignment-1",
          status: "in_progress",
          auditId: "audit-1",
          auditorId: "qc-1",
          storeId: "store-1",
          store: { id: "store-1", code: "MC-001", name: "Store 1" },
          plan: {
            id: "plan-1",
            name: "Plan 1",
            status: "open",
            startDate: new Date("2026-05-01"),
            endDate: new Date("2026-06-30"),
            formId: "form-1",
            form: {
              id: "form-1",
              name: "Checklist",
              version: "v1",
              status: "published",
              sections: [
                {
                  group: { id: "group-c", code: "C" },
                  weight: 100,
                  items: [
                    {
                      criteria: {
                        id: "criteria-1",
                        deductionPerError: 2,
                        maxDeduction: 10,
                        flag: "none",
                      },
                    },
                  ],
                },
              ],
            },
          },
          audit: {
            id: "audit-1",
            submittedAt: null,
            violations: [],
          },
        }),
      });
      setPrismaModel("violation", {
        findMany: async () => [],
      });
      setPrismaModel("$transaction", async (callback: any) =>
        callback({
          auditAssignment: {
            updateMany: async () => ({ count: 0 }),
          },
        })
      );

      const route = await import("../src/app/api/audits/submit/route");
      const result = await route.POST(
        fakeRouteRequest({
          userId: "qc-1",
          roles: ["qc_auditor"],
          body: {
            assignmentId: "assignment-1",
            violations: [
              {
                criteriaId: "criteria-1",
                numErrors: 1,
              },
            ],
          },
        })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 409);
      assert.equal(
        body.error.message,
        "Audit assignment changed while the request was in progress"
      );
    },
  },
  {
    name: "action plan detail dto tra issueCause tu mo ta loi QC",
    run: () => {
      const dto = actionPlanDetailDto(
        {
          id: "ap-1",
          status: "draft",
          reviewNote: null,
          reviewedAt: null,
          closedAt: null,
          createdAt: new Date("2026-05-20"),
          updatedAt: new Date("2026-05-20"),
          store: { id: "store-1", code: "ST001", name: "Store 1" },
          audit: {
            id: "audit-1",
            finalScore: 90,
            grade: "good",
            submittedAt: new Date("2026-05-20"),
            auditorId: "qc-1",
            form: { id: "form-1", name: "Checklist", version: "1.0.0", status: "published" },
          },
          closedBy: null,
          reviewedBy: null,
          items: [
            {
              id: "item-1",
              rootCause: null,
              remediation: null,
              fixedAt: null,
              assigneeName: null,
              status: "open",
              evidences: [],
              violation: {
                id: "violation-1",
                criteria: {
                  id: "criteria-1",
                  code: "C1",
                  name: "Khu vực thu ngân",
                  content: "Quầy ra món/ nhận nước",
                  flag: "none",
                  group: { id: "group-c", code: "C", name: "Cleanliness" },
                },
                numErrors: 1,
                repeatCount: 0,
                isCriticalTriggered: false,
                isRiskTriggered: false,
                note: "QC ghi nhận khu vực thu ngân chưa sạch",
                evidences: [],
              },
            },
          ],
        },
        { id: "qc-1", fullName: "QC Demo", email: "qc@example.test" }
      );

      assert.equal(dto.items[0].issueCause, "QC ghi nhận khu vực thu ngân chưa sạch");
      assert.equal(dto.items[0].violation.note, "QC ghi nhận khu vực thu ngân chưa sạch");
      assert.equal(dto.items[0].rootCause, null);
    },
  },
  {
    name: "route action plan submit bat anh voi loi critical risk",
    run: async () => {
      setPrismaModel("roleAssignment", {
        findMany: async () => [{ storeId: "store-1" }],
      });
      setPrismaModel("store", {
        findMany: async () => [],
      });
      setPrismaModel("actionPlan", {
        findUnique: async () => ({
          id: "ap-1",
          storeId: "store-1",
          status: "draft",
          items: [
            {
              id: "item-1",
              rootCause: "Nguyen nhan",
              remediation: "Da sua",
              fixedAt: new Date("2026-05-19"),
              assigneeName: "Nhan su cua hang",
              evidences: [],
              violation: {
                isCriticalTriggered: false,
                isRiskTriggered: false,
                criteria: { flag: "critical" },
              },
            },
          ],
        }),
      });

      const route = await import("../src/app/api/action-plans/[id]/submit/route");
      const result = await route.POST(
        fakeRouteRequest({
          userId: "sm-1",
          roles: ["store_manager"],
        }),
        { params: { id: "ap-1" } }
      );
      const body = await responseJson(result);

      assert.equal(result.status, 400);
      assert.equal(
        body.error.message,
        "Critical/risk action plan items require evidence images"
      );
    },
  },
  {
    name: "route action plan submit thanh cong khi du thong tin bat buoc",
    run: async () => {
      let updatedStatus = "";
      let notified = false;
      setPrismaModel("roleAssignment", {
        findMany: async () => [{ storeId: "store-1" }],
      });
      setPrismaModel("store", {
        findMany: async () => [],
      });
      setPrismaModel("user", {
        findMany: async () => [{ id: "qam-1" }],
      });
      setPrismaModel("notification", {
        createMany: async () => {
          notified = true;
          return { count: 1 };
        },
      });
      setPrismaModel("actionPlan", {
        findUnique: async () => ({
          id: "ap-1",
          storeId: "store-1",
          status: "draft",
          items: [
            {
              id: "item-1",
              rootCause: "Nguyen nhan",
              remediation: "Da sua",
              fixedAt: new Date("2026-05-19"),
              assigneeName: "Nhan su cua hang",
              evidences: [{ id: "img-1" }],
              violation: {
                isCriticalTriggered: true,
                isRiskTriggered: false,
                criteria: { flag: "none" },
              },
            },
          ],
        }),
        update: async (args: any) => {
          updatedStatus = args.data.status;
          return { id: "ap-1", status: args.data.status };
        },
      });

      const route = await import("../src/app/api/action-plans/[id]/submit/route");
      const result = await route.POST(
        fakeRouteRequest({
          userId: "sm-1",
          roles: ["store_manager"],
        }),
        { params: { id: "ap-1" } }
      );
      const body = await responseJson(result);

      assert.equal(result.status, 200);
      assert.equal(body.data.status, "submitted");
      assert.equal(updatedStatus, "submitted");
      assert.equal(notified, true);
    },
  },
  {
    name: "dashboard filters mac dinh dung thang hien tai khi khong truyen ngay",
    run: async () => {
      const { parseDashboardFilters } = await import("../src/lib/dashboard");
      const filters = parseDashboardFilters(new URLSearchParams(
        "assignmentStatus=completed&actionPlanStatus=submitted&grade=alarm&riskOnly=true&overdueOnly=1"
      ));

      assert.equal(filters.from.getUTCDate(), 1);
      assert.equal(filters.to.getUTCHours(), 23);
      assert.equal(filters.to.getUTCMinutes(), 59);
      assert.equal(filters.assignmentStatus, "completed");
      assert.equal(filters.actionPlanStatus, "submitted");
      assert.equal(filters.grade, "alarm");
      assert.equal(filters.riskOnly, true);
      assert.equal(filters.overdueOnly, true);
    },
  },
  {
    name: "route dashboard chan scope khong ton tai",
    run: async () => {
      const route = await import("../src/app/api/dashboard/[scope]/route");
      const result = await route.GET(
        fakeRouteRequest({
          userId: "admin-1",
          roles: ["company_admin"],
        }),
        { params: { scope: "unknown" } }
      );
      const body = await responseJson(result);

      assert.equal(result.status, 404);
      assert.equal(body.success, false);
    },
  },
  {
    name: "route dashboard admin chi cho company_admin",
    run: async () => {
      const route = await import("../src/app/api/dashboard/[scope]/route");
      const result = await route.GET(
        fakeRouteRequest({
          userId: "qam-1",
          roles: ["qa_manager"],
        }),
        { params: { scope: "admin" } }
      );
      const body = await responseJson(result);

      assert.equal(result.status, 403);
      assert.equal(body.success, false);
    },
  },
  {
    name: "route dashboard filters chan scope khac role",
    run: async () => {
      const route = await import("../src/app/api/dashboard/filters/route");
      const result = await route.GET(
        fakeRouteRequest({
          url: "http://localhost/api/dashboard/filters?scope=admin",
          userId: "qam-1",
          roles: ["qa_manager"],
        })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 403);
      assert.equal(body.success, false);
    },
  },
  {
    name: "dashboard percentage khong chia loi khi tong bang 0",
    run: async () => {
      const { percentage } = await import("../src/lib/dashboard");

      assert.equal(percentage(5, 0), 0);
      assert.equal(percentage(1, 4), 25);
    },
  },
  {
    name: "dashboard SM action plan items tra deadline overdue va status cha",
    run: async () => {
      const oldDeadline = new Date("2026-01-01T00:00:00.000Z");
      const createdAt = new Date("2025-12-20T00:00:00.000Z");
      setPrismaModel("roleAssignment", {
        findMany: async () => [{ storeId: "store-1" }],
      });
      setPrismaModel("store", {
        findMany: async () => [{ id: "store-1" }],
      });
      setPrismaModel("audit", {
        findMany: async (args: any) => {
          if (!args.where.submittedAt?.gte) {
            return [
              { finalScore: 82, submittedAt: new Date("2026-05-10T00:00:00.000Z") },
              { finalScore: 74, submittedAt: new Date("2026-04-10T00:00:00.000Z") },
              { finalScore: 91, submittedAt: new Date("2026-03-10T00:00:00.000Z") },
              { finalScore: 65, submittedAt: new Date("2026-02-10T00:00:00.000Z") },
              { finalScore: 88, submittedAt: new Date("2026-01-10T00:00:00.000Z") },
              { finalScore: 55, submittedAt: new Date("2025-12-10T00:00:00.000Z") },
            ];
          }
          return [
            {
              id: "audit-1",
              finalScore: 82,
              grade: "good",
              isRiskTriggered: false,
              submittedAt: new Date("2026-05-10T00:00:00.000Z"),
              store: {
                id: "store-1",
                code: "ST001",
                name: "Store 1",
                province: "TP HCM",
                brand: { id: "brand-1", code: "BR", name: "Brand" },
                am: { id: "am-1", fullName: "AM One", email: "am@example.com" },
              },
              violations: [],
              form: { id: "form-1", name: "Checklist", version: "1.0.0" },
            },
          ];
        },
      });
      setPrismaModel("auditAssignment", {
        groupBy: async () => [],
      });
      setPrismaModel("auditPlan", {
        findMany: async () => [],
      });
      setPrismaModel("user", {
        findMany: async () => [],
      });
      setPrismaModel("violation", {
        groupBy: async () => [{ criteriaId: "criteria-1", _count: { _all: 1 }, _sum: { numErrors: 2 } }],
        count: async () => 0,
        findMany: async () => [],
      });
      setPrismaModel("criteria", {
        findMany: async () => [
          {
            id: "criteria-1",
            code: "C1",
            name: "Khu vực thu ngân",
            flag: "none",
            group: { id: "group-1", code: "C", name: "Vệ sinh" },
          },
        ],
      });
      setPrismaModel("actionPlan", {
        groupBy: async () => [{ status: "draft", _count: { _all: 1 } }],
        count: async () => 1,
        findMany: async () => [],
      });
      setPrismaModel("actionPlanItem", {
        count: async () => 1,
        findMany: async () => [
          {
            id: "ap-item-1",
            status: "open",
            rootCause: null,
            remediation: null,
            fixedAt: null,
            assigneeName: null,
            violation: {
              note: "Khu vực chưa sạch",
              numErrors: 1,
              repeatCount: 0,
              isCriticalTriggered: false,
              isRiskTriggered: false,
              criteria: {
                id: "criteria-1",
                code: "C1",
                name: "Khu vực thu ngân",
                flag: "none",
                group: { id: "group-1", code: "C", name: "Vệ sinh" },
              },
            },
            actionPlan: {
              id: "ap-1",
              status: "draft",
              deadline: oldDeadline,
              createdAt,
            },
            evidences: [{ id: "img-1", url: "/uploads/evidence/demo.svg" }],
          },
        ],
      });
      setPrismaModel("evidence", {
        findMany: async () => [
          {
            id: "img-1",
            url: "/uploads/evidence/demo.svg",
            fileName: "demo.svg",
            mimeType: "image/svg+xml",
            actionPlanId: "ap-1",
            actionPlanItemId: "ap-item-1",
            createdAt: new Date("2026-05-12T00:00:00.000Z"),
            actionPlanItem: {
              violation: {
                criteria: { name: "Khu vực thu ngân" },
              },
            },
          },
        ],
      });

      const { getSmDashboard } = await import("../src/lib/dashboard");
      const data = await getSmDashboard(
        "sm-1",
        ["store_manager"],
        new URLSearchParams("from=2026-05-01&to=2026-05-31")
      );
      const item = data.tables.actionPlanItemsToUpdate[0] as any;
      const charts = data.charts as any;
      const tables = data.tables as any;

      assert.equal(item.actionPlanStatus, "draft");
      assert.equal(item.deadline, oldDeadline);
      assert.equal(item.overdueDays > 0, true);
      assert.equal(item.issueCause, "Khu vực chưa sạch");
      assert.equal(item.imageCount, 1);
      assert.equal(charts.actionPlanStatus.submitted, 0);
      assert.equal(charts.errorsByGroup[0].count, 2);
      assert.deepEqual(
        charts.scoreTrend.map((item: any) => item.label),
        ["T01", "T02", "T03", "T04", "T05"]
      );
      assert.equal(charts.scoreTrend[4].date, "2026-05-01T00:00:00.000Z");
      assert.equal(tables.latestRemediationImages[0].actionPlanId, "ap-1");
      assert.equal(tables.latestRemediationImages[0].itemId, "ap-item-1");
      assert.equal(tables.latestRemediationImages[0].criteriaName, "Khu vực thu ngân");
    },
  },
  {
    name: "dashboard AM tra trend 5 thang moi nhat va AP theo store day du",
    run: async () => {
      const oldDeadline = new Date("2026-01-01T00:00:00.000Z");
      const futureDeadline = new Date("2026-06-30T00:00:00.000Z");
      const closedDeadline = new Date("2026-05-20T00:00:00.000Z");
      const createdAt = new Date("2025-12-20T00:00:00.000Z");
      setPrismaModel("roleAssignment", {
        findMany: async () => [{ storeId: "store-1" }],
      });
      setPrismaModel("store", {
        count: async () => 1,
        findMany: async () => [{ id: "store-1" }],
      });
      setPrismaModel("audit", {
        findMany: async (args: any) => {
          if (!args.where.submittedAt?.gte && args.select?.submittedAt) {
            return [
              { finalScore: 82, submittedAt: new Date("2026-05-10T00:00:00.000Z") },
              { finalScore: 74, submittedAt: new Date("2026-04-10T00:00:00.000Z") },
              { finalScore: 91, submittedAt: new Date("2026-03-10T00:00:00.000Z") },
              { finalScore: 65, submittedAt: new Date("2026-02-10T00:00:00.000Z") },
              { finalScore: 88, submittedAt: new Date("2026-01-10T00:00:00.000Z") },
              { finalScore: 55, submittedAt: new Date("2025-12-10T00:00:00.000Z") },
            ];
          }
          if (args.select?.store) {
            return [
              {
                id: "audit-1",
                finalScore: 82,
                grade: "good",
                isRiskTriggered: false,
                submittedAt: new Date("2026-05-10T00:00:00.000Z"),
                store: {
                  id: "store-1",
                  code: "ST001",
                  name: "Store 1",
                  province: "TP HCM",
                  brand: { id: "brand-1", code: "BR", name: "Brand" },
                  am: { id: "am-1", fullName: "AM One", email: "am@example.com" },
                },
                violations: [],
              },
            ];
          }
          return [];
        },
      });
      setPrismaModel("auditAssignment", {
        groupBy: async () => [],
      });
      setPrismaModel("auditPlan", {
        findMany: async () => [],
      });
      setPrismaModel("user", {
        findMany: async () => [],
      });
      setPrismaModel("violation", {
        groupBy: async () => [{ criteriaId: "criteria-1", _count: { _all: 1 }, _sum: { numErrors: 2 } }],
        count: async () => 0,
        findMany: async () => [],
      });
      setPrismaModel("criteria", {
        findMany: async () => [
          {
            id: "criteria-1",
            code: "C1",
            name: "Khu vực thu ngân",
            flag: "none",
            group: { id: "group-1", code: "C", name: "Vệ sinh" },
          },
        ],
      });
      setPrismaModel("actionPlan", {
        groupBy: async () => [
          { status: "draft", _count: { _all: 1 } },
          { status: "submitted", _count: { _all: 1 } },
          { status: "closed", _count: { _all: 1 } },
        ],
        count: async () => 3,
        findMany: async (args: any) => {
          if (args.select?._count) {
            return [
              {
                id: "ap-1",
                status: "draft",
                deadline: oldDeadline,
                createdAt,
                store: { id: "store-1", code: "ST001", name: "Store 1" },
                audit: { id: "audit-1", finalScore: 82, grade: "good", submittedAt: new Date("2026-05-10") },
                items: [{ assigneeName: "Nhan su cua hang" }],
                _count: { items: 1 },
              },
            ];
          }
          return [
            {
              id: "ap-1",
              status: "draft",
              deadline: oldDeadline,
              createdAt,
              store: { id: "store-1", code: "ST001", name: "Store 1" },
            },
            {
              id: "ap-2",
              status: "submitted",
              deadline: futureDeadline,
              createdAt: new Date("2026-05-01T00:00:00.000Z"),
              store: { id: "store-1", code: "ST001", name: "Store 1" },
            },
            {
              id: "ap-3",
              status: "closed",
              deadline: closedDeadline,
              createdAt: new Date("2026-05-02T00:00:00.000Z"),
              store: { id: "store-1", code: "ST001", name: "Store 1" },
            },
          ];
        },
      });
      setPrismaModel("actionPlanItem", {
        count: async () => 0,
      });

      const { getAmDashboard } = await import("../src/lib/dashboard");
      const data = await getAmDashboard(
        "am-1",
        ["am"],
        new URLSearchParams("from=2026-05-01&to=2026-05-31")
      );
      const charts = data.charts as any;
      const tables = data.tables as any;
      const table = (tables.actionPlansByStore as any[])[0];

      assert.deepEqual(
        charts.scoreTrend.map((item: any) => item.label),
        ["T01", "T02", "T03", "T04", "T05"]
      );
      assert.equal(charts.scoreTrend[4].date, "2026-05-01T00:00:00.000Z");
      assert.equal(charts.actionPlanStatus.rejected, 0);
      assert.equal(charts.errorsByGroup[0].count, charts.errorsByGroup[0].errorCount);
      assert.equal((tables.topStores as any[])[0].latestAuditDate.toISOString(), "2026-05-10T00:00:00.000Z");
      assert.equal((tables.topStores as any[])[0].latestScore, 82);
      assert.equal((tables.topStores as any[])[0].grade, "good");
      assert.equal((tables.bottomStores as any[])[0].latestAuditDate.toISOString(), "2026-05-10T00:00:00.000Z");
      assert.equal((tables.bottomStores as any[])[0].latestScore, 82);
      assert.equal((tables.bottomStores as any[])[0].grade, "good");
      assert.equal(table.totalCount, 3);
      assert.equal(table.openCount, 2);
      assert.equal(table.closedCount, 1);
      assert.equal(table.overdueCount, 1);
      assert.equal(table.maxOverdueDays > 0, true);
      assert.equal(table.latestDueDate, futureDeadline);
    },
  },
  {
    name: "dashboard filters SM tra action plan status options",
    run: async () => {
      setPrismaModel("roleAssignment", {
        findMany: async () => [{ storeId: "store-1" }],
      });
      setPrismaModel("brand", {
        findMany: async () => [],
      });
      setPrismaModel("store", {
        findMany: async () => [],
      });
      setPrismaModel("user", {
        findMany: async () => [],
      });
      setPrismaModel("checklistForm", {
        findMany: async () => [
          { id: "form-1", name: "Checklist", version: "1.0.0", status: "published" },
        ],
      });
      setPrismaModel("auditPlan", {
        findMany: async () => [],
      });

      const { getDashboardFilters } = await import("../src/lib/dashboard");
      const data = await getDashboardFilters(
        "sm-1",
        ["store_manager"],
        new URLSearchParams("scope=sm")
      );

      assert.equal(data?.checklists[0].id, "form-1");
      assert.deepEqual(
        data?.actionPlanStatuses.map((item: any) => item.value),
        ["draft", "submitted", "rejected", "closed"]
      );
      assert.deepEqual(
        data?.assignmentStatuses.map((item: any) => item.value),
        ["pending", "in_progress", "completed"]
      );
      assert.deepEqual(
        data?.grades.map((item: any) => item.value),
        ["excellent", "good", "pass", "fail", "alarm"]
      );
    },
  },
  {
    name: "dashboard export chap nhan scope sm va enforce role sm",
    run: async () => {
      const route = await import("../src/app/api/dashboard/export/route");
      const result = await route.GET(
        fakeRouteRequest({
          url: "http://localhost/api/dashboard/export?scope=sm",
          userId: "qam-1",
          roles: ["qa_manager"],
        })
      );
      const body = await responseJson(result);

      assert.equal(result.status, 403);
      assert.equal(body.success, false);
    },
  },
  {
    name: "e2e cleanup dry-run chi collect va khong mutate database",
    run: async () => {
      const cleanup: any = await importCleanupScript();
      const calls: string[] = [];
      const prismaMock = createCleanupPrismaMock({
        calls,
        plans: [{ id: "plan-1", name: "E2E Portfolio 202605270101" }],
        assignments: [{ id: "assignment-1", planId: "plan-1", auditId: "audit-1" }],
        actionPlans: [{ id: "ap-1", auditId: "audit-1" }],
        violations: [{ id: "violation-1", auditId: "audit-1" }],
        actionPlanItems: [
          { id: "ap-item-1", actionPlanId: "ap-1", violationId: "violation-1" },
        ],
        evidences: [
          {
            id: "img-1",
            violationId: "violation-1",
            actionPlanId: null,
            actionPlanItemId: null,
          },
        ],
        notifications: [{ id: "noti-1", link: "/audits/audit-1" }],
      });

      const result = await cleanup.runCleanup({
        prisma: prismaMock,
        dryRun: true,
        env: {},
        logger: () => undefined,
      });

      assert.equal(result.counts.plans, 1);
      assert.equal(calls.some((call) => call.includes(".deleteMany")), false);
      assert.equal(calls.some((call) => call.includes(".updateMany")), false);
    },
  },
  {
    name: "e2e cleanup delete mode bat buoc co guard truoc khi cham database",
    run: async () => {
      const cleanup: any = await importCleanupScript();
      const calls: string[] = [];
      const prismaMock = createCleanupPrismaMock({
        calls,
        plans: [{ id: "plan-1", name: "E2E Portfolio 202605270101" }],
      });

      await assert.rejects(
        () =>
          cleanup.runCleanup({
            prisma: prismaMock,
            dryRun: false,
            env: {},
            logger: () => undefined,
          }),
        /ALLOW_E2E_CLEANUP/
      );
      assert.equal(calls.length, 0);
    },
  },
  {
    name: "e2e cleanup delete mode chi xoa graph E2E va khong dung master data",
    run: async () => {
      const cleanup: any = await importCleanupScript();
      const calls: string[] = [];
      const prismaMock = createCleanupPrismaMock({
        calls,
        plans: [{ id: "plan-1", name: "E2E Portfolio 202605270101" }],
        assignments: [{ id: "assignment-1", planId: "plan-1", auditId: "audit-1" }],
        actionPlans: [{ id: "ap-1", auditId: "audit-1" }],
        violations: [{ id: "violation-1", auditId: "audit-1" }],
        actionPlanItems: [
          { id: "ap-item-1", actionPlanId: "ap-1", violationId: "violation-1" },
        ],
        evidences: [
          {
            id: "img-1",
            violationId: "violation-1",
            actionPlanId: null,
            actionPlanItemId: null,
          },
        ],
        notifications: [
          { id: "noti-1", link: "/audits/audit-1" },
          { id: "noti-2", link: "/action-plans/ap-1" },
          { id: "noti-keep", link: "/dashboard" },
        ],
      });

      await cleanup.runCleanup({
        prisma: prismaMock,
        dryRun: false,
        env: { ALLOW_E2E_CLEANUP: "YES" },
        logger: () => undefined,
      });

      const order = calls.filter(
        (call) => call.includes(".deleteMany") || call.includes(".updateMany")
      );
      assert.equal(order[0].startsWith("evidence.deleteMany"), true);
      assert.equal(
        order.some((call) => call.startsWith("auditAssignment.updateMany")),
        true
      );
      assert.equal(
        order.findIndex((call) => call.startsWith("auditAssignment.updateMany")) <
          order.findIndex((call) => call.startsWith("audit.deleteMany")),
        true
      );
      for (const forbidden of [
        "user.",
        "store.",
        "brand.",
        "roleAssignment.",
        "checklistForm.",
        "criteria.",
        "criteriaGroup.",
      ]) {
        assert.equal(calls.some((call) => call.startsWith(forbidden)), false);
      }
    },
  },
  {
    name: "e2e cleanup khong co plan hoac sai prefix la no-op an toan",
    run: async () => {
      const cleanup: any = await importCleanupScript();
      const calls: string[] = [];
      const prismaMock = createCleanupPrismaMock({
        calls,
        plans: [
          { id: "plan-1", name: "Monthly Audit" },
          { id: "plan-2", name: "E2EPortfolio 202605270101" },
          { id: "plan-3", name: "Portfolio E2E 202605270101" },
        ],
      });

      const result = await cleanup.runCleanup({
        prisma: prismaMock,
        dryRun: false,
        env: { ALLOW_E2E_CLEANUP: "YES" },
        logger: () => undefined,
      });

      assert.equal(result.counts.plans, 0);
      assert.equal(calls.filter((call) => call.includes(".deleteMany")).length, 0);
      assert.equal(calls.filter((call) => call.includes(".updateMany")).length, 0);
    },
  },
  {
    name: "e2e cleanup partial failed flow chi xoa assignment va plan",
    run: async () => {
      const cleanup: any = await importCleanupScript();
      const calls: string[] = [];
      const prismaMock = createCleanupPrismaMock({
        calls,
        plans: [{ id: "plan-1", name: "E2E Portfolio 202605270101" }],
        assignments: [{ id: "assignment-1", planId: "plan-1", auditId: null }],
      });

      await cleanup.runCleanup({
        prisma: prismaMock,
        dryRun: false,
        env: { ALLOW_E2E_CLEANUP: "YES" },
        logger: () => undefined,
      });

      assert.equal(calls.some((call) => call.startsWith("audit.deleteMany")), false);
      assert.equal(calls.some((call) => call.startsWith("actionPlan.deleteMany")), false);
      assert.equal(
        calls.some((call) => call.startsWith("auditAssignment.deleteMany")),
        true
      );
      assert.equal(calls.some((call) => call.startsWith("auditPlan.deleteMany")), true);
    },
  },
  {
    name: "e2e cleanup chi xoa attached evidence va notification dung link",
    run: async () => {
      const cleanup: any = await importCleanupScript();
      const calls: string[] = [];
      const prismaMock = createCleanupPrismaMock({
        calls,
        plans: [{ id: "plan-1", name: "E2E Portfolio 202605270101" }],
        assignments: [{ id: "assignment-1", planId: "plan-1", auditId: "audit-1" }],
        actionPlans: [{ id: "ap-1", auditId: "audit-1" }],
        violations: [{ id: "violation-1", auditId: "audit-1" }],
        actionPlanItems: [
          { id: "ap-item-1", actionPlanId: "ap-1", violationId: "violation-1" },
        ],
        evidences: [
          {
            id: "img-attached",
            violationId: "violation-1",
            actionPlanId: null,
            actionPlanItemId: null,
          },
          {
            id: "img-orphan",
            violationId: null,
            actionPlanId: null,
            actionPlanItemId: null,
          },
        ],
        notifications: [
          { id: "noti-audit", link: "/audits/audit-1" },
          { id: "noti-ap", link: "/action-plans/ap-1" },
          { id: "noti-keep", link: "/dashboard" },
        ],
      });

      await cleanup.runCleanup({
        prisma: prismaMock,
        dryRun: false,
        env: { ALLOW_E2E_CLEANUP: "YES" },
        logger: () => undefined,
      });

      const evidenceDelete = calls.find((call) => call.startsWith("evidence.deleteMany"));
      const notificationDelete = calls.find((call) =>
        call.startsWith("notification.deleteMany")
      );
      assert.match(evidenceDelete ?? "", /img-attached/);
      assert.equal((evidenceDelete ?? "").includes("img-orphan"), false);
      assert.match(notificationDelete ?? "", /noti-audit|noti-ap/);
      assert.equal((notificationDelete ?? "").includes("noti-keep"), false);
    },
  },
  {
    name: "e2e cleanup output khong lo database secrets",
    run: async () => {
      const cleanup: any = await importCleanupScript();
      const logs: string[] = [];
      const prismaMock = createCleanupPrismaMock({
        plans: [{ id: "plan-1", name: "E2E Portfolio 202605270101" }],
      });

      await cleanup.runCleanup({
        prisma: prismaMock,
        dryRun: true,
        env: {
          DATABASE_URL: "postgresql://secret",
          DIRECT_URL: "postgresql://direct-secret",
        },
        logger: (line: string) => logs.push(line),
      });

      const output = logs.join("\n");
      assert.equal(output.includes("postgresql://"), false);
      assert.equal(output.includes("DATABASE_URL"), false);
      assert.equal(output.includes("DIRECT_URL"), false);
    },
  },
  {
    name: "route upload images luu extension theo mime type hop le thay vi ten file goc",
    run: async () => {
      setPrismaModel("evidence", {
        create: async (args: any) => ({
          id: "img-1",
          ...args.data,
        }),
      });
      const route = await import("../src/app/api/upload/images/route");
      const pngSignature = Uint8Array.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      const file = new File([pngSignature], "payload.html", { type: "image/png" });
      const result = await route.POST({
        headers: {
          get: (name: string) => {
            if (name === "x-user-id") return "qc-1";
            if (name === "x-user-roles") return JSON.stringify(["qc_auditor"]);
            return undefined;
          },
        },
        formData: async () => ({
          get: (name: string) => (name === "file" ? file : null),
        }),
      } as any);
      const body = await responseJson(result);

      try {
        assert.equal(result.status, 201);
        assert.equal(body.data.url.endsWith(".png"), true);
        assert.equal(body.data.url.endsWith(".html"), false);
      } finally {
        await unlink(path.join(process.cwd(), "public", body.data.url.replace(/^\//, "")));
      }
    },
  },
];

async function main() {
  let passed = 0;

  for (const test of tests) {
    try {
      await test.run();
      passed += 1;
      console.log(`PASS ${test.name}`);
    } catch (error) {
      console.error(`FAIL ${test.name}`);
      throw error;
    }
  }

  console.log(`\n${passed}/${tests.length} tests passed`);
}

main().catch((error) => {
  console.error("TEST FAILED");
  console.error(error);
  process.exit(1);
});
