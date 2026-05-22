-- Add attempt tracking to invitations
ALTER TABLE "invitations"
  ADD COLUMN IF NOT EXISTS "attemptNumber"     INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "previousAttempts"  JSONB;
