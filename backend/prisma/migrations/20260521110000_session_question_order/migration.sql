-- Add questionOrder column to sessions for storing per-session shuffled question IDs
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "questionOrder" JSONB;
