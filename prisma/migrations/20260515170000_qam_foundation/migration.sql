-- AlterTable
ALTER TABLE "criteria_groups" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "checklist_sections" ADD COLUMN     "weight" DOUBLE PRECISION NOT NULL DEFAULT 0;
