import assert from "assert/strict";
import path from "path";
import Module from "module";
import { unlink } from "fs/promises";
import { prisma } from "../src/lib/prisma";
import { response } from "../src/lib/api-response";
import { getRoles, hasRole } from "../src/lib/rbac";
import {
  clearAdminCache,
  invalidateAdminCache,
  readAdminCache,
} from "../src/lib/admin-cache";
import { calculateAuditScore } from "../src/lib/scoring";

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
                endDate: new Date("2026-05-30"),
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
            deductionPerError: 1,
            maxDeduction: 5,
            flag: "critical",
          },
        ],
        violations: [
          {
            criteriaId: "criteria-c",
            numErrors: 2,
            repeatCount: 2,
            repeatLabel: "second",
            isCriticalTriggered: false,
          },
          {
            criteriaId: "criteria-h",
            numErrors: 1,
            repeatCount: 1,
            repeatLabel: "first",
            isCriticalTriggered: false,
          },
        ],
      });

      assert.equal(normal.finalScore, 46);
      assert.equal(normal.groupScores[1].triggeredCritical, true);

      const risk = calculateAuditScore({
        groups: [{ id: "group-c", code: "C", weight: 100 }],
        criteria: [
          {
            id: "criteria-risk",
            groupId: "group-c",
            groupCode: "C",
            deductionPerError: 1,
            maxDeduction: 5,
            flag: "risk",
          },
        ],
        violations: [
          {
            criteriaId: "criteria-risk",
            numErrors: 1,
            repeatCount: 1,
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
            endDate: new Date("2026-05-30"),
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
            endDate: new Date("2026-05-30"),
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
      assert.equal(body.data.historiesByCriteriaId["criteria-1"].repeatCount, 2);
      assert.equal(body.data.historiesByCriteriaId["criteria-2"].repeatCount, 1);
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
            endDate: new Date("2026-05-30"),
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
                endDate: new Date("2026-05-30"),
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
            endDate: new Date("2026-05-30"),
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
    name: "route audit submit tinh repeat va tao action plan draft",
    run: async () => {
      let actionPlanCreated = false;
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
            endDate: new Date("2026-05-30"),
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
          actionPlan: {
            upsert: async () => {
              actionPlanCreated = true;
              return { id: "ap-1" };
            },
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
      assert.equal(body.data.repeatInfo[0].repeatLabel, "auto_ccp");
      assert.equal(actionPlanCreated, true);
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
            endDate: new Date("2026-05-30"),
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
