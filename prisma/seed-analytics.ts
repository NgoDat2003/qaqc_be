import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { faker } from "@faker-js/faker";
import bcrypt from "bcryptjs";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type SeedMode = "append" | "reset-qaqc-analytics" | "normalize-master";
type RepeatLabel = "first" | "second" | "third" | "auto_ccp" | "reset";

type ScoreCriterion = {
  id: string;
  groupId: string | null;
  deductionPerError: number;
  maxDeduction: number;
  flag: string;
};

type ScoreGroup = {
  id: string;
  code: string;
  weight: number;
  maxScore: number;
};

type ScoreViolation = {
  criteriaId: string;
  numErrors: number;
  repeatCount: number;
  repeatLabel: RepeatLabel;
  isCriticalTriggered: boolean;
};

const mode = parseMode(process.argv[2]);
const targetStores = numberFromEnv("ANALYTICS_TARGET_STORES", 800);
const targetQc = numberFromEnv("ANALYTICS_TARGET_QC", 30);
const targetAm = numberFromEnv("ANALYTICS_TARGET_AM", 45);
const targetQam = numberFromEnv("ANALYTICS_TARGET_QAM", 6);
const targetExecutives = numberFromEnv("ANALYTICS_TARGET_EXECUTIVES", 4);
const months = numberFromEnv("ANALYTICS_MONTHS", 12);
const completionRate = numberFromEnv("ANALYTICS_COMPLETION_RATE", 0.9);
const violationRate = numberFromEnv("ANALYTICS_VIOLATION_RATE", 0.55);
const actionPlanRate = numberFromEnv("ANALYTICS_ACTION_PLAN_RATE", 0.45);
const defaultPassword = process.env.ANALYTICS_USER_PASSWORD || "Test@1234";

faker.seed(20260521);

const VIETNAMESE_BRANDS = [
  "Trà Sen Việt",
  "Cà Phê Bình Minh",
  "Bếp Xanh",
  "Quán Ngon Phố",
  "Lá Lành Kitchen",
  "Góc Phố Coffee",
];
const CLOUD_BRAND_CODE = "CLOUD";
const DEMO_AUDIT_IMAGE_URLS = [
  "/uploads/evidence/demo-audit-area.svg",
  "/uploads/evidence/demo-audit-label.svg",
  "/uploads/evidence/demo-audit-storage.svg",
];
const DEMO_REMEDIATION_IMAGE_URLS = [
  "/uploads/evidence/demo-remediation-cleaned.svg",
  "/uploads/evidence/demo-remediation-labelled.svg",
  "/uploads/evidence/demo-remediation-training.svg",
];
const CLOUD_BRAND_NAME = "Bếp Trung Tâm";

const VIETNAMESE_PROVINCES = [
  { region: "Miền Bắc", province: "Hà Nội", districts: ["Cầu Giấy", "Đống Đa", "Hoàn Kiếm", "Hai Bà Trưng", "Long Biên"] },
  { region: "Miền Bắc", province: "Hải Phòng", districts: ["Lê Chân", "Ngô Quyền", "Hồng Bàng", "Kiến An"] },
  { region: "Miền Trung", province: "Đà Nẵng", districts: ["Hải Châu", "Thanh Khê", "Sơn Trà", "Ngũ Hành Sơn"] },
  { region: "Miền Trung", province: "Khánh Hòa", districts: ["Nha Trang", "Cam Ranh", "Diên Khánh"] },
  { region: "Miền Nam", province: "TP. Hồ Chí Minh", districts: ["Quận 1", "Quận 3", "Bình Thạnh", "Tân Bình", "Phú Nhuận"] },
  { region: "Miền Nam", province: "Bình Dương", districts: ["Thủ Dầu Một", "Dĩ An", "Thuận An"] },
  { region: "Miền Nam", province: "Đồng Nai", districts: ["Biên Hòa", "Long Khánh", "Trảng Bom"] },
  { region: "Miền Tây", province: "Cần Thơ", districts: ["Ninh Kiều", "Cái Răng", "Bình Thủy"] },
];

const STREET_NAMES = [
  "Nguyễn Trãi",
  "Lê Lợi",
  "Trần Hưng Đạo",
  "Phan Đình Phùng",
  "Võ Văn Tần",
  "Nguyễn Văn Linh",
  "Hai Bà Trưng",
  "Điện Biên Phủ",
  "Hoàng Diệu",
  "Lý Thường Kiệt",
];

const STORE_SUFFIXES = [
  "Trung Tâm",
  "Góc Phố",
  "Bến Thành",
  "Phố Mới",
  "An Phú",
  "Lê Lợi",
  "Nguyễn Trãi",
  "Sông Hàn",
  "Cầu Giấy",
  "Ninh Kiều",
];

const VIETNAMESE_LAST_NAMES = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Phan", "Vũ", "Đặng", "Bùi", "Đỗ"];
const VIETNAMESE_MIDDLE_NAMES = ["Văn", "Thị", "Minh", "Gia", "Thanh", "Ngọc", "Quốc", "Hoài", "Anh", "Đức"];
const VIETNAMESE_GIVEN_NAMES = ["An", "Bình", "Chi", "Dũng", "Hà", "Huy", "Linh", "Long", "Mai", "Nam", "Phúc", "Quân", "Thảo", "Trang", "Vy"];

