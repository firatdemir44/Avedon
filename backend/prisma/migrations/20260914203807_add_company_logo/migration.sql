-- AlterTable
ALTER TABLE "Company" ADD COLUMN "logoUpdatedAt" DATETIME;

-- CreateTable
CREATE TABLE "CompanyLogo" (
    "companyId" TEXT NOT NULL PRIMARY KEY,
    "imageUrl" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CompanyLogo_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
