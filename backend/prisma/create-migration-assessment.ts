/**
 * Create/rebuild "Migration Assessment": a single 40-question, 40-minute
 * test combining all three migration-engineering banks into one assessment
 * with 3 sections:
 *   - Content Migration: 20 questions (6 process/6 technical/8 flow) from
 *     the 30-question Content Migration bank, 20 minutes.
 *   - Email Migration: 10 questions (3 process/3 technical/4 flow) from
 *     the 25-question Email Migration bank, 10 minutes.
 *   - Message Migration: 10 questions (4 process/3 technical/3 flow) from
 *     the 20-question Message Migration bank, 10 minutes.
 * Each section's draw is category-balanced (stratified pickStrata, scaled
 * down proportionally from each standalone assessment's own draw ratio) —
 * every candidate gets the same process/technical/flow mix per section, not
 * pure random luck. See backend/src/routes/sessions.ts's pickStrata handling.
 *
 * This script does NOT create or own any question content — it assumes
 * create-content-migration-assessment.ts, create-email-migration-assessment.ts,
 * and create-message-migration-assessment.ts have already been run (their
 * question banks must already exist). It only builds a new test + 3 sections
 * that reference those existing banks' questions. It never touches the 3
 * standalone migration assessments, their sections, or their question banks.
 *
 * Idempotent — safe to re-run: the test's sections are cleanly rebuilt each
 * run (deleted + recreated) so pool/strata config stays in sync with this
 * script and with whatever the 3 source banks currently contain.
 *
 *   docker exec -w /app neutaraassessment-backend-1 npx tsx prisma/create-migration-assessment.ts
 *
 * Env overrides: TEST_TITLE (default "Migration Assessment"),
 *                APTITUDE_BANK_NAME (default "Freshers Assessment 1" — used only
 *                to resolve the tenant/admin, not as a question source),
 *                DURATION_MIN (default 40).
 */
import { PrismaClient, TestStatus } from '@prisma/client'
import { CONTENT_MIGRATION_BANK_NAME, CONTENT_MIGRATION_QUESTIONS } from './create-content-migration-assessment'
import { EMAIL_MIGRATION_BANK_NAME, EMAIL_MIGRATION_QUESTIONS } from './create-email-migration-assessment'
import { MESSAGE_MIGRATION_BANK_NAME, MESSAGE_MIGRATION_QUESTIONS } from './create-message-migration-assessment'

const prisma = new PrismaClient()

