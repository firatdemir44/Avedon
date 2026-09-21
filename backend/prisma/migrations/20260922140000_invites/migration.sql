-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "inviterCompanyId" TEXT,
    "inviteeName" TEXT NOT NULL DEFAULT '',
    "inviteePhone" TEXT NOT NULL DEFAULT '',
    "relation" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "joinCount" INTEGER NOT NULL DEFAULT 0,
    "joinedUserId" TEXT,
    "joinedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Invite_code_key" ON "Invite"("code");

-- CreateIndex
CREATE INDEX "Invite_inviterId_createdAt_idx" ON "Invite"("inviterId", "createdAt");

-- CreateIndex
CREATE INDEX "Invite_inviteePhone_idx" ON "Invite"("inviteePhone");
