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
    "logoUpdatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Company" ("about", "companyCode", "contactEmail", "contactPhone", "createdAt", "id", "logoUpdatedAt", "name", "productCategories", "taxId", "verification") SELECT "about", "companyCode", "contactEmail", "contactPhone", "createdAt", "id", "logoUpdatedAt", "name", "productCategories", "taxId", "verification" FROM "Company";
DROP TABLE "Company";
ALTER TABLE "new_Company" RENAME TO "Company";
CREATE UNIQUE INDEX "Company_companyCode_key" ON "Company"("companyCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
