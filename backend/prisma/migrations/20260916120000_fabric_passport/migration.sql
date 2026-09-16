-- CreateTable
CREATE TABLE "ProductComposition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "fiber" TEXT NOT NULL,
    "percent" REAL NOT NULL,
    CONSTRAINT "ProductComposition_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductYarn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT '',
    "count" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "ply" INTEGER NOT NULL DEFAULT 1,
    "yarnType" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "ProductYarn_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductCertificate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "number" TEXT NOT NULL DEFAULT '',
    "validUntil" DATETIME,
    "imageUrl" TEXT,
    CONSTRAINT "ProductCertificate_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductTestReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "result" TEXT NOT NULL DEFAULT '',
    "testedAt" DATETIME,
    "imageUrl" TEXT,
    CONSTRAINT "ProductTestReport_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductFieldMeta" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "source" TEXT NOT NULL,
    "confirmedAt" DATETIME,
    CONSTRAINT "ProductFieldMeta_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subtype" TEXT NOT NULL DEFAULT '',
    "usages" TEXT NOT NULL DEFAULT '[]',
    "stock" REAL NOT NULL,
    "stockUnit" TEXT NOT NULL DEFAULT 'm',
    "weightGsm" REAL NOT NULL,
    "widthCm" REAL NOT NULL,
    "content" TEXT NOT NULL,
    "useArea" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT,
    "widthType" TEXT NOT NULL DEFAULT '',
    "moq" REAL,
    "moqUnit" TEXT NOT NULL DEFAULT '',
    "leadTimeDays" INTEGER,
    "priceValue" REAL,
    "priceCurrency" TEXT NOT NULL DEFAULT '',
    "priceUnit" TEXT NOT NULL DEFAULT '',
    "finishTags" TEXT NOT NULL DEFAULT '[]',
    "passportUpdatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Product_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("code", "companyId", "content", "createdAt", "id", "imageUrl", "stock", "stockUnit", "subtype", "type", "usages", "useArea", "weightGsm", "widthCm") SELECT "code", "companyId", "content", "createdAt", "id", "imageUrl", "stock", "stockUnit", "subtype", "type", "usages", "useArea", "weightGsm", "widthCm" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ProductComposition_fiber_percent_idx" ON "ProductComposition"("fiber", "percent");

-- CreateIndex
CREATE UNIQUE INDEX "ProductComposition_productId_position_key" ON "ProductComposition"("productId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ProductYarn_productId_position_key" ON "ProductYarn"("productId", "position");

-- CreateIndex
CREATE INDEX "ProductCertificate_name_idx" ON "ProductCertificate"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCertificate_productId_position_key" ON "ProductCertificate"("productId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ProductTestReport_productId_position_key" ON "ProductTestReport"("productId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ProductFieldMeta_productId_field_key" ON "ProductFieldMeta"("productId", "field");
