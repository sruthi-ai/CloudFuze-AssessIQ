/**
 * Put a test into advisory proctoring mode (or back). Advisory = camera/monitoring
 * still records, but nothing is flagged or penalised as a violation: no on-screen
 * warnings, no auto-disqualify, shown as "Monitoring only" in results.
 * Answer audio recording is unaffected.
 *
 *   docker exec -e TEST_TITLE="Communication Assessment" -e ENFORCE=off \
 *     -w /app neutaraassessment-backend-1 npx tsx prisma/set-advisory.ts
 *
 * Env: TEST_TITLE (default "Communication Assessment"), ENFORCE ("off"|"on", default "off").
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const title = process.env.TEST_TITLE || 'Communication Assessment'
  const enforce = (process.env.ENFORCE || 'off').toLowerCase() === 'on'

  const res = await prisma.test.updateMany({ where: { title }, data: { enforceViolations: enforce } })
  if (res.count === 0) throw new Error(`No test titled "${title}" found.`)
  console.log(`✅ violation enforcement ${enforce ? 'ON' : 'OFF (advisory)'} for ${res.count} test(s) titled "${title}".`)
}

main().catch(e => { console.error('❌ set-advisory failed:', e); process.exit(1) }).finally(() => prisma.$disconnect())
