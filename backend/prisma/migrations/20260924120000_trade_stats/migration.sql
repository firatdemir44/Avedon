-- CreateTable
CREATE TABLE "TradeStat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reporter" INTEGER NOT NULL,
    "hs6" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "json" TEXT NOT NULL DEFAULT '',
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "TradeStat_reporter_hs6_year_key" ON "TradeStat"("reporter", "hs6", "year");
