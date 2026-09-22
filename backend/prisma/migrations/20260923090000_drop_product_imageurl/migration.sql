-- Product.imageUrl: tek fotoğraf döneminin sütunu. 20260915180000 migration'ı değerleri
-- ProductImage (sıra 0) tablosuna kopyaladı; o günden beri okunmuyor ve yazılmıyor.
-- Emniyet: kopyası olmayan bir kayıt kaldıysa önce kopyalanır, sonra sütun düşürülür
-- (tablo yeniden kurulmaz; SQLite 3.35+ DROP COLUMN).
INSERT INTO "ProductImage" ("id", "productId", "position", "imageUrl", "createdAt")
SELECT lower(hex(randomblob(16))), p."id", 0, p."imageUrl", p."createdAt"
FROM "Product" p
WHERE p."imageUrl" IS NOT NULL AND p."imageUrl" <> ''
  AND NOT EXISTS (SELECT 1 FROM "ProductImage" i WHERE i."productId" = p."id" AND i."position" = 0);

ALTER TABLE "Product" DROP COLUMN "imageUrl";
