-- CreateTable
CREATE TABLE "BuyerCompany" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL DEFAULT '',
    "countryIso2" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "industryCode" TEXT NOT NULL DEFAULT '',
    "segment" TEXT NOT NULL DEFAULT 'diger',
    "sizeCode" TEXT NOT NULL DEFAULT '',
    "sizeLabel" TEXT NOT NULL DEFAULT '',
    "revenueEur" REAL,
    "foundedYear" INTEGER,
    "sourceUpdatedAt" DATETIME,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw" TEXT NOT NULL DEFAULT ''
);

-- CreateTable
CREATE TABLE "BuyerSync" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "countryIso2" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "count" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT NOT NULL DEFAULT '',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME
);

-- CreateTable
CREATE TABLE "BuyerLead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'yeni',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BuyerLead_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BuyerLead_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "BuyerCompany" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "BuyerCompany_countryIso2_segment_idx" ON "BuyerCompany"("countryIso2", "segment");

-- CreateIndex
CREATE UNIQUE INDEX "BuyerCompany_source_sourceId_key" ON "BuyerCompany"("source", "sourceId");

-- CreateIndex
CREATE INDEX "BuyerSync_source_countryIso2_key_idx" ON "BuyerSync"("source", "countryIso2", "key");

-- CreateIndex
CREATE INDEX "BuyerLead_companyId_status_idx" ON "BuyerLead"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BuyerLead_companyId_buyerId_key" ON "BuyerLead"("companyId", "buyerId");
