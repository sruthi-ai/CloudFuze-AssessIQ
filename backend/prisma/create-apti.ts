/**
 * Create/rebuild a standalone aptitude test "Apti":
 *   one section, all 100 aptitude questions from the Freshers bank,
 *   a random 20 served per candidate (pool 20/100), 20 min, 20 marks.
 *
 * Pulls questions from the bank directly (title "Aptitude Q…"), so it works even
 * after Freshers Assessment 1 was restructured. Idempotent — safe to re-run.
 *
 *   docker exec -w /app neutaraassessment-backend-1 npx tsx prisma/create-apti.ts
 *
 * Env overrides: APTI_TITLE (default "Apti"), BANK_NAME (default "Freshers Assessment 1").
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const title = process.env.APTI_TITLE || 'Apti'
  const bankName = process.env.BANK_NAME || 'Freshers Assessment 1'

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

  // Instructions must match the actual served pool exactly — candidates were shown
  // a stale "100 questions" description on a rebuilt test because only test-creation
  // set this field; a rebuild never corrected it. Always (re)set it below.
  const instructions = `Aptitude test — ${questions.length} questions in the bank; you will be given a random selection of 20 to answer, 20 minutes, 1 mark each. Choose the best option.`

  // Find or create the "Apti" test.
  let test = await prisma.test.findFirst({ where: { title, tenantId: bank.tenantId }, orderBy: { createdAt: 'asc' } })
  if (!test) {
    test = await prisma.test.create({
      data: {
        title, domain: 'Aptitude', duration: 20, proctoring: true, sebRequired: true,
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
    await prisma.test.update({ where: { id: test.id }, data: { duration: 20, instructions } })
    console.log(`rebuilt existing test "${title}"`)
  }

  const section = await prisma.testSection.create({
    data: { testId: test.id, title: 'Aptitude', skill: 'GENERAL', order: 0, timeLimit: 20 * 60, pickCount: 20,
      description: '20 questions (randomly drawn from a bank of 100) covering quantitative ability, logical reasoning and data interpretation. 1 mark each.' },
  })
  await prisma.testQuestion.createMany({
    data: questions.map((q, i) => ({ testId: test!.id, sectionId: section.id, questionId: q.id, order: i, points: 1 })),
  })

  console.log(`✅ "${title}": Aptitude section — pool 20 of ${questions.length}, 20 min, 20 marks. Publish it to use.`)
}

main().catch(e => { console.error('❌ create-apti failed:', e); process.exit(1) }).finally(() => prisma.$disconnect())
