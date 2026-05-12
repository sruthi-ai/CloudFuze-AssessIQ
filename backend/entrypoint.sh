#!/bin/sh
set -e

echo "→ Running database migrations..."
# Resolve any stuck migration (safe no-op if already clean)
npx prisma migrate resolve --rolled-back 20260509000000_init 2>/dev/null || true
npx prisma migrate deploy

echo "→ Seeding database (skipped if data already exists)..."
npx tsx prisma/seed.ts 2>/dev/null || true

echo "→ Starting AssessIQ backend..."
exec node dist/server.js
