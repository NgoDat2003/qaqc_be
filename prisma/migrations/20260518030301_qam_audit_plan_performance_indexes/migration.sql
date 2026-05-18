-- CreateIndex
CREATE INDEX "audit_assignments_planId_createdAt_idx" ON "audit_assignments"("planId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_assignments_auditorId_createdAt_idx" ON "audit_assignments"("auditorId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_plans_createdAt_idx" ON "audit_plans"("createdAt");
