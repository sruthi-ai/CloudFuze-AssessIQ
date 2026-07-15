/**
 * Create/rebuild a standalone aptitude test:
 *   one section, all aptitude questions from the Freshers bank,
 *   a random POOL_SIZE served per candidate, DURATION_MIN minutes, 1 mark each.
 *
 * Pulls questions from the bank directly (title "Aptitude Q…"), so it works even
 * after Freshers Assessment 1 was restructured. Idempotent — safe to re-run.
 *
 *   docker exec -w /app neutaraassessment-backend-1 npx tsx prisma/create-apti.ts
 *
 * Env overrides: APTI_TITLE (default "Apti"), BANK_NAME (default "Freshers Assessment 1"),
 *                POOL_SIZE (default 20 — questions served per candidate),
 *                DURATION_MIN (default 20 — minutes, also the section time limit).
 *
 * Example — a second, longer variant from the same 100-question bulk:
 *   docker exec -e APTI_TITLE="Aptitude Set 2" -e POOL_SIZE=40 -e DURATION_MIN=40 \
 *     -w /app neutaraassessment-backend-1 npx tsx prisma/create-apti.ts
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const title = process.env.APTI_TITLE || 'Apti'
  const bankName = process.env.BANK_NAME || 'Freshers Assessment 1'
  const poolSize = Number(process.env.POOL_SIZE) || 20
  const durationMin = Number(process.env.DURATION_MIN) || 20

  const bank = await prisma.questionBank.findFirst({ where: { name: bankName } })
  if (!bank) throw new Error(`Question bank "${bankName}" not found.`)

  const admin = await prisma.user.findFirst({
    where: { tenantId: bank.tenantId, role: { in: ['SUPER_ADMIN', 'COMPANY_ADMIN'] } },
    orderBy: { createdAt: 'asc' },
  })
  if (!admin) throw new Error('No admin user found for the bank tenant.')

  const questions = await prisma.question.findMany({
    where: { bankId: bank.id, title: { startsWith: 'Aptitude Q' } },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  if (!questions.length) throw new Error('No aptitude questions (title "Aptitude Q…") found in the bank.')
  if (poolSize > questions.length) throw new Error(`POOL_SIZE (${poolSize}) exceeds the bank's ${questions.length} aptitude questions.`)

  // Instructions must match the actual served pool exactly — a prior version of this
  // script only set this on first creation, so a rebuild with different POOL_SIZE/
  // DURATION_MIN left a stale description in place. Always (re)set it below.
  const instructions = `Aptitude test — ${questions.length} questions in the bank; you will be given a random selection of ${poolSize} to answer, ${durationMin} minutes, 1 mark each. Choose the best option.`

  // Find or create the test.
  let test = await prisma.test.findFirst({ where: { title, tenantId: bank.tenantId }, orderBy: { createdAt: 'asc' } })
  if (!test) {
    test = await prisma.test.create({
      data: {
        title, domain: 'Aptitude', duration: durationMin, proctoring: true, sebRequired: true,
        status: 'DRAFT', tenantId: bank.tenantId, createdById: admin.id,
        instructions,
      },
    })
    console.log(`created test "${title}"`)
  } else {
    // Clean rebuild of its sections.
    const secs = await prisma.testSection.findMany({ where: { testId: test.id } })
    for (const s of secs) await prisma.testQuestion.deleteMany({ where: { sectionId: s.id } })
    await prisma.testSection.deleteMany({ where: { testId: test.id } })
    await prisma.test.update({ where: { id: test.id }, data: { duration: durationMin, instructions } })
    console.log(`rebuilt existing test "${title}"`)
  }

  const section = await prisma.testSection.create({
    data: { testId: test.id, title: 'Aptitude', skill: 'GENERAL', order: 0, timeLimit: durationMin * 60, pickCount: poolSize,
      description: `${poolSize} questions (randomly drawn from a bank of ${questions.length}) covering quantitative ability, logical reasoning and data interpretation. 1 mark each.` },
  })
  await prisma.testQuestion.createMany({
    data: questions.map((q, i) => ({ testId: test!.id, sectionId: section.id, questionId: q.id, order: i, points: 1 })),
  })

  console.log(`✅ "${title}": Aptitude section — pool ${poolSize} of ${questions.length}, ${durationMin} min, ${poolSize} marks. Publish it to use.`)
}

main().catch(e => { console.error('❌ create-apti failed:', e); process.exit(1) }).finally(() => prisma.$disconnect())
