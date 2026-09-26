-- CreateTable
CREATE TABLE "Collaboration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supplierCompanyId" TEXT NOT NULL,
    "apparelCompanyId" TEXT NOT NULL,
    "productId" TEXT,
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "supplierChoice" TEXT NOT NULL DEFAULT 'bekliyor',
    "apparelChoice" TEXT NOT NULL DEFAULT 'bekliyor',
    "supplierChoiceAt" DATETIME,
    "apparelChoiceAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CollaborationEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "collaborationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromChoice" TEXT NOT NULL,
    "toChoice" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CollaborationEvent_collaborationId_fkey" FOREIGN KEY ("collaborationId") REFERENCES "Collaboration" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Collaboration_supplierCompanyId_idx" ON "Collaboration"("supplierCompanyId");

-- CreateIndex
CREATE INDEX "Collaboration_apparelCompanyId_idx" ON "Collaboration"("apparelCompanyId");

-- CreateIndex
CREATE INDEX "Collaboration_productId_idx" ON "Collaboration"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Collaboration_source_sourceId_key" ON "Collaboration"("source", "sourceId");

-- CreateIndex
CREATE INDEX "CollaborationEvent_collaborationId_createdAt_idx" ON "CollaborationEvent"("collaborationId", "createdAt");

