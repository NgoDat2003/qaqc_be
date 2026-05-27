import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.API_BENCHMARK_BASE_URL || "http://localhost:3000/api";
const adminEmail = process.env.API_BENCHMARK_ADMIN_EMAIL || "admin@qualityops.com";
const password = process.env.API_BENCHMARK_PASSWORD || "Test@1234";
const runs = Number(process.env.API_BENCHMARK_RUNS || 3);

const apiTargets = [
  ["audits_list", "/audits"],
  ["action_plans_list", "/action-plans"],
  ["audit_plans_list", "/audit-plans"],
  ["notifications_list", "/notifications"],
];

function avg(items) {
  return Number((items.reduce((sum, item) => sum + item, 0) / items.length).toFixed(2));
}

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

async function measureDb(name, run) {
  const samples = [];
  let rows = 0;

  for (let index = 0; index < runs; index++) {
    const startedAt = performance.now();
    const result = await run();
    samples.push(Number((performance.now() - startedAt).toFixed(2)));
    rows = Array.isArray(result) ? result.length : 1;
  }

  return { name, rows, samples, avg: avg(samples) };
}

async function login(email = adminEmail) {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  return {
    status: response.status,
    cookie: response.headers.get("set-cookie")?.split(";")[0] || "",
  };
}

async function measureApi(name, path, cookie) {
  const samples = [];
  let status = 0;
  let serverTiming = {};

  for (let index = 0; index < runs; index++) {
    const startedAt = performance.now();
    const response = await fetch(`${baseUrl}${path}`, { headers: { cookie } });
    status = response.status;
    await response.arrayBuffer();
    samples.push(Number((performance.now() - startedAt).toFixed(2)));
    serverTiming = parseServerTiming(response.headers.get("server-timing"));
  }

  return { name, path, status, samples, avg: avg(samples), serverTiming };
}

async function main() {
  const dbResults = await Promise.all([
    measureDb("monthly_average_score", () => prisma.$queryRaw`
      select date_trunc('month', "submittedAt") as month,
             count(*)::int as audits,
             round(avg("finalScore")::numeric, 2)::float as "averageScore"
      from audits
      where "submittedAt" is not null
      group by 1
      order by 1 desc
    `),
    measureDb("top_criteria_by_violations", () => prisma.$queryRaw`
      select c.id,
             c.code,
             c.name,
             count(v.id)::int as "violationCount",
             sum(v."numErrors")::int as "errorCount"
      from violations v
      join criteria c on c.id = v."criteriaId"
      group by c.id, c.code, c.name
      order by "errorCount" desc
      limit 10
    `),
    measureDb("bottom_stores_by_score", () => prisma.$queryRaw`
      select s.id,
             s.code,
             s.name,
             count(a.id)::int as audits,
             round(avg(a."finalScore")::numeric, 2)::float as "averageScore"
      from audits a
      join stores s on s.id = a."storeId"
      where a."submittedAt" is not null
      group by s.id, s.code, s.name
      having count(a.id) >= 3
      order by "averageScore" asc
      limit 10
    `),
    measureDb("action_plan_status_counts", () => prisma.$queryRaw`
      select status, count(*)::int as count
      from action_plans
      group by status
      order by status
    `),
  ]);

  let apiResults = [];
  try {
    const qam = await prisma.user.findFirst({
      where: {
        isActive: true,
        roleAssignments: { some: { roleKey: "qa_manager" } },
      },
      select: { email: true },
    });
    const auth = await login(qam?.email || adminEmail);
    if (auth.status === 200 && auth.cookie) {
      for (const [name, path] of apiTargets) {
        apiResults.push(await measureApi(name, path, auth.cookie));
      }
    } else {
      apiResults = [{ name: "api_login", status: auth.status, note: "API benchmark skipped because login failed." }];
    }
  } catch (error) {
    apiResults = [{ name: "api_benchmark", note: `API benchmark skipped: ${error.message}` }];
  }

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    runs,
    dbResults,
    apiResults,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
