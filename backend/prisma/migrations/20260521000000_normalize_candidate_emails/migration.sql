-- Normalize all candidate emails to lowercase to prevent case-sensitivity duplicates.
-- For each group of (lower(email), tenantId) duplicates: keep the oldest record,
-- re-point all invitations and sessions to it, then delete the extras.

-- Step 1: re-point invitations from duplicate candidates to the canonical one
UPDATE invitations i
SET "candidateId" = canonical.id
FROM (
  SELECT DISTINCT ON (lower(c.email), c."tenantId")
    c.id,
    lower(c.email) AS lower_email,
    c."tenantId"
  FROM candidates c
  ORDER BY lower(c.email), c."tenantId", c."createdAt" ASC
) AS canonical
JOIN candidates dup
  ON lower(dup.email) = canonical.lower_email
  AND dup."tenantId" = canonical."tenantId"
  AND dup.id <> canonical.id
WHERE i."candidateId" = dup.id;

-- Step 2: re-point sessions from duplicate candidates to the canonical one
UPDATE sessions s
SET "candidateId" = canonical.id
FROM (
  SELECT DISTINCT ON (lower(c.email), c."tenantId")
    c.id,
    lower(c.email) AS lower_email,
    c."tenantId"
  FROM candidates c
  ORDER BY lower(c.email), c."tenantId", c."createdAt" ASC
) AS canonical
JOIN candidates dup
  ON lower(dup.email) = canonical.lower_email
  AND dup."tenantId" = canonical."tenantId"
  AND dup.id <> canonical.id
WHERE s."candidateId" = dup.id;

-- Step 3: delete duplicate candidates (all but oldest per lower(email)+tenantId)
DELETE FROM candidates
WHERE id IN (
  SELECT dup.id
  FROM candidates dup
  WHERE EXISTS (
    SELECT 1 FROM candidates canonical
    WHERE lower(canonical.email) = lower(dup.email)
      AND canonical."tenantId" = dup."tenantId"
      AND canonical.id <> dup.id
      AND canonical."createdAt" <= dup."createdAt"
  )
);

-- Step 4: lowercase all email addresses
UPDATE candidates SET email = lower(email) WHERE email <> lower(email);
