-- CreateTable
CREATE TABLE "Machine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "kindKey" TEXT NOT NULL,
    "brand" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "year" INTEGER,
    "diameterInch" REAL,
    "gauge" REAL,
    "feeders" INTEGER,
    "needles" INTEGER,
    "workingWidthCm" REAL,
    "feature" TEXT NOT NULL DEFAULT '',
    "count" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Machine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "companyCode" TEXT NOT NULL,
    "monthlyCapacityTons" REAL,
    "capacityNote" TEXT NOT NULL DEFAULT '',
    "contractOpen" BOOLEAN NOT NULL DEFAULT false,
    "capacityUpdatedAt" DATETIME,
    "logoUpdatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Company" ("about", "address", "city", "companyCode", "companyType", "contactEmail", "contactPhone", "createdAt", "district", "foundedYear", "id", "logoUpdatedAt", "mainMarkets", "name", "productCategories", "taxId", "verification", "website") SELECT "about", "address", "city", "companyCode", "companyType", "contactEmail", "contactPhone", "createdAt", "district", "foundedYear", "id", "logoUpdatedAt", "mainMarkets", "name", "productCategories", "taxId", "verification", "website" FROM "Company";
DROP TABLE "Company";
ALTER TABLE "new_Company" RENAME TO "Company";
CREATE UNIQUE INDEX "Company_companyCode_key" ON "Company"("companyCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Machine_companyId_position_idx" ON "Machine"("companyId", "position");

-- CreateIndex
CREATE INDEX "Machine_group_kindKey_idx" ON "Machine"("group", "kindKey");

-- CreateIndex
CREATE INDEX "Machine_gauge_diameterInch_idx" ON "Machine"("gauge", "diameterInch");
