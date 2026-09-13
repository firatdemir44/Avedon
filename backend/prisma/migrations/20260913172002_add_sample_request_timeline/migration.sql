-- CreateTable
CREATE TABLE "SampleRequestEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sampleRequestId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SampleRequestEvent_sampleRequestId_fkey" FOREIGN KEY ("sampleRequestId") REFERENCES "SampleRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SampleRequestEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SampleRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "deliveryMode" TEXT NOT NULL DEFAULT 'seller_ships',
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'talep_edildi',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveryPreference" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "SampleRequest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SampleRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SampleRequest" ("createdAt", "deliveryPreference", "id", "productId", "requesterId", "status") SELECT "createdAt", "deliveryPreference", "id", "productId", "requesterId", "status" FROM "SampleRequest";
DROP TABLE "SampleRequest";
ALTER TABLE "new_SampleRequest" RENAME TO "SampleRequest";
CREATE INDEX "SampleRequest_productId_idx" ON "SampleRequest"("productId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "SampleRequestEvent_sampleRequestId_createdAt_idx" ON "SampleRequestEvent"("sampleRequestId", "createdAt");

-- Mevcut talepler için sentetik ilk adım: zaman çizelgesi boş kalmasın.
-- (id olarak cuid üretemiyoruz; bu kayıtlar istemciye anahtar olarak gitmiyor.)
INSERT INTO "SampleRequestEvent" ("id","sampleRequestId","status","actorId","note","createdAt")
SELECT lower(hex(randomblob(16))), "id", 'talep_edildi', "requesterId", '', "createdAt"
FROM "SampleRequest";

-- Eski serbest metin teslimat tercihi yeni "note" alanına taşınıyor.
UPDATE "SampleRequest" SET "note" = "deliveryPreference" WHERE "note" = '';
