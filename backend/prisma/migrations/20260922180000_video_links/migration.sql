-- CreateTable
CREATE TABLE "VideoLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "videoId" TEXT NOT NULL,
    "productId" TEXT,
    "messageId" TEXT,
    "conversationId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "VideoLink_videoId_key" ON "VideoLink"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "VideoLink_messageId_key" ON "VideoLink"("messageId");

-- CreateIndex
CREATE INDEX "VideoLink_productId_sortOrder_idx" ON "VideoLink"("productId", "sortOrder");

-- CreateIndex
CREATE INDEX "VideoLink_conversationId_idx" ON "VideoLink"("conversationId");
