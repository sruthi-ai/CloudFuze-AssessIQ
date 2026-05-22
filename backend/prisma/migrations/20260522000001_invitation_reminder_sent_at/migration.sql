-- Add reminderSentAt to track when 24h expiry reminders were sent
ALTER TABLE "invitations" ADD COLUMN IF NOT EXISTS "reminderSentAt" TIMESTAMPTZ;
