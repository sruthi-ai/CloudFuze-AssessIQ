-- Screen snapshots table (periodic screenshots captured from candidate's shared screen)
CREATE TABLE "screen_snapshots" (
    "id"         TEXT NOT NULL,
    "url"        TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionId"  TEXT NOT NULL,
    CONSTRAINT "screen_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "screen_snapshots_sessionId_idx" ON "screen_snapshots"("sessionId");

ALTER TABLE "screen_snapshots" ADD CONSTRAINT "screen_snapshots_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add IDENTITY_MISMATCH to ProctoringEventType enum
ALTER TYPE "ProctoringEventType" ADD VALUE IF NOT EXISTS 'IDENTITY_MISMATCH';
