-- Bakım sembolleri. Prisma tabloyu yeniden kurmak ister; canlı veride güvenli olsun diye yalnızca sütun ekleniyor.
ALTER TABLE "Product" ADD COLUMN "careSymbols" TEXT NOT NULL DEFAULT '[]';
