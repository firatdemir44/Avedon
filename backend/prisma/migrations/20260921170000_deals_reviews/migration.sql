-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quoteRequestId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "buyerCompanyId" TEXT,
    "sellerCompanyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "agreedDeliveryDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'acik',
    "sellerDeliveredAt" DATETIME,
    "buyerConfirmedAt" DATETIME,
    "disputeNote" TEXT NOT NULL DEFAULT '',
    "cancelledByRole" TEXT NOT NULL DEFAULT '',
    "cancelReason" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DealReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dealId" TEXT NOT NULL,
    "authorRole" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "targetCompanyId" TEXT,
    "quality" INTEGER,
    "timing" INTEGER,
    "communication" INTEGER NOT NULL,
    "seriousness" INTEGER,
    "comment" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DealReview_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Deal_quoteRequestId_key" ON "Deal"("quoteRequestId");

-- CreateIndex
CREATE INDEX "Deal_buyerId_createdAt_idx" ON "Deal"("buyerId", "createdAt");

-- CreateIndex
CREATE INDEX "Deal_sellerCompanyId_createdAt_idx" ON "Deal"("sellerCompanyId", "createdAt");

-- CreateIndex
CREATE INDEX "Deal_buyerCompanyId_idx" ON "Deal"("buyerCompanyId");

-- CreateIndex
CREATE INDEX "DealReview_targetCompanyId_idx" ON "DealReview"("targetCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "DealReview_dealId_authorRole_key" ON "DealReview"("dealId", "authorRole");
