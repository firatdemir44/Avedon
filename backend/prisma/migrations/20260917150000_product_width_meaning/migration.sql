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
    "widthMeaning" TEXT NOT NULL DEFAULT '',
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
INSERT INTO "new_Product" ("code", "companyId", "content", "createdAt", "finishTags", "id", "imageUrl", "leadTimeDays", "moq", "moqUnit", "passportUpdatedAt", "priceCurrency", "priceUnit", "priceValue", "stock", "stockUnit", "subtype", "type", "usages", "useArea", "weightGsm", "widthCm", "widthType") SELECT "code", "companyId", "content", "createdAt", "finishTags", "id", "imageUrl", "leadTimeDays", "moq", "moqUnit", "passportUpdatedAt", "priceCurrency", "priceUnit", "priceValue", "stock", "stockUnit", "subtype", "type", "usages", "useArea", "weightGsm", "widthCm", "widthType" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