const VIOLATION_NOTES = [
  "Khu vực chưa đạt tiêu chuẩn vệ sinh tại thời điểm kiểm tra.",
  "Nhân viên thực hiện chưa đúng quy trình vận hành đã ban hành.",
  "Cần bổ sung hình ảnh xác nhận sau khi khắc phục.",
  "Lỗi đã từng xuất hiện trong các kỳ kiểm tra trước.",
  "Dụng cụ hoặc khu vực làm việc chưa được sắp xếp đúng quy định.",
  "Tem nhãn, hạn sử dụng hoặc điều kiện bảo quản cần được rà soát lại.",
];

const ROOT_CAUSES = [
  "Nhân sự ca trực chưa kiểm tra checklist đầu ca đầy đủ.",
  "Cửa hàng chưa phân công rõ người phụ trách khu vực này.",
  "Tần suất vệ sinh trong giờ cao điểm chưa phù hợp.",
  "Nhân viên mới chưa nắm đủ quy trình vận hành.",
  "Quản lý ca chưa kiểm tra lại sau khi bàn giao.",
];

const REMEDIATIONS = [
  "Đã vệ sinh lại khu vực, phân công người chịu trách nhiệm và chụp ảnh xác nhận.",
  "Đã nhắc lại quy trình cho nhân viên trong ca và bổ sung vào checklist đầu ngày.",
  "Đã thay tem nhãn, loại bỏ nguyên liệu không đạt và kiểm tra lại tồn kho.",
  "Đã sắp xếp lại dụng cụ, vệ sinh bề mặt và cập nhật hình ảnh minh chứng.",
  "Đã đào tạo nhanh lại cho nhân viên liên quan và quản lý ca xác nhận hoàn tất.",
];

function vietnameseName(index = faker.number.int({ min: 1, max: 9999 })) {
  const normalizedIndex = Math.max(0, index - 1);
  const lastName = VIETNAMESE_LAST_NAMES[normalizedIndex % VIETNAMESE_LAST_NAMES.length];
  const middleName =
    VIETNAMESE_MIDDLE_NAMES[
      Math.floor(normalizedIndex / VIETNAMESE_LAST_NAMES.length) %
        VIETNAMESE_MIDDLE_NAMES.length
    ];
  const givenName =
    VIETNAMESE_GIVEN_NAMES[
      Math.floor(
        normalizedIndex / (VIETNAMESE_LAST_NAMES.length * VIETNAMESE_MIDDLE_NAMES.length)
      ) % VIETNAMESE_GIVEN_NAMES.length
    ];
  const secondGivenName =
    VIETNAMESE_GIVEN_NAMES[
      Math.floor(
        normalizedIndex /
          (VIETNAMESE_LAST_NAMES.length *
            VIETNAMESE_MIDDLE_NAMES.length *
            VIETNAMESE_GIVEN_NAMES.length)
      ) % VIETNAMESE_GIVEN_NAMES.length
    ];

  if (
    normalizedIndex >=
    VIETNAMESE_LAST_NAMES.length *
      VIETNAMESE_MIDDLE_NAMES.length *
      VIETNAMESE_GIVEN_NAMES.length
  ) {
    return [lastName, middleName, secondGivenName, givenName].join(" ");
  }

  return [lastName, middleName, givenName].join(" ");
}

function vietnamesePhone(index: number) {
  return `09${String(10000000 + (index % 89999999)).slice(0, 8)}`;
}

function vietnameseLocation(index: number) {
  const area = VIETNAMESE_PROVINCES[index % VIETNAMESE_PROVINCES.length];
  const district = area.districts[index % area.districts.length];
  const ward = `Phường ${1 + (index % 20)}`;
  const street = STREET_NAMES[index % STREET_NAMES.length];
  return {
    region: area.region,
    province: area.province,
    district,
    ward,
    address: `${12 + (index % 180)} ${street}, ${ward}, ${district}, ${area.province}`,
  };
}

function vietnameseStoreName(brandName: string, index: number, district?: string) {
  const suffix = STORE_SUFFIXES[index % STORE_SUFFIXES.length];
  return `${brandName} ${district || suffix}`;
}

function statusLabel(status: string) {
  if (status === "closed") return "đã đóng";
  if (status === "submitted") return "đã gửi chờ duyệt";
  if (status === "rejected") return "bị yêu cầu bổ sung";
  return "đang nháp";
}

function parseMode(value: string | undefined): SeedMode {
  if (!value || value === "append") return "append";
  if (value === "reset-qaqc-analytics") return value;
  if (value === "normalize-master") return value;
  throw new Error(`Unknown analytics seed mode: ${value}`);
}

