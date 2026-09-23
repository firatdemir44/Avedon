-- AlterTable
ALTER TABLE "Machine" ADD COLUMN "dailyCapacityKg" REAL;
ALTER TABLE "Machine" ADD COLUMN "busyUntil" DATETIME;
ALTER TABLE "Machine" ADD COLUMN "availabilityUpdatedAt" DATETIME;
