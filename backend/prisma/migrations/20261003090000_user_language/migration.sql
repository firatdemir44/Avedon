-- Arayüz dili (yalnızca ekleme; mevcut veri korunur).
ALTER TABLE "User" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'tr';
