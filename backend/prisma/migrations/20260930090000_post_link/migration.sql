-- Gönderiye paylaşılan bağlantı (önizleme kartı). Yalnızca sütun ekler.
ALTER TABLE "Post" ADD COLUMN "linkUrl" TEXT;
ALTER TABLE "Post" ADD COLUMN "linkTitle" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Post" ADD COLUMN "linkDescription" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Post" ADD COLUMN "linkSiteName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Post" ADD COLUMN "linkImage" TEXT;
