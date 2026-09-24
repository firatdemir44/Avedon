-- CreateTable
CREATE TABLE "FxRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "forexSelling" REAL NOT NULL,
    "forexBuying" REAL NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "FxRate_code_date_idx" ON "FxRate"("code", "date");

-- CreateIndex
CREATE UNIQUE INDEX "FxRate_date_code_key" ON "FxRate"("date", "code");
