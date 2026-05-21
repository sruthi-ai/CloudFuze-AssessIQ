-- Add question_order column to sessions for storing per-session shuffled question IDs
ALTER TABLE "sessions" ADD COLUMN "question_order" JSONB;
