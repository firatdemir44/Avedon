-- AlterTable
ALTER TABLE "Company" ADD COLUMN "publicPostBlockedUntil" DATETIME;

-- AlterTable
ALTER TABLE "Post" ADD COLUMN "hiddenAt" DATETIME;

-- CreateTable
CREATE TABLE "PostReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reporterCompanyId" TEXT,
    "authorCompanyId" TEXT,
    "reason" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME
);

-- CreateTable
CREATE TABLE "FeedMute" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "PostReport_authorCompanyId_createdAt_idx" ON "PostReport"("authorCompanyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PostReport_postId_reporterId_key" ON "PostReport"("postId", "reporterId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedMute_userId_companyId_key" ON "FeedMute"("userId", "companyId");
