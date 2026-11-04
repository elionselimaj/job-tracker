-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "source" TEXT,
    "appliedAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPLIED',
    "manuallyMoved" BOOLEAN NOT NULL DEFAULT false,
    "gmailThreadId" TEXT,
    "lastEmailAt" DATETIME,
    "notes" TEXT NOT NULL DEFAULT ''
);

-- CreateTable
CREATE TABLE "ProcessedEmail" (
    "messageId" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "receivedAt" DATETIME NOT NULL,
    "classification" TEXT NOT NULL,
    "company" TEXT,
    "role" TEXT,
    "outcome" TEXT NOT NULL,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "applicationId" TEXT,
    CONSTRAINT "ProcessedEmail_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GmailAccount" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "email" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "lastSyncAt" DATETIME
);

-- CreateIndex
CREATE INDEX "Application_gmailThreadId_idx" ON "Application"("gmailThreadId");

-- CreateIndex
CREATE INDEX "ProcessedEmail_outcome_reviewed_idx" ON "ProcessedEmail"("outcome", "reviewed");
