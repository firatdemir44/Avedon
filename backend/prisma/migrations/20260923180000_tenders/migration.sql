-- Post.tenderId: yalnızca sütun eklenir (tablo yeniden kurulmaz).
ALTER TABLE "Post" ADD COLUMN "tenderId" TEXT;

-- CreateTable
CREATE TABLE "Tender" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "buyerId" TEXT NOT NULL,
    "buyerCompanyId" TEXT,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "specJson" TEXT NOT NULL DEFAULT '{}',
    "quantity" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "targetDate" DATETIME,
    "deadline" DATETIME,
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "awardedOfferId" TEXT,
    "postId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TenderOffer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenderId" TEXT NOT NULL,
    "sellerUserId" TEXT NOT NULL,
    "sellerCompanyId" TEXT NOT NULL,
    "priceValue" REAL NOT NULL,
    "priceCurrency" TEXT NOT NULL,
    "priceUnit" TEXT NOT NULL,
    "moq" REAL,
    "moqUnit" TEXT NOT NULL DEFAULT '',
    "leadTimeDays" INTEGER,
    "validUntil" DATETIME,
    "paymentTerms" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'sent',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Tender_status_category_createdAt_idx" ON "Tender"("status", "category", "createdAt");
CREATE INDEX "Tender_buyerId_createdAt_idx" ON "Tender"("buyerId", "createdAt");
CREATE UNIQUE INDEX "TenderOffer_tenderId_sellerCompanyId_key" ON "TenderOffer"("tenderId", "sellerCompanyId");
CREATE INDEX "TenderOffer_tenderId_createdAt_idx" ON "TenderOffer"("tenderId", "createdAt");
CREATE INDEX "TenderOffer_sellerCompanyId_createdAt_idx" ON "TenderOffer"("sellerCompanyId", "createdAt");
