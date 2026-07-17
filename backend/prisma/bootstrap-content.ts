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
import { INFRA_BANK_NAME, INFRA_QUESTIONS } from './create-infrastructure-assessment'
import { SEO_BANK_NAME, SEO_QUESTIONS } from './create-marketing-seo-assessment'
import { main as ensureListeningPassagePool } from './add-listening-passage-pool'
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

// Create-if-missing for a domain question bank (e.g. Infra, SEO) — additive only,
// never touches a question that already exists.
async function ensureDomainQuestions(
  bankName: string, tenantId: string, titlePrefix: string, domain: string,
  bank_questions: { body: string; options: string[]; correct: number }[],
) {
  let bank = await prisma.questionBank.findFirst({ where: { name: bankName, tenantId } })
  if (!bank) bank = await prisma.questionBank.create({ data: { name: bankName, tenantId, description: `${domain} MCQ pool (auto-bootstrapped)` } })
  for (let i = 0; i < bank_questions.length; i++) {
    const title = `${titlePrefix} Q${i + 1}`
    if (await prisma.question.findFirst({ where: { bankId: bank.id, title } })) continue
    const q = bank_questions[i]
    await prisma.question.create({
      data: {
        bankId: bank.id, type: 'MCQ_SINGLE', title, body: q.body, difficulty: 'MEDIUM', points: 1, domain,
        options: { create: q.options.map((text, idx) => ({ text, isCorrect: idx === q.correct, order: idx })) },
      },
    })
  }
  return bank
}

// Two-pool test (Aptitude + a domain pool), e.g. Infrastructure/Marketing SEO
// Assessment. Same create-only-if-missing contract as ensureAptitudeTest — never
// rebuilds an existing test (use the standalone create-*-assessment.ts script for
// a deliberate manual rebuild/reconfigure instead).
async function ensurePooledTest(opts: {
  title: string; domain: string; aptiPoolSize: number; domainPoolSize: number; sectionMin: number
  domainSectionTitle: string; domainBankName: string; domainTitlePrefix: string
  domainQuestions: { body: string; options: string[]; correct: number }[]
}) {
  const existing = await prisma.test.findFirst({ where: { title: opts.title } })
  if (existing) {
    console.log(`  ✓ "${opts.title}" already exists (status=${existing.status}) — leaving untouched`)
    return
  }

  const aptiBank = await prisma.questionBank.findFirst({ where: { name: BANK_NAME } })
  if (!aptiBank) {
    console.log(`  ⚠ bank "${BANK_NAME}" not found — cannot create "${opts.title}" yet; skipping`)
    return
  }
  const admin = await prisma.user.findFirst({
    where: { tenantId: aptiBank.tenantId, role: { in: ['SUPER_ADMIN', 'COMPANY_ADMIN'] } },
    orderBy: { createdAt: 'asc' },
  })
  if (!admin) {
    console.log(`  ⚠ no admin user for the bank tenant — skipping "${opts.title}"`)
    return
  }
  const aptiQuestions = await prisma.question.findMany({
    where: { bankId: aptiBank.id, title: { startsWith: 'Aptitude Q' } },
    orderBy: { createdAt: 'asc' }, select: { id: true },
  })
  if (aptiQuestions.length < opts.aptiPoolSize) {
    console.log(`  ⚠ only ${aptiQuestions.length} aptitude questions (< pool ${opts.aptiPoolSize}) — skipping "${opts.title}"`)
    return
  }

  const domainBank = await ensureDomainQuestions(opts.domainBankName, aptiBank.tenantId, opts.domainTitlePrefix, opts.domain, opts.domainQuestions)
  const domainQuestions = await prisma.question.findMany({
    where: { bankId: domainBank.id, title: { startsWith: `${opts.domainTitlePrefix} Q` } },
    orderBy: { createdAt: 'asc' }, select: { id: true },
  })
  if (domainQuestions.length < opts.domainPoolSize) {
    console.log(`  ⚠ only ${domainQuestions.length} ${opts.domain} questions (< pool ${opts.domainPoolSize}) — skipping "${opts.title}"`)
    return
  }

  const totalMin = opts.sectionMin * 2
  const instructions = `${opts.title} — ${totalMin} minutes, ${opts.aptiPoolSize + opts.domainPoolSize} questions, 1 mark each. ` +
    `Section 1 (Aptitude): a random ${opts.aptiPoolSize} of ${aptiQuestions.length}, ${opts.sectionMin} minutes. ` +
    `Section 2 (${opts.domainSectionTitle}): a random ${opts.domainPoolSize} of ${domainQuestions.length}, ${opts.sectionMin} minutes. Choose the best option.`

  const test = await prisma.test.create({
    data: {
      title: opts.title, domain: opts.domain, duration: totalMin,
      status: TestStatus.PUBLISHED, proctoring: true, enforceViolations: false, sebRequired: false,
      tenantId: aptiBank.tenantId, createdById: admin.id, instructions,
    },
  })
  const aptiSection = await prisma.testSection.create({
    data: { testId: test.id, title: 'Aptitude', skill: 'GENERAL', order: 0, timeLimit: opts.sectionMin * 60, pickCount: opts.aptiPoolSize,
      description: `${opts.aptiPoolSize} questions (randomly drawn from a bank of ${aptiQuestions.length}) covering quantitative ability, logical reasoning and data interpretation. 1 mark each.` },
  })
  await prisma.testQuestion.createMany({
    data: aptiQuestions.map((q, i) => ({ testId: test.id, sectionId: aptiSection.id, questionId: q.id, order: i, points: 1 })),
  })
  const domainSection = await prisma.testSection.create({
    data: { testId: test.id, title: opts.domainSectionTitle, skill: 'GENERAL', order: 1, timeLimit: opts.sectionMin * 60, pickCount: opts.domainPoolSize,
      description: `${opts.domainPoolSize} questions (randomly drawn from a bank of ${domainQuestions.length}) covering ${opts.domain}. 1 mark each.` },
  })
  await prisma.testQuestion.createMany({
    data: domainQuestions.map((q, i) => ({ testId: test.id, sectionId: domainSection.id, questionId: q.id, order: i, points: 1 })),
  })
  console.log(`  ✅ created "${opts.title}" (PUBLISHED): Aptitude ${opts.aptiPoolSize}/${aptiQuestions.length} + ${opts.domainSectionTitle} ${opts.domainPoolSize}/${domainQuestions.length}, ${totalMin} min`)
}

