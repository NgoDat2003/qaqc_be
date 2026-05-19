-- AlterTable
ALTER TABLE "action_plans" ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT;

-- AlterTable
ALTER TABLE "evidences" ADD COLUMN     "actionPlanItemId" TEXT;

-- CreateTable
CREATE TABLE "action_plan_items" (
    "id" TEXT NOT NULL,
    "actionPlanId" TEXT NOT NULL,
    "violationId" TEXT NOT NULL,
    "rootCause" TEXT,
    "remediation" TEXT,
    "fixedAt" TIMESTAMP(3),
    "assigneeName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "action_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_correction_requests" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_correction_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "action_plan_items_actionPlanId_idx" ON "action_plan_items"("actionPlanId");

-- CreateIndex
CREATE INDEX "action_plan_items_violationId_idx" ON "action_plan_items"("violationId");

-- CreateIndex
CREATE INDEX "action_plan_items_status_idx" ON "action_plan_items"("status");

-- CreateIndex
CREATE UNIQUE INDEX "action_plan_items_actionPlanId_violationId_key" ON "action_plan_items"("actionPlanId", "violationId");

-- CreateIndex
CREATE INDEX "audit_correction_requests_auditId_idx" ON "audit_correction_requests"("auditId");

-- CreateIndex
CREATE INDEX "audit_correction_requests_storeId_idx" ON "audit_correction_requests"("storeId");

-- CreateIndex
CREATE INDEX "audit_correction_requests_requestedById_idx" ON "audit_correction_requests"("requestedById");

-- CreateIndex
CREATE INDEX "audit_correction_requests_reviewedById_idx" ON "audit_correction_requests"("reviewedById");

-- CreateIndex
CREATE INDEX "audit_correction_requests_status_idx" ON "audit_correction_requests"("status");

-- CreateIndex
CREATE INDEX "evidences_actionPlanItemId_idx" ON "evidences"("actionPlanItemId");

-- AddForeignKey
ALTER TABLE "evidences" ADD CONSTRAINT "evidences_actionPlanItemId_fkey" FOREIGN KEY ("actionPlanItemId") REFERENCES "action_plan_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_plans" ADD CONSTRAINT "action_plans_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_plan_items" ADD CONSTRAINT "action_plan_items_actionPlanId_fkey" FOREIGN KEY ("actionPlanId") REFERENCES "action_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_plan_items" ADD CONSTRAINT "action_plan_items_violationId_fkey" FOREIGN KEY ("violationId") REFERENCES "violations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_correction_requests" ADD CONSTRAINT "audit_correction_requests_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_correction_requests" ADD CONSTRAINT "audit_correction_requests_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_correction_requests" ADD CONSTRAINT "audit_correction_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_correction_requests" ADD CONSTRAINT "audit_correction_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
