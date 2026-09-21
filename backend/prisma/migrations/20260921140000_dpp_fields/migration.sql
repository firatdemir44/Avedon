-- Faz 3 Adım 7: DPP hazırlık alanları. Prisma tabloyu yeniden kurmak istedi; canlı veride
-- güvenli olsun diye yalnızca sütun ekleniyor (sonuç şema aynı).
ALTER TABLE "Product" ADD COLUMN "originCountry" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Product" ADD COLUMN "careNotes" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Product" ADD COLUMN "recycledPercent" REAL;
