-- CreateTable
CREATE TABLE "WhatsAppInbound" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT NOT NULL,
    "fromPhone" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "body" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'received',
    "replyBody" TEXT NOT NULL DEFAULT '',
    "error" TEXT NOT NULL DEFAULT '',
    "userId" TEXT,
    "threadId" TEXT,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME,
    CONSTRAINT "WhatsAppInbound_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppInbound_messageId_key" ON "WhatsAppInbound"("messageId");

-- CreateIndex
CREATE INDEX "WhatsAppInbound_fromPhone_receivedAt_idx" ON "WhatsAppInbound"("fromPhone", "receivedAt");
