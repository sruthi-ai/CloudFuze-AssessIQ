/**
 * Idempotent, NON-DESTRUCTIVE content bootstrap — run automatically by
 * entrypoint.sh on every backend start (after migrate + seed).
 *
 * Ensures the standalone aptitude tests exist. It CREATES a test only if it's
 * missing; it never rebuilds, wipes, or re-publishes one that already exists —
 * so it's safe to run on every deploy, even mid-batch with live sessions.
 * (For a deliberate rebuild/reconfigure, use create-apti.ts manually.)
 *
 * Requires the "Freshers Assessment 1" bank (with the 100 "Aptitude Q…"
 * questions) to already exist. If it doesn't (e.g. a brand-new empty DB), each
 * ensure step logs and skips instead of failing — the backend still starts.
 */
import { PrismaClient, TestStatus } from '@prisma/client'
const prisma = new PrismaClient()

const BANK_NAME = process.env.BOOTSTRAP_BANK_NAME || 'Freshers Assessment 1'

// The aptitude tests we guarantee exist. Add rows here to have more auto-created.
const APTITUDE_TESTS = [
  { title: 'Apti',           poolSize: 20, durationMin: 20 },
  { title: 'Aptitude Set 2', poolSize: 40, durationMin: 40 },
]

async function ensureAptitudeTest(opts: { title: string; poolSize: number; durationMin: number }) {
  const existing = await prisma.test.findFirst({ where: { title: opts.title } })
  if (existing) {
    console.log(`  ✓ "${opts.title}" already exists (status=${existing.status}) — leaving untouched`)
    return
  }

  const bank = await prisma.questionBank.findFirst({ where: { name: BANK_NAME } })
  if (!bank) {
    console.log(`  ⚠ bank "${BANK_NAME}" not found — cannot create "${opts.title}" yet; skipping`)
    return
  }
  const admin = await prisma.user.findFirst({
    where: { tenantId: bank.tenantId, role: { in: ['SUPER_ADMIN', 'COMPANY_ADMIN'] } },
    orderBy: { createdAt: 'asc' },
  })
  if (!admin) {
    console.log(`  ⚠ no admin user for the bank tenant — skipping "${opts.title}"`)
    return
  }
  const questions = await prisma.question.findMany({
    where: { bankId: bank.id, title: { startsWith: 'Aptitude Q' } },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  if (questions.length < opts.poolSize) {
    console.log(`  ⚠ only ${questions.length} aptitude questions (< pool ${opts.poolSize}) — skipping "${opts.title}"`)
    return
  }

  const instructions = `Aptitude test — ${questions.length} questions in the bank; you will be given a random selection of ${opts.poolSize} to answer, ${opts.durationMin} minutes, 1 mark each. Choose the best option.`

  // Created PUBLISHED + ready to invite (the point of auto-bootstrap is zero
  // manual steps). Snapshot-only proctoring, no SEB, no violation enforcement —
  // matches the current "smooth, screenshots-only" assessment policy. Toggle any
  // of these per-test in the admin UI afterwards if needed.
  const test = await prisma.test.create({
    data: {
      title: opts.title, domain: 'Aptitude', duration: opts.durationMin,
      status: TestStatus.PUBLISHED, proctoring: true, enforceViolations: false, sebRequired: false,
      tenantId: bank.tenantId, createdById: admin.id, instructions,
    },
  })
  const section = await prisma.testSection.create({
    data: {
      testId: test.id, title: 'Aptitude', skill: 'GENERAL', order: 0,
      timeLimit: opts.durationMin * 60, pickCount: opts.poolSize,
      description: `${opts.poolSize} questions (randomly drawn from a bank of ${questions.length}) covering quantitative ability, logical reasoning and data interpretation. 1 mark each.`,
    },
  })
  await prisma.testQuestion.createMany({
    data: questions.map((q, i) => ({ testId: test.id, sectionId: section.id, questionId: q.id, order: i, points: 1 })),
  })
  console.log(`  ✅ created "${opts.title}" (PUBLISHED): pool ${opts.poolSize} of ${questions.length}, ${opts.durationMin} min`)
}

async function main() {
  console.log('→ Content bootstrap (create-if-missing)...')
  for (const t of APTITUDE_TESTS) {
    try { await ensureAptitudeTest(t) }
    catch (e) { console.error(`  ⚠ bootstrap step for "${t.title}" failed (non-fatal):`, e) }
  }
  console.log('→ Content bootstrap done.')
}

main()
  .catch(e => console.error('content bootstrap failed (non-fatal):', e))
  .finally(() => prisma.$disconnect())
