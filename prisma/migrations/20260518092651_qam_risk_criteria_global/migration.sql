-- DropForeignKey
ALTER TABLE "criteria" DROP CONSTRAINT "criteria_groupId_fkey";

-- AlterTable
ALTER TABLE "criteria" ALTER COLUMN "groupId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "criteria" ADD CONSTRAINT "criteria_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "criteria_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
