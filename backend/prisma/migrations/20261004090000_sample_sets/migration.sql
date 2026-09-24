-- CreateTable
CREATE TABLE "SampleSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "itemsJson" TEXT NOT NULL DEFAULT '[]',
    "summary" TEXT NOT NULL DEFAULT '',
    "lang" TEXT NOT NULL DEFAULT 'tr',
    "shareToken" TEXT,
    "status" TEXT NOT NULL DEFAULT 'taslak',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SampleSet_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SampleSet_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "BuyerCompany" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SampleSet_shareToken_key" ON "SampleSet"("shareToken");

-- CreateIndex
CREATE INDEX "SampleSet_companyId_buyerId_idx" ON "SampleSet"("companyId", "buyerId");