function numberFromEnv(name: string, fallback: number) {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function id() {
  return randomUUID();
}

function demoImageName(url: string) {
  return url.split("/").pop() || "demo-evidence.svg";
}

function demoImageUrl(kind: "audit" | "remediation", index = faker.number.int({ min: 0, max: 9999 })) {
  const urls = kind === "audit" ? DEMO_AUDIT_IMAGE_URLS : DEMO_REMEDIATION_IMAGE_URLS;
  return urls[index % urls.length];
}

function demoEvidenceSvg(title: string, subtitle: string, color: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="${color}"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
  </defs>
  <rect width="960" height="640" rx="32" fill="url(#bg)"/>
  <rect x="56" y="56" width="848" height="528" rx="24" fill="rgba(255,255,255,0.92)"/>
  <rect x="96" y="120" width="320" height="210" rx="16" fill="#e2e8f0"/>
  <rect x="456" y="120" width="408" height="56" rx="12" fill="#cbd5e1"/>
  <rect x="456" y="204" width="300" height="42" rx="10" fill="#e2e8f0"/>
  <rect x="456" y="270" width="360" height="42" rx="10" fill="#e2e8f0"/>
  <rect x="96" y="372" width="768" height="132" rx="18" fill="#f8fafc" stroke="#cbd5e1"/>
  <text x="116" y="178" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#0f172a">${title}</text>
  <text x="116" y="222" font-family="Arial, sans-serif" font-size="22" fill="#334155">${subtitle}</text>
  <text x="116" y="438" font-family="Arial, sans-serif" font-size="24" fill="#0f172a">Ảnh minh chứng demo</text>
  <text x="116" y="474" font-family="Arial, sans-serif" font-size="18" fill="#64748b">Dùng cho môi trường QA/QC portfolio, không phải dữ liệu cửa hàng thật.</text>
</svg>`;
}

async function ensureDemoEvidenceAssets() {
  const outputDir = path.join(process.cwd(), "public", "uploads", "evidence");
  await mkdir(outputDir, { recursive: true });

  const assets = [
    [DEMO_AUDIT_IMAGE_URLS[0], "Khu vực cần kiểm tra", "Ghi nhận lỗi tại thời điểm audit", "#0891b2"],
    [DEMO_AUDIT_IMAGE_URLS[1], "Tem nhãn cần rà soát", "Ảnh lỗi do QC ghi nhận", "#ea580c"],
    [DEMO_AUDIT_IMAGE_URLS[2], "Bảo quản chưa đạt", "Minh chứng audit vận hành", "#7c3aed"],
    [DEMO_REMEDIATION_IMAGE_URLS[0], "Đã vệ sinh lại", "Ảnh xác nhận khắc phục", "#059669"],
    [DEMO_REMEDIATION_IMAGE_URLS[1], "Đã cập nhật tem nhãn", "Minh chứng sau xử lý", "#2563eb"],
    [DEMO_REMEDIATION_IMAGE_URLS[2], "Đã đào tạo lại", "Xác nhận hoàn tất AP", "#be123c"],
  ] as const;

  for (const [url, title, subtitle, color] of assets) {
    await writeFile(
      path.join(process.cwd(), "public", url.slice(1)),
      demoEvidenceSvg(title, subtitle, color),
      "utf8"
    );
  }
}

function pick<T>(items: T[]) {
  if (items.length === 0) throw new Error("Cannot pick from an empty array");
  return items[faker.number.int({ min: 0, max: items.length - 1 })];
}

function chance(rate: number) {
  return faker.number.float({ min: 0, max: 1 }) < rate;
}

function randomDateBetween(start: Date, end: Date) {
  return faker.date.between({ from: start, to: end });
}

function monthWindow(monthsAgo: number) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo + 1, 0, 23, 59, 59));
  return { start, end };
}

function normalizeWeight(raw: number) {
  return raw > 0 && raw <= 1 ? raw * 100 : raw;
}

function repeatLabelFor(repeatCount: number): RepeatLabel {
  if (repeatCount === 1) return "second";
  if (repeatCount === 2) return "third";
  if (repeatCount === 3) return "auto_ccp";
  return "first";
}

function gradeFromScore(score: number) {
  if (score < 70) return "fail";
  if (score < 85) return "pass";
  if (score < 95) return "good";
  return "excellent";
}

function multiplierFor(label: RepeatLabel) {
  if (label === "second") return 2;
  if (label === "third") return 3;
  return 1;
}

function roundScore(value: number) {
  return Math.round(value * 100) / 100;
}

function calculateScore({
  groups,
  criteria,
  violations,
}: {
  groups: ScoreGroup[];
  criteria: ScoreCriterion[];
  violations: ScoreViolation[];
}) {
  const criteriaById = new Map(criteria.map((item) => [item.id, item]));
  const deductionsByGroup = new Map<string, number>();
  const criticalGroups = new Set<string>();
  let isRiskTriggered = false;

  for (const violation of violations) {
    if (violation.numErrors <= 0) continue;
    const criterion = criteriaById.get(violation.criteriaId);
    if (!criterion) continue;

    if (criterion.flag === "risk") {
      isRiskTriggered = true;
      continue;
    }

    if (criterion.flag === "critical" || violation.isCriticalTriggered) {
      if (criterion.groupId) criticalGroups.add(criterion.groupId);
      continue;
    }

    if (!criterion.groupId) continue;

    const rawDeduction =
      violation.numErrors *
      criterion.deductionPerError *
      multiplierFor(violation.repeatLabel);
    const cappedDeduction = Math.min(rawDeduction, criterion.maxDeduction);
    deductionsByGroup.set(
      criterion.groupId,
      (deductionsByGroup.get(criterion.groupId) ?? 0) + cappedDeduction
    );
  }

  const groupScores = groups.map((group) => {
    const triggeredCritical = criticalGroups.has(group.id);
    const reachedScore = triggeredCritical
      ? 0
      : Math.max(0, group.maxScore - (deductionsByGroup.get(group.id) ?? 0));
    const percentage = group.maxScore > 0 ? (reachedScore / group.maxScore) * 100 : 0;

    return {
      groupId: group.id,
      groupCode: group.code,
      weight: group.weight,
      maxScore: group.maxScore,
      reachedScore: roundScore(reachedScore),
      percentage: roundScore(percentage),
      triggeredCritical,
    };
  });

  const weightedScore = groupScores.reduce(
    (total, group) => total + group.percentage * (group.weight / 100),
    0
  );
  const finalScore = isRiskTriggered ? 0 : roundScore(weightedScore);

  return {
    finalScore,
    grade: isRiskTriggered ? "alarm" : gradeFromScore(finalScore),
    isRiskTriggered,
    groupScores,
  };
}

async function createManyInBatches<T>(
  label: string,
  items: T[],
  writer: (batch: T[]) => Promise<unknown>,
  batchSize = 1000
) {
  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    await writer(batch);
    console.log(`${label}: inserted ${Math.min(index + batch.length, items.length)}/${items.length}`);
  }
}

async function resetQaqcAnalytics() {
  console.log("Resetting QA/QC analytics domain data only...");
  await prisma.evidence.deleteMany();
  await prisma.actionPlanItem.deleteMany();
  await prisma.actionPlan.deleteMany();
  await prisma.auditCorrectionRequest.deleteMany();
  await prisma.auditAssignment.deleteMany();
  await prisma.groupScore.deleteMany();
  await prisma.violation.deleteMany();
  await prisma.audit.deleteMany();
  await prisma.auditPlan.deleteMany();
  await prisma.notification.deleteMany({
    where: {
      OR: [
        { link: { contains: "/audits" } },
        { link: { contains: "/action-plans" } },
        { title: { contains: "Action Plan" } },
      ],
    },
  });
}

async function ensureRoleUsers(roleKey: string, target: number, passwordHash: string) {
  const existing = await prisma.user.findMany({
    where: { roleAssignments: { some: { roleKey } } },
    include: { roleAssignments: true },
  });

  if (existing.length >= target) return existing;

  const missing = target - existing.length;
  console.log(`Creating ${missing} ${roleKey} users...`);

  const created = [];
  for (let index = 0; index < missing; index++) {
    const suffix = `${roleKey.replaceAll("_", "-")}-${existing.length + index + 1}`;
    const user = await prisma.user.create({
      data: {
        email: `${suffix}-${id().slice(0, 8)}@qualityops.demo`,
        fullName: vietnameseName(existing.length + index + 1),
        phone: vietnamesePhone(existing.length + index + 1),
        password: passwordHash,
        roleAssignments: { create: { roleKey } },
      },
      include: { roleAssignments: true },
    });
    created.push(user);
  }

  return [...existing, ...created];
}

async function ensureBrands() {
  const existing = await prisma.brand.findMany({ orderBy: { code: "asc" } });
  if (!existing.some((brand) => brand.code === CLOUD_BRAND_CODE)) {
    await prisma.brand.create({
      data: {
        code: CLOUD_BRAND_CODE,
        name: CLOUD_BRAND_NAME,
      },
    });
  }

  const regularBrands = existing.filter((brand) => brand.code !== CLOUD_BRAND_CODE);
  if (regularBrands.length >= 4) {
    return prisma.brand.findMany({ orderBy: { code: "asc" } });
  }

  for (let index = regularBrands.length; index < 4; index++) {
    await prisma.brand.create({
      data: {
        code: `DEMO-BR-${index + 1}`,
        name: VIETNAMESE_BRANDS[index],
      },
    });
  }

  return prisma.brand.findMany({ orderBy: { code: "asc" } });
}

async function ensureStores(
  target: number,
  brands: { id: string; code: string; name: string }[],
  amUsers: { id: string }[],
  smUsers: { id: string }[]
) {
  const existing = await prisma.store.findMany({ orderBy: { code: "asc" } });
  if (existing.length >= target) return existing;

  const cloudBrand = brands.find((brand) => brand.code === CLOUD_BRAND_CODE);
  const regularBrands = brands.filter((brand) => brand.code !== CLOUD_BRAND_CODE);

  const missing = target - existing.length;
  console.log(`Creating ${missing} demo stores...`);

  const created = [];
  for (let index = 0; index < missing; index++) {
    const absoluteIndex = existing.length + index + 1;
    const isCloudKitchen = chance(0.12);
    const brand = isCloudKitchen && cloudBrand ? cloudBrand : pick(regularBrands);
    const am = pick(amUsers);
    const sm = smUsers[absoluteIndex % smUsers.length];
    const location = vietnameseLocation(absoluteIndex);
    const store = await prisma.store.create({
      data: {
        code: `DEMO-ST-${String(absoluteIndex).padStart(4, "0")}-${id().slice(0, 6)}`,
        name: vietnameseStoreName(brand.name, absoluteIndex, location.district),
        modelType: isCloudKitchen ? "cloud_kitchen" : "standard",
        brandId: brand.id,
        amId: am.id,
        managerId: sm.id,
        region: location.region,
        province: location.province,
        district: location.district,
        ward: location.ward,
        address: location.address,
      },
    });

    await prisma.roleAssignment.updateMany({
      where: { userId: sm.id, roleKey: "store_manager" },
      data: { storeId: store.id },
    });
    created.push(store);
  }

  return [...existing, ...created];
}

async function loadChecklist() {
  const form = await prisma.checklistForm.findFirst({
    where: { status: "published" },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    include: {
      sections: {
        orderBy: { order: "asc" },
        include: {
          group: true,
          items: {
            orderBy: { order: "asc" },
            include: { criteria: true },
          },
        },
      },
    },
  });

  if (!form) {
    throw new Error("No published checklist found. Create/import a published checklist before seeding analytics.");
  }

  const riskCriteria = await prisma.criteria.findMany({
    where: { flag: "risk", isActive: true },
  });

  const sectionCriteria = form.sections.flatMap((section) =>
    section.items.map((item) => item.criteria)
  );
  const allCriteria = [...sectionCriteria, ...riskCriteria.filter((risk) => !sectionCriteria.some((item) => item.id === risk.id))];

  const groups = form.sections.map((section) => {
    const normalCriteria = section.items
      .map((item) => item.criteria)
      .filter((criterion) => criterion.flag === "none");
    const rawWeight = section.weight > 0 ? section.weight : section.group.weight;

    return {
      id: section.group.id,
      code: section.group.code,
      weight: normalizeWeight(rawWeight),
      maxScore: normalCriteria.reduce((sum, criterion) => sum + criterion.maxDeduction, 0) || 100,
    };
  });

  const totalWeight = groups.reduce((sum, group) => sum + group.weight, 0);
  const normalizedGroups = totalWeight > 0
    ? groups.map((group) => ({ ...group, weight: roundScore((group.weight / totalWeight) * 100) }))
    : groups;

  return {
    form,
    groups: normalizedGroups,
    criteria: allCriteria,
    normalCriteria: allCriteria.filter((criterion) => criterion.flag === "none"),
    criticalCriteria: allCriteria.filter((criterion) => criterion.flag === "critical"),
    riskCriteria,
  };
}

async function normalizeVietnameseMasterData() {
  console.log("Normalizing demo master data to Vietnamese values...");

  const brands = await prisma.brand.findMany({ orderBy: { code: "asc" } });
  const regularBrandsToNormalize = brands.filter((brand) => brand.code !== CLOUD_BRAND_CODE);
  for (let index = 0; index < regularBrandsToNormalize.length; index++) {
    await prisma.brand.update({
      where: { id: regularBrandsToNormalize[index].id },
      data: { name: VIETNAMESE_BRANDS[index % VIETNAMESE_BRANDS.length] },
    });
  }

  const cloudBrandToNormalize = brands.find((brand) => brand.code === CLOUD_BRAND_CODE);
  if (cloudBrandToNormalize) {
    await prisma.brand.update({
      where: { id: cloudBrandToNormalize.id },
      data: { name: CLOUD_BRAND_NAME },
    });
  }

  const refreshedBrands = await prisma.brand.findMany({ orderBy: { code: "asc" } });
  const brandById = new Map(refreshedBrands.map((brand) => [brand.id, brand]));
  const cloudBrand = refreshedBrands.find((brand) => brand.code === CLOUD_BRAND_CODE);
  const regularBrands = refreshedBrands.filter((brand) => brand.code !== CLOUD_BRAND_CODE);
  const stores = await prisma.store.findMany({ orderBy: { code: "asc" } });

  for (const store of stores) {
    await prisma.store.update({
      where: { id: store.id },
      data: { code: `TMP-${store.id.slice(0, 12)}` },
    });
  }

  for (let index = 0; index < stores.length; index++) {
    const store = stores[index];
    const location = vietnameseLocation(index + 1);
    const currentBrand = brandById.get(store.brandId);
    const brand =
      store.modelType === "cloud_kitchen" && cloudBrand
        ? cloudBrand
        : currentBrand?.code === CLOUD_BRAND_CODE
          ? regularBrands[index % regularBrands.length]
          : currentBrand ?? regularBrands[index % regularBrands.length];

    await prisma.store.update({
      where: { id: store.id },
      data: {
        code: `CH${String(index + 1).padStart(4, "0")}`,
        name: vietnameseStoreName(brand.name, index + 1, location.district),
        brandId: brand.id,
        region: location.region,
        province: location.province,
        district: location.district,
        ward: location.ward,
        address: location.address,
      },
    });
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });

  for (let index = 0; index < users.length; index++) {
    const user = users[index];
    const isFixedAdmin = user.email === "admin@qualityops.com";
    await prisma.user.update({
      where: { id: user.id },
      data: {
        fullName: isFixedAdmin ? "Quản Trị Hệ Thống" : vietnameseName(index + 1),
        phone: vietnamesePhone(index + 1),
      },
    });
  }

}

async function normalizeDemoEvidenceRecords() {
  await ensureDemoEvidenceAssets();

  await prisma.evidence.updateMany({
    where: { violationId: { not: null } },
    data: {
      url: DEMO_AUDIT_IMAGE_URLS[0],
      fileName: demoImageName(DEMO_AUDIT_IMAGE_URLS[0]),
      mimeType: "image/svg+xml",
    },
  });

  await prisma.evidence.updateMany({
    where: { actionPlanItemId: { not: null } },
    data: {
      url: DEMO_REMEDIATION_IMAGE_URLS[0],
      fileName: demoImageName(DEMO_REMEDIATION_IMAGE_URLS[0]),
      mimeType: "image/svg+xml",
    },
  });

  await prisma.evidence.updateMany({
    where: {
      violationId: null,
      actionPlanItemId: null,
    },
    data: {
      url: DEMO_AUDIT_IMAGE_URLS[1],
      fileName: demoImageName(DEMO_AUDIT_IMAGE_URLS[1]),
      mimeType: "image/svg+xml",
    },
  });
}

function pickRepeatCount() {
  const roll = faker.number.int({ min: 1, max: 100 });
  if (roll <= 60) return 0;
  if (roll <= 80) return 1;
  if (roll <= 93) return 2;
  return 3;
}

function pickActionPlanStatus() {
  const roll = faker.number.int({ min: 1, max: 100 });
  if (roll <= 55) return "closed";
  if (roll <= 72) return "submitted";
  if (roll <= 84) return "rejected";
  return "draft";
}

function pickCriteriaForViolation({
  normalCriteria,
  criticalCriteria,
  riskCriteria,
  hotCriteria,
}: {
  normalCriteria: { id: string; flag: string }[];
  criticalCriteria: { id: string; flag: string }[];
  riskCriteria: { id: string; flag: string }[];
  hotCriteria: { id: string; flag: string }[];
}) {
  const roll = faker.number.int({ min: 1, max: 100 });
  if (roll <= 3 && riskCriteria.length > 0) return pick(riskCriteria);
  if (roll <= 12 && criticalCriteria.length > 0) return pick(criticalCriteria);
  if (roll <= 55 && hotCriteria.length > 0) return pick(hotCriteria);
  return pick(normalCriteria);
}

async function buildAnalyticsDataset() {
  const passwordHash = await bcrypt.hash(defaultPassword, 10);

  const qamUsers = await ensureRoleUsers("qa_manager", targetQam, passwordHash);
  const qcUsers = await ensureRoleUsers("qc_auditor", targetQc, passwordHash);
  const amUsers = await ensureRoleUsers("am", targetAm, passwordHash);
  const smUsers = await ensureRoleUsers("store_manager", targetStores, passwordHash);
  await ensureRoleUsers("executive_viewer", targetExecutives, passwordHash);
  const brands = await ensureBrands();
  const stores = await ensureStores(targetStores, brands, amUsers, smUsers);
  await normalizeVietnameseMasterData();
  const normalizedStores = await prisma.store.findMany({ orderBy: { code: "asc" } });
  const checklist = await loadChecklist();

  if (checklist.normalCriteria.length === 0) {
    throw new Error("Published checklist has no normal criteria. Analytics seed needs normal criteria.");
  }

  const selectedStores = normalizedStores.slice(0, targetStores);
  const weakStoreIds = new Set(
    faker.helpers.arrayElements(selectedStores, Math.max(1, Math.floor(selectedStores.length * 0.15))).map((store) => store.id)
  );
  const hotCriteria = faker.helpers.arrayElements(
    checklist.normalCriteria,
    Math.max(1, Math.min(8, checklist.normalCriteria.length))
  );

  const auditPlans: Prisma.AuditPlanCreateManyInput[] = [];
  const assignments: Prisma.AuditAssignmentCreateManyInput[] = [];
  const audits: Prisma.AuditCreateManyInput[] = [];
  const groupScores: Prisma.GroupScoreCreateManyInput[] = [];
  const violations: Prisma.ViolationCreateManyInput[] = [];
  const actionPlans: Prisma.ActionPlanCreateManyInput[] = [];
  const actionPlanItems: Prisma.ActionPlanItemCreateManyInput[] = [];
  const correctionRequests: Prisma.AuditCorrectionRequestCreateManyInput[] = [];
  const evidences: Prisma.EvidenceCreateManyInput[] = [];
  const notifications: Prisma.NotificationCreateManyInput[] = [];

  const scoreCriteria: ScoreCriterion[] = checklist.criteria.map((criterion) => ({
    id: criterion.id,
    groupId: criterion.groupId,
    deductionPerError: criterion.deductionPerError,
    maxDeduction: criterion.maxDeduction,
    flag: criterion.flag,
  }));

  console.log("Generating analytics rows in memory...");

  for (let monthIndex = months - 1; monthIndex >= 0; monthIndex--) {
    const { start, end } = monthWindow(monthIndex);
    const planId = id();
    const monthCode = start.toISOString().slice(0, 7);

    auditPlans.push({
      id: planId,
      name: `Kế hoạch kiểm tra vận hành ${monthCode}`,
      type: "adhoc",
      scope: "company",
      formId: checklist.form.id,
      status: monthIndex === 0 ? "open" : "closed",
      startDate: start,
      endDate: end,
      createdAt: start,
      updatedAt: end,
    });

    for (const store of selectedStores) {
      const assignmentId = id();
      const auditor = pick(qcUsers);
      const completed = chance(completionRate);
      const auditId = completed ? id() : undefined;

      assignments.push({
        id: assignmentId,
        planId,
        storeId: store.id,
        auditorId: auditor.id,
        status: completed ? "completed" : chance(0.5) ? "pending" : "in_progress",
        auditId,
        createdAt: start,
        updatedAt: completed ? randomDateBetween(start, end) : start,
      });

      if (!completed || !auditId) continue;

      const isWeakStore = weakStoreIds.has(store.id);
      const hasViolation = chance(isWeakStore ? Math.min(0.85, violationRate + 0.25) : violationRate);
      const pickedCriteriaIds = new Set<string>();
      const auditViolations: ScoreViolation[] = [];
      const auditViolationRows: Prisma.ViolationCreateManyInput[] = [];

      if (hasViolation) {
        const violationCount = faker.number.int({
          min: isWeakStore ? 4 : 2,
          max: isWeakStore ? 8 : 6,
        });

        for (let index = 0; index < violationCount; index++) {
          const criterion = pickCriteriaForViolation({
            normalCriteria: checklist.normalCriteria,
            criticalCriteria: checklist.criticalCriteria,
            riskCriteria: checklist.riskCriteria,
            hotCriteria,
          });

          if (pickedCriteriaIds.has(criterion.id)) continue;
          pickedCriteriaIds.add(criterion.id);

          const repeatCount = criterion.flag === "risk" ? 0 : pickRepeatCount();
          const repeatLabel = repeatLabelFor(repeatCount);
          const isCriticalTriggered = criterion.flag === "critical" || repeatCount === 3;
          const isRiskTriggered = criterion.flag === "risk";
          const violationId = id();
          const note = pick(VIOLATION_NOTES);

          auditViolations.push({
            criteriaId: criterion.id,
            numErrors: faker.number.int({ min: 1, max: isWeakStore ? 4 : 2 }),
            repeatCount,
            repeatLabel,
            isCriticalTriggered,
          });

          auditViolationRows.push({
            id: violationId,
            auditId,
            criteriaId: criterion.id,
            numErrors: auditViolations[auditViolations.length - 1].numErrors,
            repeatCount,
            isCriticalTriggered,
            isRiskTriggered,
            note,
            createdAt: randomDateBetween(start, end),
          });

          if (chance(isCriticalTriggered || isRiskTriggered ? 0.75 : 0.3)) {
            const imageUrl = demoImageUrl("audit", auditViolationRows.length);
            evidences.push({
              id: id(),
              violationId,
              url: imageUrl,
              fileName: demoImageName(imageUrl),
              mimeType: "image/svg+xml",
              createdAt: randomDateBetween(start, end),
            });
          }
        }
      }

      const score = calculateScore({
        groups: checklist.groups,
        criteria: scoreCriteria,
        violations: auditViolations,
      });
      const submittedAt = randomDateBetween(start, end);

      audits.push({
        id: auditId,
        formId: checklist.form.id,
        storeId: store.id,
        auditorId: auditor.id,
        finalScore: score.finalScore,
        grade: score.grade,
        isRiskTriggered: score.isRiskTriggered,
        submittedAt,
        createdAt: submittedAt,
        updatedAt: submittedAt,
      });

      for (const groupScore of score.groupScores) {
        groupScores.push({
          id: id(),
          auditId,
          groupId: groupScore.groupId,
          groupCode: groupScore.groupCode,
          weight: groupScore.weight,
          maxScore: groupScore.maxScore,
          reachedScore: groupScore.reachedScore,
          percentage: groupScore.percentage,
          triggeredCritical: groupScore.triggeredCritical,
        });
      }

      violations.push(...auditViolationRows);

      const shouldCreateActionPlan =
        auditViolationRows.length > 0 &&
        (chance(actionPlanRate) || score.grade === "fail" || score.grade === "alarm");

      if (shouldCreateActionPlan) {
        const actionPlanId = id();
        const status = pickActionPlanStatus();
        const reviewedAt = status === "rejected" || status === "closed" ? faker.date.soon({ days: 5, refDate: submittedAt }) : null;
        const closedAt = status === "closed" ? reviewedAt : null;
        const qam = pick(qamUsers);

        actionPlans.push({
          id: actionPlanId,
          auditId,
          storeId: store.id,
          status,
          remediation: status === "draft" ? null : "Cửa hàng đã gửi phương án khắc phục cho các lỗi được ghi nhận.",
          deadline: faker.date.soon({ days: 7, refDate: submittedAt }),
          closedById: status === "closed" ? qam.id : null,
          closedAt,
          reviewedById: status === "closed" || status === "rejected" ? qam.id : null,
          reviewedAt,
          reviewNote: status === "rejected" ? "Cần bổ sung hình ảnh minh chứng rõ hơn cho hạng mục khắc phục." : null,
          createdAt: faker.date.soon({ days: 1, refDate: submittedAt }),
          updatedAt: reviewedAt ?? submittedAt,
        });

        for (const violation of auditViolationRows) {
          const actionPlanItemId = id();
          const needsEvidence = violation.isCriticalTriggered || violation.isRiskTriggered;
          const shouldFill = status !== "draft" || chance(0.55);

          actionPlanItems.push({
            id: actionPlanItemId,
            actionPlanId,
            violationId: violation.id as string,
            rootCause: shouldFill ? pick(ROOT_CAUSES) : null,
            remediation: shouldFill ? pick(REMEDIATIONS) : null,
            fixedAt: shouldFill ? faker.date.soon({ days: 5, refDate: submittedAt }) : null,
            assigneeName: shouldFill ? vietnameseName(faker.number.int({ min: 1, max: 9999 })) : null,
            status: status === "closed" ? "done" : "open",
            createdAt: submittedAt,
            updatedAt: reviewedAt ?? submittedAt,
          });

          if (needsEvidence || chance(0.45)) {
            const imageUrl = demoImageUrl("remediation", actionPlanItems.length);
            evidences.push({
              id: id(),
              actionPlanId,
              actionPlanItemId,
              url: imageUrl,
              fileName: demoImageName(imageUrl),
              mimeType: "image/svg+xml",
              createdAt: faker.date.soon({ days: 5, refDate: submittedAt }),
            });
          }
        }

        if (store.managerId) {
          notifications.push({
            id: id(),
            userId: store.managerId,
            title: "Đã tạo kế hoạch khắc phục",
            message: `Cửa hàng ${store.code} có kế hoạch khắc phục mới cần xử lý.`,
            type: score.grade === "alarm" ? "alarm" : "warning",
            isRead: chance(0.65),
            link: `/action-plans/${actionPlanId}`,
            createdAt: submittedAt,
          });
        }

        notifications.push({
          id: id(),
          userId: qam.id,
          title: `Kế hoạch khắc phục ${statusLabel(status)}`,
          message: `Kế hoạch khắc phục của cửa hàng ${store.code} ${statusLabel(status)}.`,
          type: status === "rejected" ? "warning" : "info",
          isRead: chance(0.5),
          link: `/action-plans/${actionPlanId}`,
          createdAt: reviewedAt ?? submittedAt,
        });
      } else if (auditViolationRows.length > 0 && store.managerId && chance(0.06)) {
        const qam = pick(qamUsers);
        const status = pick(["pending", "approved", "rejected"]);
        correctionRequests.push({
          id: id(),
          auditId,
          storeId: store.id,
          requestedById: store.managerId,
          reason: "Cửa hàng đề nghị QA xem lại kết quả kiểm tra vì có hạng mục cần đối chiếu lại.",
          status,
          reviewedById: status === "pending" ? null : qam.id,
          reviewedAt: status === "pending" ? null : faker.date.soon({ days: 3, refDate: submittedAt }),
          reviewNote: status === "rejected" ? "Kết quả kiểm tra vẫn hợp lệ, chưa đủ cơ sở để điều chỉnh điểm." : null,
          createdAt: faker.date.soon({ days: 1, refDate: submittedAt }),
          updatedAt: submittedAt,
        });
      }
    }
  }

  console.log("Writing analytics rows to database...");
  await createManyInBatches("audit_plans", auditPlans, (batch) => prisma.auditPlan.createMany({ data: batch }));
  await createManyInBatches("audits", audits, (batch) => prisma.audit.createMany({ data: batch }));
  await createManyInBatches("audit_assignments", assignments, (batch) => prisma.auditAssignment.createMany({ data: batch }));
  await createManyInBatches("group_scores", groupScores, (batch) => prisma.groupScore.createMany({ data: batch }));
  await createManyInBatches("violations", violations, (batch) => prisma.violation.createMany({ data: batch }));
  await createManyInBatches("action_plans", actionPlans, (batch) => prisma.actionPlan.createMany({ data: batch }));
  await createManyInBatches("action_plan_items", actionPlanItems, (batch) => prisma.actionPlanItem.createMany({ data: batch }));
  await createManyInBatches("audit_correction_requests", correctionRequests, (batch) => prisma.auditCorrectionRequest.createMany({ data: batch }));
  await createManyInBatches("evidences", evidences, (batch) => prisma.evidence.createMany({ data: batch }));
  await createManyInBatches("notifications", notifications, (batch) => prisma.notification.createMany({ data: batch }));
}

async function printCounts() {
  const [
    brands,
    stores,
    users,
    auditPlans,
    assignments,
    audits,
    groupScores,
    violations,
    actionPlans,
    actionPlanItems,
    evidences,
    correctionRequests,
    notifications,
  ] = await Promise.all([
    prisma.brand.count(),
    prisma.store.count(),
    prisma.user.count(),
    prisma.auditPlan.count(),
    prisma.auditAssignment.count(),
    prisma.audit.count(),
    prisma.groupScore.count(),
    prisma.violation.count(),
    prisma.actionPlan.count(),
    prisma.actionPlanItem.count(),
    prisma.evidence.count(),
    prisma.auditCorrectionRequest.count(),
    prisma.notification.count(),
  ]);

  console.table({
    brands,
    stores,
    users,
    auditPlans,
    assignments,
    audits,
    groupScores,
    violations,
    actionPlans,
    actionPlanItems,
    evidences,
    correctionRequests,
    notifications,
  });
}

async function verifyAnalyticsData() {
  const expectedGroups = await prisma.checklistSection.count({
    where: { form: { status: "published" } },
  });

  const missingGroupScores = await prisma.$queryRaw<Array<{ count: bigint }>>`
    select count(*)::bigint as count
    from audits a
    where a."submittedAt" is not null
      and (
        select count(*)
        from group_scores gs
        where gs."auditId" = a.id
      ) <> ${expectedGroups}
  `;

  const actionPlanItemMismatch = await prisma.$queryRaw<Array<{ count: bigint }>>`
    select count(*)::bigint as count
    from action_plans ap
    where (
      select count(*)
      from action_plan_items api
      where api."actionPlanId" = ap.id
    ) <> (
      select count(*)
      from violations v
      where v."auditId" = ap."auditId"
    )
  `;

  const riskScoreMismatch = await prisma.audit.count({
    where: {
      isRiskTriggered: true,
      OR: [
        { finalScore: { not: 0 } },
        { grade: { not: "alarm" } },
      ],
    },
  });

  console.table({
    expectedGroups,
    missingGroupScores: Number(missingGroupScores[0]?.count ?? 0),
    actionPlanItemMismatch: Number(actionPlanItemMismatch[0]?.count ?? 0),
    riskScoreMismatch,
  });
}

async function main() {
  console.log(`Analytics seed mode: ${mode}`);
  console.log(`Targets: stores=${targetStores}, qc=${targetQc}, months=${months}`);

  if (mode === "normalize-master") {
    await ensureBrands();
    await normalizeVietnameseMasterData();
    await normalizeDemoEvidenceRecords();
    await printCounts();
    console.log("Analytics master data normalized.");
    return;
  }

  if (mode === "reset-qaqc-analytics") {
    await resetQaqcAnalytics();
  }

  await buildAnalyticsDataset();
  await ensureDemoEvidenceAssets();
  await printCounts();
  await verifyAnalyticsData();
  console.log("Analytics seed completed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
