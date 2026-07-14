/**
 * Copy the communication rounds from a source test into "Communication Assessment",
 * applying the agreed 20-min / 20-mark / 3-round spec. Excludes Aptitude & Writing.
 *
 *   General English    10 min, all MCQs      1 mark each   (10 marks)
 *   Listen & Answer     5 min, audio + 5 Qs  1 mark each   ( 5 marks)
 *   JAM                 5 min, 1 of 20 pool  5 marks       ( 5 marks)
 *
 * Idempotent — wipes the target's existing sections first, then rebuilds them.
 * Run on the target environment:
 *   docker exec -w /app neutaraassessment-backend-1 npx tsx prisma/copy-communication.ts
 *
 * Env overrides: SOURCE_TITLE (default "Freshers Assessment 1"),
 *                TARGET_TITLE (default "Communication Assessment").
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// Desired rounds, in order. Each pulls its questions from the same-named source section.
const ROUNDS = [
  { title: 'General English',       timeLimit: 10 * 60, pickCount: null as number | null, points: 1 },
  { title: 'Listen & Answer',       timeLimit:  5 * 60, pickCount: null as number | null, points: 1, copyAudio: true },
  { title: 'JAM — Just A Minute',   timeLimit:  5 * 60, pickCount: 1,                     points: 5 },
]

async function main() {
  const sourceTitle = process.env.SOURCE_TITLE || 'Freshers Assessment 1'
  const targetTitle = process.env.TARGET_TITLE || 'Communication Assessment'

  const source = await prisma.test.findFirst({
    where: { title: sourceTitle },
    include: { sections: { include: { testQuestions: { orderBy: { order: 'asc' } } } } },
    orderBy: { createdAt: 'asc' },
  })
  if (!source) throw new Error(`Source test "${sourceTitle}" not found.`)

  const target = await prisma.test.findFirst({ where: { title: targetTitle }, include: { sections: true }, orderBy: { createdAt: 'asc' } })
  if (!target) throw new Error(`Target test "${targetTitle}" not found — create it in the admin first.`)

  // Wipe the target's existing sections (and their attachments) so this is a clean rebuild.
  for (const s of target.sections) {
    await prisma.testQuestion.deleteMany({ where: { sectionId: s.id } })
  }
  await prisma.testSection.deleteMany({ where: { testId: target.id } })

  let order = 0
  let totalMarks = 0
  for (const round of ROUNDS) {
    const src = source.sections.find(s => s.title === round.title)
    if (!src) { console.log(`⚠ source has no "${round.title}" section — skipped`); continue }

    const sec = await prisma.testSection.create({
      data: {
        testId: target.id,
        title: src.title,
        description: src.description,
        skill: src.skill ?? undefined,
        order: order++,
        timeLimit: round.timeLimit,
        pickCount: round.pickCount,
        ...(round.copyAudio && src.audioAssetId ? { audioAssetId: src.audioAssetId } : {}),
      },
    })

    if (src.testQuestions.length) {
      await prisma.testQuestion.createMany({
        data: src.testQuestions.map((tq, i) => ({
          testId: target.id, sectionId: sec.id, questionId: tq.questionId, order: i, points: round.points,
        })),
      })
    }
    const served = round.pickCount ?? src.testQuestions.length
    totalMarks += served * round.points
    console.log(`✔ ${round.title.padEnd(22)} ${round.timeLimit / 60}m  pool=${round.pickCount ?? 'all'}  Qs=${src.testQuestions.length}  audio=${round.copyAudio && src.audioAssetId ? 'yes' : '-'}`)
  }

  await prisma.test.update({ where: { id: target.id }, data: { duration: 20 } })
  console.log(`\n✅ "${targetTitle}" rebuilt: 20 min, ${totalMarks} marks (General English 10 + Listen 5 + JAM 5).`)
}

main().catch(e => { console.error('❌ Copy failed:', e); process.exit(1) }).finally(() => prisma.$disconnect())
