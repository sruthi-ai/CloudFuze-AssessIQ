-- AlterEnum
ALTER TYPE "ProctoringEventType" ADD VALUE 'POOR_LIGHTING';

-- AlterEnum
ALTER TYPE "SessionStatus" ADD VALUE 'DISQUALIFIED';

-- DropForeignKey
ALTER TABLE "room_scans" DROP CONSTRAINT "room_scans_sessionId_fkey";

-- DropIndex
DROP INDEX "sessions_testId_submittedAt_idx";

-- AlterTable
ALTER TABLE "invitations" ALTER COLUMN "reminderSentAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "room_scans" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "sessions" ALTER COLUMN "lastHeartbeatAt" SET DATA TYPE TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "sessions_testId_submittedAt_idx" ON "sessions"("testId", "submittedAt");

-- AddForeignKey
ALTER TABLE "room_scans" ADD CONSTRAINT "room_scans_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
