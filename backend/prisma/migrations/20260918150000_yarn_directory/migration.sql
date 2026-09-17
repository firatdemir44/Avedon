-- CreateTable
CREATE TABLE "YarnSpec" (
    "productId" TEXT NOT NULL PRIMARY KEY,
    "family" TEXT NOT NULL,
    "count" REAL NOT NULL,
    "countUnit" TEXT NOT NULL,
    "ply" INTEGER NOT NULL DEFAULT 1,
    "countDtex" REAL NOT NULL,
    "filaments" INTEGER,
    "spinning" TEXT NOT NULL DEFAULT '',
    "combing" TEXT NOT NULL DEFAULT '',
    "filamentType" TEXT NOT NULL DEFAULT '',
    "luster" TEXT NOT NULL DEFAULT '',
    "twistDirection" TEXT NOT NULL DEFAULT '',
    "twistTpm" REAL,
    "endUses" TEXT NOT NULL DEFAULT '[]',
    "colorState" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT '',
    "variety" TEXT NOT NULL DEFAULT '',
    "origin" TEXT NOT NULL DEFAULT '',
    "brand" TEXT NOT NULL DEFAULT '',
    "coneWeightKg" REAL,
    "sellerRole" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "YarnSpec_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "YarnSpec_family_idx" ON "YarnSpec"("family");

-- CreateIndex
CREATE INDEX "YarnSpec_countDtex_idx" ON "YarnSpec"("countDtex");
