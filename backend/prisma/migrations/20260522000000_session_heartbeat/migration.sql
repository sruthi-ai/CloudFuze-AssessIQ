-- Add heartbeat tracking to sessions for server-side integrity
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "lastHeartbeatAt" TIMESTAMPTZ;
