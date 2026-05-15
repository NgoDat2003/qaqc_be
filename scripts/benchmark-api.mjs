const baseUrl = process.env.API_BENCHMARK_BASE_URL || "http://localhost:3000/api";
const adminEmail = process.env.API_BENCHMARK_ADMIN_EMAIL || "admin@qualityops.com";
const password = process.env.API_BENCHMARK_PASSWORD || "Test@1234";
const runs = Number(process.env.API_BENCHMARK_RUNS || 3);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseServerTiming(header) {
  if (!header) return {};

  return Object.fromEntries(
    header.split(",").flatMap((metric) => {
      const [name, ...attrs] = metric.trim().split(";");
      const duration = attrs.find((attr) => attr.startsWith("dur="));
      return duration ? [[name, Number(duration.slice(4))]] : [];
    })
  );
}

async function login(email) {
  const startedAt = performance.now();
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => null);
  const cookie = res.headers.get("set-cookie")?.split(";")[0] || "";

  return {
    status: res.status,
    cookie,
    body,
    ms: Number((performance.now() - startedAt).toFixed(2)),
  };
}

async function getJson(path, cookie) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { cookie },
  });
  const body = await res.json().catch(() => null);

  return {
    status: res.status,
    body,
  };
}

async function measure(name, path, cookie) {
  const samples = [];
  let status = null;
  let serverTiming = {};

  for (let index = 0; index < runs; index++) {
    const startedAt = performance.now();
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { cookie },
    });
    status = res.status;
    await res.arrayBuffer();
    samples.push(Number((performance.now() - startedAt).toFixed(2)));
    serverTiming = parseServerTiming(res.headers.get("server-timing"));
    await sleep(120);
  }

  return {
    name,
    path,
    status,
    samples,
    avg: Number((samples.reduce((sum, value) => sum + value, 0) / samples.length).toFixed(2)),
    serverTiming,
  };
}

async function main() {
  const adminLogin = await login(adminEmail);
  if (adminLogin.status !== 200) {
    throw new Error(`Admin login failed with status ${adminLogin.status}`);
  }

  const adminCookie = adminLogin.cookie;
  const users = [];

  for (let page = 1; page <= 10; page++) {
    const usersPage = await getJson(`/users?page=${page}&limit=100`, adminCookie);
    users.push(...(usersPage.body?.data || []));
    if ((usersPage.body?.meta?.page || page) >= (usersPage.body?.meta?.totalPages || page)) {
      break;
    }
  }

  const qcUser = users.find((user) =>
    user.roleAssignments?.some((assignment) => assignment.roleKey === "qc_auditor")
  );
  const qcLogin = qcUser?.email ? await login(qcUser.email) : null;

  const [stores, checklists, auditPlans, audits, actionPlans] = await Promise.all([
    getJson("/stores?page=1&limit=20", adminCookie),
    getJson("/checklists?page=1&limit=20", adminCookie),
    getJson("/audit-plans?page=1&limit=20", adminCookie),
    getJson("/audits?page=1&limit=20", adminCookie),
    getJson("/action-plans?page=1&limit=20", adminCookie),
  ]);

  const storeId = stores.body?.data?.[0]?.id;
  const checklistId = checklists.body?.data?.[0]?.id;
  const auditPlanId = auditPlans.body?.data?.[0]?.id;
  const auditId = audits.body?.data?.[0]?.id;
  const actionPlanId = actionPlans.body?.data?.[0]?.id;

  const targets = [
    ["auth_me", "/auth/me", adminCookie],
    ["analytics_overview", "/analytics/overview", adminCookie],
    ["brands_list", "/brands?page=1&limit=20", adminCookie],
    ["stores_list", "/stores?page=1&limit=20", adminCookie],
    ["users_list", "/users?page=1&limit=20", adminCookie],
    ["criteria_groups_list", "/criteria-groups", adminCookie],
    ["criteria_list", "/criteria?page=1&limit=20", adminCookie],
    ["checklists_list", "/checklists?page=1&limit=20", adminCookie],
    ["audit_plans_list", "/audit-plans?page=1&limit=20", adminCookie],
    ["audits_list", "/audits?page=1&limit=20", adminCookie],
    ["action_plans_list", "/action-plans?page=1&limit=20", adminCookie],
    ["notifications_list", "/notifications", adminCookie],
  ];

  if (storeId) targets.push(["store_detail", `/stores/${storeId}`, adminCookie]);
  if (checklistId) targets.push(["checklist_detail", `/checklists/${checklistId}`, adminCookie]);
  if (auditPlanId) targets.push(["audit_plan_detail", `/audit-plans/${auditPlanId}`, adminCookie]);
  if (auditId) targets.push(["audit_detail", `/audits/${auditId}`, adminCookie]);
  if (actionPlanId) targets.push(["action_plan_detail", `/action-plans/${actionPlanId}`, adminCookie]);
  if (qcLogin?.status === 200) {
    targets.push(["my_assignments", "/audit-plans/my-assignments", qcLogin.cookie]);
  }

  const results = [];
  for (const [name, path, cookie] of targets) {
    results.push(await measure(name, path, cookie));
  }

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    baseUrl,
    runs,
    login: {
      adminMs: adminLogin.ms,
      qcFound: Boolean(qcUser),
    },
    results,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
