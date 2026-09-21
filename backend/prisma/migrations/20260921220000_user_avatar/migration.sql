-- Kişisel profil fotoğrafı. User tablosu yeniden kurulmasın diye sütun elle ekleniyor.
CREATE TABLE "UserAvatar" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "imageUrl" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserAvatar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "User" ADD COLUMN "avatarUpdatedAt" DATETIME;
