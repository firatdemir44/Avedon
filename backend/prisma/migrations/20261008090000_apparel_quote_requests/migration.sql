-- CreateTable
CREATE TABLE "ApparelQuoteRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "buyerId" TEXT NOT NULL,
    "buyerCompanyId" TEXT,
    "targetCompanyId" TEXT NOT NULL,
    "productGroup" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "targetDate" DATETIME,
    "fabricMode" TEXT NOT NULL,
    "fabricProductId" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'gonderildi',
    "conversationId" TEXT,
    "repliedById" TEXT,
    "repliedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
-- CreateTable
CREATE TABLE "ApparelQuoteAttachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dataUrl" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- CreateIndex
CREATE INDEX "ApparelQuoteRequest_targetCompanyId_createdAt_idx" ON "ApparelQuoteRequest"("targetCompanyId", "createdAt");
-- CreateIndex
CREATE INDEX "ApparelQuoteRequest_buyerId_createdAt_idx" ON "ApparelQuoteRequest"("buyerId", "createdAt");
-- CreateIndex
CREATE INDEX "ApparelQuoteRequest_conversationId_idx" ON "ApparelQuoteRequest"("conversationId");
-- CreateIndex
CREATE INDEX "ApparelQuoteAttachment_requestId_position_idx" ON "ApparelQuoteAttachment"("requestId", "position");
