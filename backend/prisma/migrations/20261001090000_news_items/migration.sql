-- CreateTable
CREATE TABLE "NewsItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "guid" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "lang" TEXT NOT NULL,
    "topicsJson" TEXT NOT NULL DEFAULT '[]',
    "publishedAt" DATETIME NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "NewsItem_publishedAt_idx" ON "NewsItem"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "NewsItem_source_guid_key" ON "NewsItem"("source", "guid");
