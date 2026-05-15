import assert from "assert/strict";
import path from "path";
import Module from "module";
import { prisma } from "../src/lib/prisma";
import { response } from "../src/lib/api-response";
import { getRoles, hasRole } from "../src/lib/rbac";
import {
  clearAdminCache,
  invalidateAdminCache,
  readAdminCache,
} from "../src/lib/admin-cache";

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
    name: "route audit-plan create tao assignment theo tung store va QC",
    run: async () => {
      let createdAssignments: any[] = [];
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
              return { id: "plan-1" };
            },
            findUniqueOrThrow: async () => ({
              id: "plan-1",
              name: "Plan Dung Contract",
              type: "adhoc",
              scope: "company",
              status: "open",
              formId: "form-1",
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
                  scheduledDate: new Date("2026-05-20"),
                  auditId: null,
                  storeId: "store-1",
                  auditorId: "qc-1",
                  store: { id: "store-1", code: "MC-001", name: "Store 1" },
                  auditor: { id: "qc-1", fullName: "QC One", email: "qc1@example.com" },
                },
                {
                  id: "assignment-2",
                  status: "pending",
                  scheduledDate: new Date("2026-05-21"),
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
            assignments: [
              {
                storeId: "store-1",
                auditorId: "qc-1",
                scheduledDate: "2026-05-20",
              },
              {
                storeId: "store-2",
                auditorId: "qc-2",
                scheduledDate: "2026-05-21",
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
        })),
        [
          { storeId: "store-1", auditorId: "qc-1" },
          { storeId: "store-2", auditorId: "qc-2" },
        ]
      );
      assert.equal(body.data.progress.total, 2);
      assert.equal(body.data.assignments[1].auditor.fullName, "QC Two");
    },
  },
  {
    name: "route my-assignments chi lay assignment cua QC hien tai",
    run: async () => {
      let scopedAuditorId = "";
      setPrismaModel("auditAssignment", {
        findMany: async (args: any) => {
          scopedAuditorId = args.where.auditorId;
          return [
            {
              id: "assignment-1",
              status: "pending",
              scheduledDate: new Date("2026-05-20"),
              auditId: null,
              store: { id: "store-1", code: "MC-001", name: "Store 1" },
              plan: {
                id: "plan-1",
                name: "Plan 1",
                status: "open",
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
      assert.deepEqual(body.data[0].checklist, {
        id: "form-1",
        name: "Checklist",
        version: "v1",
      });
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
