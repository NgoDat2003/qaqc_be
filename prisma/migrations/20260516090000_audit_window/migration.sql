-- Add audit window at plan level. Defaults keep the ALTER safe for existing rows.
ALTER TABLE "audit_plans"
ADD COLUMN "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "endDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill existing plans from their assignment dates where available.
UPDATE "audit_plans" p
SET
  "startDate" = COALESCE(assignment_dates."startDate", p."createdAt"),
  "endDate" = COALESCE(assignment_dates."endDate", p."createdAt")
FROM (
  SELECT
    "planId",
    MIN("scheduledDate") AS "startDate",
    MAX("scheduledDate") AS "endDate"
  FROM "audit_assignments"
  WHERE "scheduledDate" IS NOT NULL
  GROUP BY "planId"
) assignment_dates
WHERE p."id" = assignment_dates."planId";

-- Plans without assignments use createdAt as their one-day audit window.
UPDATE "audit_plans"
SET
  "startDate" = "createdAt",
  "endDate" = "createdAt"
WHERE NOT EXISTS (
  SELECT 1
  FROM "audit_assignments"
  WHERE "audit_assignments"."planId" = "audit_plans"."id"
);

ALTER TABLE "audit_assignments" ALTER COLUMN "scheduledDate" DROP NOT NULL;

CREATE INDEX "audit_plans_startDate_endDate_idx" ON "audit_plans"("startDate", "endDate");
