/**
 * Load-test setup: creates a dedicated "Load Test" question bank + published
 * test (a handful of MCQs + a timed AUDIO_RECORDING + a free-form
 * AUDIO_RECORDING, mirroring the two answer-recording modes that broke in
 * production), then N candidates + invitations for it. Writes their
 * {token, pin} pairs to a JSON file for loadtest-run.ts to drive.
 *
 * sebRequired is left off deliberately — this harness targets CONCURRENCY,
 * not SEB verification (which is covered separately). proctoring is on, so
 * the run also exercises the snapshot/event endpoints under the same load.
 *
 *   npx tsx prisma/loadtest-setup.ts
 *
 * Env: CANDIDATE_COUNT (default 200), OUT_FILE (default ./loadtest-invitations.json).
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const CANDIDATE_COUNT = Number(process.env.CANDIDATE_COUNT) || 200
const OUT_FILE = process.env.OUT_FILE || './loadtest-invitations.json'
const TEST_TITLE = 'Load Test'
const BANK_NAME = 'Load Test Bank'

async function main() {
  const tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!tenant) throw new Error('No tenant found — run prisma/seed.ts first.')
  const admin = await prisma.user.findFirst({
    where: { tenantId: tenant.id, role: { in: ['SUPER_ADMIN', 'COMPANY_ADMIN'] } },
    orderBy: { createdAt: 'asc' },
  })
  if (!admin) throw new Error('No admin user found for the tenant.')

  // ── Bank + questions (idempotent: reuse if already created by a prior run) ──
  let bank = await prisma.questionBank.findFirst({ where: { name: BANK_NAME, tenantId: tenant.id } })
  if (!bank) {
    bank = await prisma.questionBank.create({ data: { name: BANK_NAME, tenantId: tenant.id, description: 'Synthetic data for load testing — safe to delete.' } })
  }

  let mcqs = await prisma.question.findMany({ where: { bankId: bank.id, type: 'MCQ_SINGLE' } })
  if (mcqs.length === 0) {
    for (let i = 1; i <= 8; i++) {
      const q = await prisma.question.create({
        data: {
          bankId: bank.id, type: 'MCQ_SINGLE', title: `Load Test MCQ ${i}`,
          body: `Synthetic question ${i} — pick option B.`, points: 1,
          options: { create: [
            { text: 'Option A', isCorrect: false, order: 0 },
            { text: 'Option B', isCorrect: true, order: 1 },
            { text: 'Option C', isCorrect: false, order: 2 },
            { text: 'Option D', isCorrect: false, order: 3 },
          ] },
        },
      })
      mcqs.push(q)
    }
  }

  let timedAudio = await prisma.question.findFirst({ where: { bankId: bank.id, type: 'AUDIO_RECORDING', title: 'Load Test Timed Speaking' } })
  if (!timedAudio) {
    timedAudio = await prisma.question.create({
      data: {
        bankId: bank.id, type: 'AUDIO_RECORDING', title: 'Load Test Timed Speaking',
        body: 'Synthetic timed speaking prompt.', points: 5, prepSeconds: 2, speakSeconds: 3,
      },
    })
  }

  let freeAudio = await prisma.question.findFirst({ where: { bankId: bank.id, type: 'AUDIO_RECORDING', title: 'Load Test Free Speaking' } })
  if (!freeAudio) {
    freeAudio = await prisma.question.create({
      data: {
        bankId: bank.id, type: 'AUDIO_RECORDING', title: 'Load Test Free Speaking',
        body: 'Synthetic free-form speaking prompt.', points: 5,
      },
    })
  }

  // ── Test (clean rebuild of sections/questions each run, same as create-apti.ts) ──
  let test = await prisma.test.findFirst({ where: { title: TEST_TITLE, tenantId: tenant.id } })
  if (!test) {
    test = await prisma.test.create({
      data: {
        title: TEST_TITLE, domain: 'Load Test', duration: 15, status: 'PUBLISHED',
        proctoring: true, sebRequired: false, tenantId: tenant.id, createdById: admin.id,
        instructions: 'Synthetic load-test assessment. Not for real candidates.',
      },
    })
  } else {
    await prisma.test.update({ where: { id: test.id }, data: { status: 'PUBLISHED' } })
    const secs = await prisma.testSection.findMany({ where: { testId: test.id } })
    for (const s of secs) await prisma.testQuestion.deleteMany({ where: { sectionId: s.id } })
    await prisma.testSection.deleteMany({ where: { testId: test.id } })
  }

  const mcqSection = await prisma.testSection.create({ data: { testId: test.id, title: 'MCQs', order: 0, timeLimit: 5 * 60 } })
  await prisma.testQuestion.createMany({
    data: mcqs.map((q, i) => ({ testId: test!.id, sectionId: mcqSection.id, questionId: q.id, order: i, points: 1 })),
  })
  const audioSection = await prisma.testSection.create({ data: { testId: test.id, title: 'Speaking', order: 1, timeLimit: 5 * 60 } })
  await prisma.testQuestion.createMany({
    data: [
      { testId: test.id, sectionId: audioSection.id, questionId: timedAudio.id, order: 0, points: 5 },
      { testId: test.id, sectionId: audioSection.id, questionId: freeAudio.id, order: 1, points: 5 },
    ],
  })

  // ── Candidates + invitations ─────────────────────────────────────────────
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const invitations: { token: string; pin: string; sessionUrl: string }[] = []
  const PIN_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const randomPin = () => Array.from({ length: 8 }, () => PIN_CHARS[Math.floor(Math.random() * PIN_CHARS.length)]).join('')

  for (let i = 0; i < CANDIDATE_COUNT; i++) {
    const email = `loadtest-${i}@example.invalid`
    const candidate = await prisma.candidate.upsert({
      where: { email_tenantId: { email, tenantId: tenant.id } },
      create: { email, firstName: 'Load', lastName: `Test${i}`, tenantId: tenant.id },
      update: {},
    })

    // Reuse an existing invitation for this candidate+test if one exists (idempotent re-run)
    let invitation = await prisma.invitation.findUnique({ where: { testId_candidateId: { testId: test.id, candidateId: candidate.id } } })
    if (!invitation) {
      let pin = randomPin()
      for (let attempt = 0; attempt < 5; attempt++) {
        const clash = await prisma.invitation.findUnique({ where: { pin } })
        if (!clash) break
        pin = randomPin()
      }
      invitation = await prisma.invitation.create({
        data: { testId: test.id, candidateId: candidate.id, sentById: admin.id, expiresAt, status: 'SENT', pin, sentAt: new Date() },
      })
    } else {
      // Reset to a fresh, re-runnable state (undo any previous test run's progress)
      await prisma.session.deleteMany({ where: { invitationId: invitation.id } })
      invitation = await prisma.invitation.update({ where: { id: invitation.id }, data: { status: 'SENT', expiresAt } })
    }

    invitations.push({ token: invitation.token, pin: invitation.pin!, sessionUrl: `/take/${invitation.token}` })
  }

  const fs = await import('fs/promises')
  await fs.writeFile(OUT_FILE, JSON.stringify(invitations, null, 2))
  console.log(`✅ ${invitations.length} candidate invitations ready for "${TEST_TITLE}" → ${OUT_FILE}`)
}

main().catch(e => { console.error('❌ loadtest-setup failed:', e); process.exit(1) }).finally(() => prisma.$disconnect())
