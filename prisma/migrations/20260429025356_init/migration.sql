-- CreateTable
CREATE TABLE "brands" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "stores" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "modelType" TEXT NOT NULL DEFAULT 'standard',
    "brandId" TEXT NOT NULL,
    "region" TEXT,
    "province" TEXT,
    "district" TEXT,
    "ward" TEXT,
    "address" TEXT,
    "amId" TEXT,
    "managerId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "stores_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stores_amId_fkey" FOREIGN KEY ("amId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stores_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "password" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "role_assignments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "roleKey" TEXT NOT NULL,
    "storeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "role_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "criteria_groups" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weight" REAL NOT NULL,
    "color" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "criteria" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "deductionPerError" REAL NOT NULL DEFAULT 1.0,
    "maxDeduction" REAL NOT NULL DEFAULT 5.0,
    "flag" TEXT NOT NULL DEFAULT 'none',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "criteria_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "criteria_groups" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "checklist_forms" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "checklist_sections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "formId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "checklist_sections_formId_fkey" FOREIGN KEY ("formId") REFERENCES "checklist_forms" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "checklist_sections_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "criteria_groups" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "checklist_section_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sectionId" TEXT NOT NULL,
    "criteriaId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "checklist_section_items_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "checklist_sections" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "checklist_section_items_criteriaId_fkey" FOREIGN KEY ("criteriaId") REFERENCES "criteria" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_plans" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'adhoc',
    "scope" TEXT NOT NULL DEFAULT 'company',
    "formId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "audit_plans_formId_fkey" FOREIGN KEY ("formId") REFERENCES "checklist_forms" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_assignments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "auditorId" TEXT NOT NULL,
    "scheduledDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "auditId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "audit_assignments_planId_fkey" FOREIGN KEY ("planId") REFERENCES "audit_plans" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "audit_assignments_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "audit_assignments_auditorId_fkey" FOREIGN KEY ("auditorId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "audit_assignments_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "audits" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audits" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "formId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "auditorId" TEXT NOT NULL,
    "finalScore" REAL NOT NULL DEFAULT 100.0,
    "grade" TEXT NOT NULL DEFAULT 'excellent',
    "isRiskTriggered" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" DATETIME,
    "editedAt" DATETIME,
    "editNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "audits_formId_fkey" FOREIGN KEY ("formId") REFERENCES "checklist_forms" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "audits_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "group_scores" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auditId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "groupCode" TEXT NOT NULL,
    "weight" REAL NOT NULL,
    "maxScore" REAL NOT NULL,
    "reachedScore" REAL NOT NULL,
    "percentage" REAL NOT NULL,
    "triggeredCritical" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "group_scores_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "audits" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "violations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auditId" TEXT NOT NULL,
    "criteriaId" TEXT NOT NULL,
    "numErrors" INTEGER NOT NULL DEFAULT 0,
    "repeatCount" INTEGER NOT NULL DEFAULT 1,
    "isCriticalTriggered" BOOLEAN NOT NULL DEFAULT false,
    "isRiskTriggered" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "violations_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "audits" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "violations_criteriaId_fkey" FOREIGN KEY ("criteriaId") REFERENCES "criteria" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "evidences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "violationId" TEXT,
    "actionPlanId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "evidences_violationId_fkey" FOREIGN KEY ("violationId") REFERENCES "violations" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "evidences_actionPlanId_fkey" FOREIGN KEY ("actionPlanId") REFERENCES "action_plans" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "action_plans" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auditId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "remediation" TEXT,
    "deadline" DATETIME,
    "closedById" TEXT,
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "action_plans_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "audits" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "action_plans_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "action_plans_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'info',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "link" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "brands_code_key" ON "brands"("code");

-- CreateIndex
CREATE UNIQUE INDEX "brands_name_key" ON "brands"("name");

-- CreateIndex
CREATE UNIQUE INDEX "stores_code_key" ON "stores"("code");

-- CreateIndex
CREATE INDEX "stores_brandId_idx" ON "stores"("brandId");

-- CreateIndex
CREATE INDEX "stores_amId_idx" ON "stores"("amId");

-- CreateIndex
CREATE INDEX "stores_managerId_idx" ON "stores"("managerId");

-- CreateIndex
CREATE INDEX "stores_isActive_idx" ON "stores"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_isActive_idx" ON "users"("isActive");

