-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "stock" REAL NOT NULL,
    "weightGsm" REAL NOT NULL,
    "widthCm" REAL NOT NULL,
    "content" TEXT NOT NULL,
    "useArea" TEXT NOT NULL,
    "imageUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Product_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("code", "companyId", "content", "createdAt", "id", "imageUrl", "stock", "type", "useArea", "weightGsm", "widthCm") SELECT "code", "companyId", "content", "createdAt", "id", "imageUrl", "stock", "type", "useArea", "weightGsm", "widthCm" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