async function main() {
  console.log('→ Content bootstrap (create-if-missing)...')
  for (const t of APTITUDE_TESTS) {
    try { await ensureAptitudeTest(t) }
    catch (e) { console.error(`  ⚠ bootstrap step for "${t.title}" failed (non-fatal):`, e) }
  }

  try {
    await ensurePooledTest({
      title: 'Infrastructure Assessment', domain: 'Infrastructure', aptiPoolSize: 20, domainPoolSize: 20, sectionMin: 20,
      domainSectionTitle: 'Infrastructure', domainBankName: INFRA_BANK_NAME, domainTitlePrefix: 'Infra', domainQuestions: INFRA_QUESTIONS,
    })
  } catch (e) { console.error('  ⚠ bootstrap step for "Infrastructure Assessment" failed (non-fatal):', e) }

  try {
    await ensurePooledTest({
      title: 'Marketing SEO Assessment', domain: 'Marketing', aptiPoolSize: 20, domainPoolSize: 20, sectionMin: 20,
      domainSectionTitle: 'SEO & Marketing', domainBankName: SEO_BANK_NAME, domainTitlePrefix: 'SEO', domainQuestions: SEO_QUESTIONS,
    })
  } catch (e) { console.error('  ⚠ bootstrap step for "Marketing SEO Assessment" failed (non-fatal):', e) }

  try {
    console.log('  → Listening passage pool (Listen & Answer)...')
    await ensureListeningPassagePool()
  } catch (e) { console.error('  ⚠ listening passage pool step failed (non-fatal):', e) }

  console.log('→ Content bootstrap done.')
}

main()
  .catch(e => console.error('content bootstrap failed (non-fatal):', e))
  .finally(() => prisma.$disconnect())
