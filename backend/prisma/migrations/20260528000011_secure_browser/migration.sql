-- Add requireSecureBrowser to tests
ALTER TABLE "tests" ADD COLUMN "requireSecureBrowser" BOOLEAN NOT NULL DEFAULT false;

-- Add secureBrowserUsed to sessions
ALTER TABLE "sessions" ADD COLUMN "secureBrowserUsed" BOOLEAN NOT NULL DEFAULT false;

-- Extend ProctoringEventType enum
ALTER TYPE "ProctoringEventType" ADD VALUE IF NOT EXISTS 'SECURE_BROWSER_BYPASSED';
