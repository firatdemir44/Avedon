-- Makine parkı tablosu alanları (yalnızca ekleme; mevcut veri korunur).
ALTER TABLE "Machine" ADD COLUMN "machineNo" INTEGER;
ALTER TABLE "Machine" ADD COLUMN "gaugeText" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Machine" ADD COLUMN "needlesText" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Machine" ADD COLUMN "fabricType" TEXT NOT NULL DEFAULT '';
