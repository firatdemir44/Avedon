-- AlterTable
ALTER TABLE "QuoteRequest" ADD COLUMN "rfqId" TEXT;

-- CreateTable
CREATE TABLE "Rfq" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "buyerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "targetDate" DATETIME,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Rfq_buyerId_createdAt_idx" ON "Rfq"("buyerId", "createdAt");

-- CreateIndex
CREATE INDEX "QuoteRequest_rfqId_idx" ON "QuoteRequest"("rfqId");
