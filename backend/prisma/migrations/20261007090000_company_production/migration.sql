-- CreateTable
CREATE TABLE "CompanyProduction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "productGroups" TEXT NOT NULL DEFAULT '[]',
    "mainGroups" TEXT NOT NULL DEFAULT '[]',
    "groupsOther" TEXT NOT NULL DEFAULT '',
    "workMode" TEXT NOT NULL DEFAULT '',
    "monthlyCapacity" INTEGER,
    "capacityByGroup" TEXT NOT NULL DEFAULT '{}',
    "moqPerModel" INTEGER,
    "moqPerColor" INTEGER,
    "sampleLeadDays" INTEGER,
    "productionLeadDays" INTEGER,
    "services" TEXT NOT NULL DEFAULT '[]',
    "operations" TEXT NOT NULL DEFAULT '[]',
    "fabricMode" TEXT NOT NULL DEFAULT '',
    "certificates" TEXT NOT NULL DEFAULT '[]',
    "exportCountries" TEXT NOT NULL DEFAULT '[]',
    "employeeRange" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CompanyProduction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductionReference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "caption" TEXT NOT NULL DEFAULT '',
    "clientName" TEXT NOT NULL DEFAULT '',
    "showClient" BOOLEAN NOT NULL DEFAULT false,
    "permissionConfirmed" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductionReference_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyProduction_companyId_key" ON "CompanyProduction"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionReference_companyId_position_key" ON "ProductionReference"("companyId", "position");

