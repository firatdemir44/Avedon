-- AlterTable
ALTER TABLE "AssistantThread" ADD COLUMN "targetCompanyId" TEXT;

-- CreateTable
CREATE TABLE "CompanyFaq" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CompanyFaq_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CompanyQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "askerId" TEXT NOT NULL,
    "threadId" TEXT,
    "productId" TEXT,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" DATETIME,
    CONSTRAINT "CompanyQuestion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CompanyQuestion_askerId_fkey" FOREIGN KEY ("askerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CompanyFaq_companyId_idx" ON "CompanyFaq"("companyId");

-- CreateIndex
CREATE INDEX "CompanyQuestion_companyId_status_createdAt_idx" ON "CompanyQuestion"("companyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CompanyQuestion_askerId_createdAt_idx" ON "CompanyQuestion"("askerId", "createdAt");
