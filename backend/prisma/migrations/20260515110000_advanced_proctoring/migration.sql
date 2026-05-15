-- Add HEAD_TURNED and SCREEN_RECORDING_STOPPED to ProctoringEventType enum
ALTER TYPE "ProctoringEventType" ADD VALUE IF NOT EXISTS 'HEAD_TURNED';
ALTER TYPE "ProctoringEventType" ADD VALUE IF NOT EXISTS 'SCREEN_RECORDING_STOPPED';

-- CreateTable: webcam_snapshots
CREATE TABLE "webcam_snapshots" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionId" TEXT NOT NULL,
    CONSTRAINT "webcam_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable: screen_recordings
CREATE TABLE "screen_recordings" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "duration" INTEGER,
    "fileSize" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionId" TEXT NOT NULL,
    CONSTRAINT "screen_recordings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "screen_recordings_sessionId_key" UNIQUE ("sessionId")
);

-- CreateIndex
CREATE INDEX "webcam_snapshots_sessionId_idx" ON "webcam_snapshots"("sessionId");

-- AddForeignKey
ALTER TABLE "webcam_snapshots" ADD CONSTRAINT "webcam_snapshots_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screen_recordings" ADD CONSTRAINT "screen_recordings_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
