-- CreateTable
CREATE TABLE "CompanyReference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromCompanyId" TEXT NOT NULL,
    "toCompanyId" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" DATETIME,
    CONSTRAINT "CompanyReference_fromCompanyId_fkey" FOREIGN KEY ("fromCompanyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CompanyReference_toCompanyId_fkey" FOREIGN KEY ("toCompanyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "taxId" TEXT NOT NULL,
    "about" TEXT NOT NULL DEFAULT '',
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "contactPhone" TEXT NOT NULL DEFAULT '',
    "productCategories" TEXT NOT NULL DEFAULT '',
    "companyType" TEXT NOT NULL DEFAULT '',
    "foundedYear" INTEGER,
    "website" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "district" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "mainMarkets" TEXT NOT NULL DEFAULT '',
    "verification" TEXT NOT NULL DEFAULT 'dogrulanmamis',
    "verificationLevel" TEXT NOT NULL DEFAULT '',
    "verifiedAt" DATETIME,
    "companyCode" TEXT NOT NULL,
    "monthlyCapacityTons" REAL,
    "capacityNote" TEXT NOT NULL DEFAULT '',
    "contractOpen" BOOLEAN NOT NULL DEFAULT false,
    "capacityUpdatedAt" DATETIME,
    "logoUpdatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Company" ("about", "address", "capacityNote", "capacityUpdatedAt", "city", "companyCode", "companyType", "contactEmail", "contactPhone", "contractOpen", "createdAt", "district", "foundedYear", "id", "logoUpdatedAt", "mainMarkets", "monthlyCapacityTons", "name", "productCategories", "taxId", "verification", "website") SELECT "about", "address", "capacityNote", "capacityUpdatedAt", "city", "companyCode", "companyType", "contactEmail", "contactPhone", "contractOpen", "createdAt", "district", "foundedYear", "id", "logoUpdatedAt", "mainMarkets", "monthlyCapacityTons", "name", "productCategories", "taxId", "verification", "website" FROM "Company";
DROP TABLE "Company";
ALTER TABLE "new_Company" RENAME TO "Company";
CREATE UNIQUE INDEX "Company_companyCode_key" ON "Company"("companyCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CompanyReference_toCompanyId_status_idx" ON "CompanyReference"("toCompanyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyReference_fromCompanyId_toCompanyId_relation_key" ON "CompanyReference"("fromCompanyId", "toCompanyId", "relation");
