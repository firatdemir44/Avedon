-- CreateTable
CREATE TABLE "TexartJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "productId" TEXT,
    "createdById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'kuyrukta',
    "originalName" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "outputsJson" TEXT NOT NULL DEFAULT '{}',
    "metricsJson" TEXT NOT NULL DEFAULT '{}',
    "warningsJson" TEXT NOT NULL DEFAULT '[]',
    "logJson" TEXT NOT NULL DEFAULT '[]',
    "error" TEXT,
    "decision" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "TexartJob_status_createdAt_idx" ON "TexartJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TexartJob_companyId_createdAt_idx" ON "TexartJob"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "TexartJob_productId_idx" ON "TexartJob"("productId");
