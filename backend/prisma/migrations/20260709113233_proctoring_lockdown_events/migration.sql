-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProctoringEventType" ADD VALUE 'SECURE_BROWSER_QUIT';
ALTER TYPE "ProctoringEventType" ADD VALUE 'NAVIGATION_BLOCKED';
ALTER TYPE "ProctoringEventType" ADD VALUE 'SHORTCUT_BLOCKED';
ALTER TYPE "ProctoringEventType" ADD VALUE 'MULTIPLE_MONITORS';
ALTER TYPE "ProctoringEventType" ADD VALUE 'SUSPICIOUS_PROCESS';
