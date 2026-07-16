/**
 * One-off content fix: JAM questions were seeded with a 30s preparation time —
 * changed to 10s per product decision. Idempotent (only touches rows still at
 * 30s), safe to re-run.
 *
 *   docker exec -w /app neutaraassessment-backend-1 npx tsx prisma/fix-jam-prep-time.ts
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const result = await prisma.question.updateMany({
    where: { title: { startsWith: 'JAM' }, prepSeconds: 30 },
    data: { prepSeconds: 10 },
  })
  console.log(`✅ Updated ${result.count} JAM question(s): prepSeconds 30 -> 10`)
}

main().catch(e => { console.error('❌ fix-jam-prep-time failed:', e); process.exit(1) }).finally(() => prisma.$disconnect())