-- CreateIndex
CREATE INDEX "role_assignments_userId_idx" ON "role_assignments"("userId");

-- CreateIndex
CREATE INDEX "role_assignments_roleKey_idx" ON "role_assignments"("roleKey");

-- CreateIndex
CREATE UNIQUE INDEX "role_assignments_userId_roleKey_key" ON "role_assignments"("userId", "roleKey");

-- CreateIndex
CREATE UNIQUE INDEX "criteria_groups_code_key" ON "criteria_groups"("code");

-- CreateIndex
CREATE UNIQUE INDEX "criteria_code_key" ON "criteria"("code");

-- CreateIndex
CREATE INDEX "criteria_groupId_idx" ON "criteria"("groupId");

-- CreateIndex
CREATE INDEX "criteria_flag_idx" ON "criteria"("flag");

-- CreateIndex
CREATE INDEX "criteria_isActive_idx" ON "criteria"("isActive");

-- CreateIndex
CREATE INDEX "checklist_forms_status_idx" ON "checklist_forms"("status");

-- CreateIndex
CREATE INDEX "checklist_sections_formId_idx" ON "checklist_sections"("formId");

-- CreateIndex
CREATE INDEX "checklist_sections_groupId_idx" ON "checklist_sections"("groupId");

-- CreateIndex
CREATE INDEX "checklist_section_items_sectionId_idx" ON "checklist_section_items"("sectionId");

-- CreateIndex
CREATE INDEX "checklist_section_items_criteriaId_idx" ON "checklist_section_items"("criteriaId");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_section_items_sectionId_criteriaId_key" ON "checklist_section_items"("sectionId", "criteriaId");

-- CreateIndex
CREATE INDEX "audit_plans_status_idx" ON "audit_plans"("status");

-- CreateIndex
CREATE INDEX "audit_plans_formId_idx" ON "audit_plans"("formId");

-- CreateIndex
CREATE UNIQUE INDEX "audit_assignments_auditId_key" ON "audit_assignments"("auditId");

-- CreateIndex
CREATE INDEX "audit_assignments_planId_idx" ON "audit_assignments"("planId");

-- CreateIndex
CREATE INDEX "audit_assignments_storeId_idx" ON "audit_assignments"("storeId");

-- CreateIndex
CREATE INDEX "audit_assignments_auditorId_idx" ON "audit_assignments"("auditorId");

-- CreateIndex
CREATE INDEX "audit_assignments_status_idx" ON "audit_assignments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "audit_assignments_planId_storeId_key" ON "audit_assignments"("planId", "storeId");

-- CreateIndex
CREATE INDEX "audits_storeId_idx" ON "audits"("storeId");

-- CreateIndex
CREATE INDEX "audits_auditorId_idx" ON "audits"("auditorId");

-- CreateIndex
CREATE INDEX "audits_grade_idx" ON "audits"("grade");

-- CreateIndex
CREATE INDEX "audits_submittedAt_idx" ON "audits"("submittedAt");

-- CreateIndex
CREATE INDEX "group_scores_auditId_idx" ON "group_scores"("auditId");

-- CreateIndex
CREATE UNIQUE INDEX "group_scores_auditId_groupId_key" ON "group_scores"("auditId", "groupId");

-- CreateIndex
CREATE INDEX "violations_auditId_idx" ON "violations"("auditId");

-- CreateIndex
CREATE INDEX "violations_criteriaId_idx" ON "violations"("criteriaId");

-- CreateIndex
CREATE INDEX "evidences_violationId_idx" ON "evidences"("violationId");

-- CreateIndex
CREATE INDEX "evidences_actionPlanId_idx" ON "evidences"("actionPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "action_plans_auditId_key" ON "action_plans"("auditId");

-- CreateIndex
CREATE INDEX "action_plans_storeId_idx" ON "action_plans"("storeId");

-- CreateIndex
CREATE INDEX "action_plans_status_idx" ON "action_plans"("status");

-- CreateIndex
CREATE INDEX "action_plans_deadline_idx" ON "action_plans"("deadline");

-- CreateIndex
CREATE INDEX "notifications_userId_idx" ON "notifications"("userId");

-- CreateIndex
CREATE INDEX "notifications_isRead_idx" ON "notifications"("isRead");
