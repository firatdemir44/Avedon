-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductFavorite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductFavorite_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductView" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "viewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductView_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Product_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("code", "companyId", "content", "createdAt", "id", "imageUrl", "stock", "type", "useArea", "weightGsm", "widthCm") SELECT "code", "companyId", "content", "createdAt", "id", "imageUrl", "stock", "type", "useArea", "weightGsm", "widthCm" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ProductImage_productId_position_key" ON "ProductImage"("productId", "position");

-- CreateIndex
CREATE INDEX "ProductFavorite_userId_createdAt_idx" ON "ProductFavorite"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductFavorite_userId_productId_key" ON "ProductFavorite"("userId", "productId");

-- CreateIndex
CREATE INDEX "ProductView_userId_viewedAt_idx" ON "ProductView"("userId", "viewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductView_userId_productId_key" ON "ProductView"("userId", "productId");

-- Veri taşıma: tek fotoğraf dönemindeki ürün fotoğrafları galeriye kapak
-- (sıra 0) olarak kopyalanıyor. Product.imageUrl silinmiyor (geri dönüş
-- güvencesi); ayrı bir temizlik migration'ında kaldırılacak.
INSERT INTO "ProductImage" ("id", "productId", "position", "imageUrl", "createdAt")
SELECT lower(hex(randomblob(16))), "id", 0, "imageUrl", "createdAt"
FROM "Product"
WHERE "imageUrl" IS NOT NULL AND "imageUrl" <> '';
