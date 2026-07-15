#!/bin/sh
set -e

echo "→ Running database migrations..."
npx prisma migrate deploy

echo "→ Seeding database (idempotent; demo tenant/admin via upsert)..."
if npx tsx prisma/seed.ts; then
  echo "✔ Seed step complete"
else
  echo "⚠️  SEED STEP FAILED — see the error above. The DB may be empty and login may not work until it is seeded (run: npx tsx prisma/seed.ts). Starting backend anyway so an already-seeded DB is not taken offline." >&2
fi

echo "→ Ensuring standalone tests exist (idempotent; create-if-missing, non-destructive)..."
if npx tsx prisma/bootstrap-content.ts; then
  echo "✔ Content bootstrap complete"
else
  echo "⚠️  CONTENT BOOTSTRAP FAILED — see the error above (non-fatal). Backend starting anyway." >&2
fi

echo "→ Starting AssessIQ backend..."
exec node dist/server.js
