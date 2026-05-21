#!/bin/sh
set -e

echo "→ Running database migrations..."
npx prisma migrate deploy

echo "→ Seeding database (skipped if data already exists)..."
npx tsx prisma/seed.ts 2>/dev/null || true

echo "→ Starting AssessIQ backend..."
exec node dist/server.js
