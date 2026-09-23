-- Açık talep ekleri; VideoLink'e yalnızca sütun eklenir.
ALTER TABLE "VideoLink" ADD COLUMN "tenderId" TEXT;
CREATE INDEX "VideoLink_tenderId_idx" ON "VideoLink"("tenderId");

-- CreateTable
CREATE TABLE "TenderMedia" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenderId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dataUrl" TEXT NOT NULL,
    "caption" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "TenderMedia_tenderId_position_idx" ON "TenderMedia"("tenderId", "position");
