-- CreateTable
CREATE TABLE "AssistantDigest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "weekKey" TEXT NOT NULL,
    "statsJson" TEXT NOT NULL DEFAULT '{}',
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "AssistantDigest_companyId_weekKey_key" ON "AssistantDigest"("companyId", "weekKey");
