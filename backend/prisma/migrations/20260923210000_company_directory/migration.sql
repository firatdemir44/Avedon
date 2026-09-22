-- Firma rehberi: mevcut tablolara yalnızca sütun eklenir (yeniden kurulmaz).
ALTER TABLE "Company" ADD COLUMN "claimed" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Company" ADD COLUMN "source" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Company" ADD COLUMN "categoryTags" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Company" ADD COLUMN "normalizedName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "VerificationRequest" ADD COLUMN "claim" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Company_companyType_idx" ON "Company"("companyType");
CREATE INDEX "Company_normalizedName_idx" ON "Company"("normalizedName");
