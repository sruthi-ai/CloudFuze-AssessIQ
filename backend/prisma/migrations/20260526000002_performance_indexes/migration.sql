-- Session indexes: results list, live monitor, candidate detail
CREATE INDEX IF NOT EXISTS "sessions_testId_submittedAt_idx" ON "sessions"("testId", "submittedAt" DESC);
CREATE INDEX IF NOT EXISTS "sessions_testId_status_idx"      ON "sessions"("testId", "status");
CREATE INDEX IF NOT EXISTS "sessions_candidateId_idx"        ON "sessions"("candidateId");

-- Answer index: answer lookup per session
CREATE INDEX IF NOT EXISTS "answers_sessionId_idx" ON "answers"("sessionId");

-- ProctoringEvent: replace single-column index with composite ones
DROP INDEX IF EXISTS "proctoring_events_sessionId_idx";
CREATE INDEX IF NOT EXISTS "proctoring_events_sessionId_occurredAt_idx" ON "proctoring_events"("sessionId", "occurredAt");
CREATE INDEX IF NOT EXISTS "proctoring_events_sessionId_severity_idx"   ON "proctoring_events"("sessionId", "severity");

-- Invitation: per-test list and reminder job
CREATE INDEX IF NOT EXISTS "invitations_testId_status_idx"   ON "invitations"("testId", "status");
CREATE INDEX IF NOT EXISTS "invitations_status_expiresAt_idx" ON "invitations"("status", "expiresAt");
