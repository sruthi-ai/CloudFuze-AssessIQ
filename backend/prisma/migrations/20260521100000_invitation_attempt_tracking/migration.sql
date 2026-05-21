-- Add attempt tracking to invitations
-- attemptNumber: which attempt this is (starts at 1, max 3)
-- previousAttempts: JSON array of completed attempt summaries

ALTER TABLE "invitations"
  ADD COLUMN "attempt_number"     INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "previous_attempts"  JSONB;
