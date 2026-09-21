-- CreateTable
CREATE TABLE "ProductLook" (
    "productId" TEXT NOT NULL PRIMARY KEY,
    "lookJson" TEXT NOT NULL,
    "imageHash" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductLook_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LookSearch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "LookSearch_userId_createdAt_idx" ON "LookSearch"("userId", "createdAt");
