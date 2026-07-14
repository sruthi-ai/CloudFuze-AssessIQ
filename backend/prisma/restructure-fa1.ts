/**
 * Restructure "Freshers Assessment 1" to the communication-only format:
 *   20 minutes total, 20 marks
 *   - General English   10 min, 10 MCQs        (10 marks)
 *   - Listen & Answer    5 min, audio + 5 Qs   ( 5 marks)
 *   - JAM                5 min, 1 topic of pool ( 5 marks)
 *   (Aptitude + Writing sections removed)
 *
 * Idempotent — safe to re-run. Run on the target environment:
 *   docker exec -w /app neutaraassessment-backend-1 npx tsx prisma/restructure-fa1.ts
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const title = process.env.TEST_TITLE || 'Freshers Assessment 1'
  const test = await prisma.test.findFirst({
    where: { title },
    include: { sections: true },
    orderBy: { createdAt: 'asc' },
  })
  if (!test) throw new Error(`Test "${title}" not found.`)

  const byTitle = (t: string) => test.sections.find(s => s.title === t)

  // 1. Remove Aptitude + Writing (delete their attachments first, then the section).
  for (const title of ['Aptitude', 'Writing']) {
    const sec = byTitle(title)
    if (sec) {
      await prisma.testQuestion.deleteMany({ where: { sectionId: sec.id } })
      await prisma.testSection.delete({ where: { id: sec.id } })
      console.log(`✔ removed section: ${title}`)
    }
  }

  // 2. Timings + order for the remaining three.
  const ge = byTitle('General English')
  if (ge) await prisma.testSection.update({ where: { id: ge.id }, data: { timeLimit: 10 * 60, order: 0 } })
  const listen = byTitle('Listen & Answer')
  if (listen) await prisma.testSection.update({ where: { id: listen.id }, data: { timeLimit: 5 * 60, order: 1 } })
  const jam = byTitle('JAM — Just A Minute')
  if (jam) {
    await prisma.testSection.update({ where: { id: jam.id }, data: { timeLimit: 5 * 60, order: 2 } })
    // JAM = 5 marks: the pool serves 1 question, so each pool question is worth 5.
    await prisma.testQuestion.updateMany({ where: { sectionId: jam.id }, data: { points: 5 } })
  }

  // 3. Total duration.
  await prisma.test.update({ where: { id: test.id }, data: { duration: 20 } })

  // Report
  const after = await prisma.test.findUnique({
    where: { id: test.id },
    include: { sections: { orderBy: { order: 'asc' }, include: { _count: { select: { testQuestions: true } } } } },
  })
  console.log(`\n"${after?.title}" — duration ${after?.duration} min`)
  for (const s of after!.sections) {
    console.log(`  ${s.title.padEnd(22)} ${(s.timeLimit ?? 0) / 60}m  pool=${s.pickCount ?? 'all'}  Qs=${s._count.testQuestions}`)
  }
  console.log('✅ Restructure complete. Marks: General English 10 + Listen 5 + JAM 5 = 20.')
}

main().catch(e => { console.error('❌ Restructure failed:', e); process.exit(1) }).finally(() => prisma.$disconnect())