export async function main() {
  const testTitle = process.env.TEST_TITLE || 'Migration Assessment'
  const aptitudeBankName = process.env.APTITUDE_BANK_NAME || 'Freshers Assessment 1'
  const durationMin = Number(process.env.DURATION_MIN) || 40

  const aptiBank = await prisma.questionBank.findFirst({ where: { name: aptitudeBankName } })
  if (!aptiBank) throw new Error(`Bank "${aptitudeBankName}" not found — needed to resolve tenant/admin.`)
  const tenantId = aptiBank.tenantId

  const admin = await prisma.user.findFirst({
    where: { tenantId, role: { in: ['SUPER_ADMIN', 'COMPANY_ADMIN'] } },
    orderBy: { createdAt: 'asc' },
  })
  if (!admin) throw new Error('No admin user found for the tenant.')

  const contentBank = await prisma.questionBank.findFirst({ where: { name: CONTENT_MIGRATION_BANK_NAME, tenantId } })
  if (!contentBank) throw new Error(`"${CONTENT_MIGRATION_BANK_NAME}" not found — run create-content-migration-assessment.ts first.`)
  const emailBank = await prisma.questionBank.findFirst({ where: { name: EMAIL_MIGRATION_BANK_NAME, tenantId } })
  if (!emailBank) throw new Error(`"${EMAIL_MIGRATION_BANK_NAME}" not found — run create-email-migration-assessment.ts first.`)
  const messageBank = await prisma.questionBank.findFirst({ where: { name: MESSAGE_MIGRATION_BANK_NAME, tenantId } })
  if (!messageBank) throw new Error(`"${MESSAGE_MIGRATION_BANK_NAME}" not found — run create-message-migration-assessment.ts first.`)

  const instructions = `Migration Assessment — ${durationMin} minutes, 40 questions across 3 sections. Content Migration: 20 questions, 20 minutes. Email Migration: 10 questions, 10 minutes. Message Migration: 10 questions, 10 minutes. Each section draws the same process/technical/flow mix for every candidate. 1 mark each. Choose the best option.`

  let test = await prisma.test.findFirst({ where: { title: testTitle, tenantId } })
  if (!test) {
    test = await prisma.test.create({
      data: {
        title: testTitle, domain: 'Migration Engineering', duration: durationMin,
        status: TestStatus.DRAFT, proctoring: true, enforceViolations: false, sebRequired: false,
        tenantId, createdById: admin.id, instructions,
      },
    })
    console.log(`created test "${testTitle}"`)
  } else {
    const secs = await prisma.testSection.findMany({ where: { testId: test.id } })
    for (const s of secs) await prisma.testQuestion.deleteMany({ where: { sectionId: s.id } })
    await prisma.testSection.deleteMany({ where: { testId: test.id } })
    await prisma.test.update({ where: { id: test.id }, data: { duration: durationMin, instructions } })
    console.log(`rebuilt existing test "${testTitle}"`)
  }

  // Only reference questions that are part of the source script's CURRENT
  // pool (matched by its exact title list) — each source bank still holds
  // older, now-orphaned rows from before its own trim-down, and a broad
  // title-prefix match would silently pull those back in.
  async function buildSection(opts: {
    title: string; bankId: string; titlePrefix: string; poolLength: number; order: number
    timeLimitMin: number; process: number; technical: number; flow: number
  }) {
    const expectedTitles = Array.from({ length: opts.poolLength }, (_, i) => `${opts.titlePrefix} Q${i + 1}`)
    const questionsByTitle = new Map(
      (await prisma.question.findMany({ where: { bankId: opts.bankId, title: { in: expectedTitles } }, select: { id: true, title: true } }))
        .map(q => [q.title, q])
    )
    const questions = expectedTitles.map(t => questionsByTitle.get(t)!).filter(Boolean)

    const section = await prisma.testSection.create({
      data: {
        testId: test!.id, title: opts.title, skill: 'GENERAL', order: opts.order, timeLimit: opts.timeLimitMin * 60,
        pickStrata: { process: opts.process, technical: opts.technical, flow: opts.flow },
        description: `${opts.process + opts.technical + opts.flow} questions per candidate — ${opts.process} process, ${opts.technical} technical, ${opts.flow} troubleshooting, drawn from a bank of ${questions.length}. 1 mark each.`,
      },
    })
    await prisma.testQuestion.createMany({
      data: questions.map((q, i) => ({ testId: test!.id, sectionId: section.id, questionId: q.id, order: i, points: 1 })),
    })
    return questions.length
  }

  const contentPoolLen = await buildSection({
    title: 'Content Migration', bankId: contentBank.id, titlePrefix: 'Content Migration', poolLength: CONTENT_MIGRATION_QUESTIONS.length,
    order: 0, timeLimitMin: 20, process: 6, technical: 6, flow: 8,
  })
  const emailPoolLen = await buildSection({
    title: 'Email Migration', bankId: emailBank.id, titlePrefix: 'Email Migration', poolLength: EMAIL_MIGRATION_QUESTIONS.length,
    order: 1, timeLimitMin: 10, process: 3, technical: 3, flow: 4,
  })
  const messagePoolLen = await buildSection({
    title: 'Message Migration', bankId: messageBank.id, titlePrefix: 'Message Migration', poolLength: MESSAGE_MIGRATION_QUESTIONS.length,
    order: 2, timeLimitMin: 10, process: 4, technical: 3, flow: 3,
  })

  console.log(`\n✅ "${testTitle}": Content 20/${contentPoolLen} (20min) + Email 10/${emailPoolLen} (10min) + Message 10/${messagePoolLen} (10min). ${durationMin} min total, 40 marks. Status DRAFT — publish it in the admin UI to use.`)
}

if (require.main === module) {
  main().catch(e => { console.error('❌ create-migration-assessment failed:', e); process.exit(1) }).finally(() => prisma.$disconnect())
}
