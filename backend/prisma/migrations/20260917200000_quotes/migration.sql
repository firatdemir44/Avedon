-- CreateTable
CREATE TABLE "QuoteRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "buyerId" TEXT NOT NULL,
    "buyerCompanyId" TEXT,
    "sellerCompanyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "targetDate" DATETIME,
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QuoteRequest_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QuoteRequest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "sellerUserId" TEXT NOT NULL,
    "priceValue" REAL,
    "priceCurrency" TEXT NOT NULL DEFAULT '',
    "priceUnit" TEXT NOT NULL DEFAULT '',
    "moq" REAL,
    "moqUnit" TEXT NOT NULL DEFAULT '',
    "leadTimeDays" INTEGER,
    "validUntil" DATETIME,
    "paymentTerms" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Quote_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "QuoteRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Quote_sellerUserId_fkey" FOREIGN KEY ("sellerUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "QuoteRequest_buyerId_createdAt_idx" ON "QuoteRequest"("buyerId", "createdAt");

-- CreateIndex
CREATE INDEX "QuoteRequest_sellerCompanyId_status_createdAt_idx" ON "QuoteRequest"("sellerCompanyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Quote_requestId_createdAt_idx" ON "Quote"("requestId", "createdAt");
