-- Add room scan fields to tests table
ALTER TABLE "tests" ADD COLUMN IF NOT EXISTS "roomScanEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tests" ADD COLUMN IF NOT EXISTS "roomScanIntervalMins" INTEGER NOT NULL DEFAULT 20;

-- Create room scan trigger enum
DO $$ BEGIN
  CREATE TYPE "RoomScanTrigger" AS ENUM ('PRE_TEST', 'MID_TEST');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create room_scans table
CREATE TABLE IF NOT EXISTS "room_scans" (
  "id"        TEXT NOT NULL,
  "url"       TEXT NOT NULL,
  "trigger"   "RoomScanTrigger" NOT NULL,
  "duration"  INTEGER,
  "fileSize"  INTEGER,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "sessionId" TEXT NOT NULL,
  CONSTRAINT "room_scans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "room_scans_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "room_scans_sessionId_idx" ON "room_scans"("sessionId");
