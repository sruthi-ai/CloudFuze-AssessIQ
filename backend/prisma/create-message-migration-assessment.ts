/**
 * Create/rebuild "Message Migration Assessment":
 *   20 questions in 30 minutes, 20 marks — drawn from a curated 20-question
 *   message-migration pool: 8 process (sequence/dependency), 5 technical
 *   (how the system is built), 7 flow (troubleshooting scenarios). Every
 *   candidate gets this exact 8/5/7 mix (stratified pickStrata draw) — see
 *   backend/src/routes/sessions.ts's pickStrata handling.
 *
 * Rewritten (v2) in plain, short language after real candidate feedback that
 * the original wording was too dense for entry-level candidates — same
 * underlying concepts and correct answers, simpler sentences and everyday
 * words, distractors still plausible (not a pure giveaway).
 *
 * Trimmed (v3) from the original 50-question pool down to a curated 20 by
 * manual review. Because the kept pool (20) equals the intended per-candidate
 * question count, the draw was changed from 6/6/8=20 (drawn from a larger
 * 50-pool) to 8/5/7=20 (the entire kept pool, every time) — every candidate
 * now sees the same 20 questions each attempt, only their order shuffles.
 * If future review restores a larger pool per category, pickStrata can go
 * back to drawing a genuine subset.
 *
 * Idempotent — safe to re-run: existing questions are UPDATED in place if
 * their body/options/category changed (matched by title), not skipped, so
 * re-running this script after an edit actually applies the edit. The test's
 * section is still cleanly rebuilt each run so pool/strata config stays in
 * sync, without touching unrelated tests or the question bank identity.
 * The 30 removed questions' rows are left in the bank untouched (not
 * deleted, so any historical candidate answers against them stay valid) —
 * the pool query below matches an explicit list of this script's current
 * titles, not a broad prefix match, so those orphaned rows are never pulled
 * back into the active test.
 *
 *   docker exec -w /app neutaraassessment-backend-1 npx tsx prisma/create-message-migration-assessment.ts
 *
 * Env overrides: TEST_TITLE (default "Message Migration Assessment"),
 *                APTITUDE_BANK_NAME (default "Freshers Assessment 1" — used only
 *                to resolve the tenant/admin, not as a question source),
 *                PROCESS_PICK/TECHNICAL_PICK/FLOW_PICK (defaults 8/5/7),
 *                DURATION_MIN (default 30).
 */
import { PrismaClient, TestStatus } from '@prisma/client'
const prisma = new PrismaClient()

export const MESSAGE_MIGRATION_BANK_NAME = 'Message Migration Questions Bank'

type Category = 'process' | 'technical' | 'flow'
export const MESSAGE_MIGRATION_QUESTIONS: { body: string; options: string[]; correct: number; category: Category }[] = [
  // ── PROCESS (8) — sequence and dependency ────────────────────────────────
  { category: 'process', body: "Why must a destination channel or DM exist before any messages can move into it?", options: ["Messages get posted regardless of whether a destination exists", "Messages need somewhere real to be posted into — you can't post to something that isn't there yet", "Channel setup is only about record-keeping, not actual posting", "The channel is created automatically the moment a message is posted"], correct: 1 },
  { category: 'process', body: "If a parent message fails to move, what happens to its replies?", options: ["Replies move on their own, unaffected by the parent", "Replies turn into new stand-alone top-level messages", "Replies wait forever until an admin deletes the failed parent", "Replies also fail or don't get attempted — a reply needs its parent to exist first"], correct: 3 },
  { category: 'process', body: "If a parent message moves fine but one specific reply fails, is that connected to the parent?", options: ["Yes — one failed reply always means the parent must move again", "Yes — reply failures always trace back to the parent losing its link", "No — once the parent is fine, each reply succeeds or fails on its own", "No, but only for channels — replies in DMs always match the parent's result"], correct: 2 },
  { category: 'process', body: "Why does moving replies need its own separate step, after the main messages are already moved?", options: ["Replies are moved first, then matched to parents afterward", "A reply needs to be linked back to its parent, which may only be possible once all the parent messages in that channel are already moved", "This step only exists to shrink the size of the first request", "This step is only needed when moving between two different platforms"], correct: 1 },
  { category: 'process', body: "Why does copying access rights need to match a source person to a destination person, instead of just copying the name over?", options: ["Matching by name is disallowed only for legal reasons", "This matching is only needed if both platforms use the same login system", "The source and destination are different systems — the same person may have a different account on each, so a match has to be found first", "The source account is always reused exactly as-is"], correct: 2 },
  { category: 'process', body: "What should happen if no matching destination account can be found for someone who had access at the source?", options: ["A generic shared account is given access instead", "That person is silently left out, with no record of it", "The whole channel's access-copying is cancelled completely", "It should be flagged as a gap to sort out — not guessed or silently skipped"], correct: 3 },
  { category: 'process', body: "Why would a platform like Viva Engage need files uploaded BEFORE the message that mentions them is posted?", options: ["This is true for every messaging platform, not just Viva", "This only applies to very large files", "File order doesn't actually matter for posting a message", "Viva's own posting system may need the file to already exist before the message can reference it — a platform-specific requirement"], correct: 3 },
  { category: 'process', body: "Why would a client ask if their message timestamps (send times) stay the same after moving, and why does this matter?", options: ["Timestamps are never kept on any platform", "Whether the real send time is kept (instead of showing the move time) affects how the client reads their own message history — worth knowing for sure, not assuming", "Timestamps are always kept exactly, so this never needs checking", "This only matters for message length, not for the date shown"], correct: 1 },

  // ── TECHNICAL (5) — how the system is built ──────────────────────────────
  { category: 'technical', body: "How might the system tell a DM apart from a channel internally, so different retry rules can apply to each?", options: ["It probably tags each conversation by type when it's created, then applies rules based on that tag", "It counts the people in the conversation freshly, every single time", "It stores DMs and channels in two completely separate systems with no shared logic", "Retry rules are actually identical for both; any difference is a coincidence"], correct: 0 },
  { category: 'technical', body: "How would the system likely handle \"finding what to move\" and \"actually moving it\" as two separate steps for messages?", options: ["The two steps are actually merged for messages, unlike for files/folders", "Finding messages only applies to files, never to messages themselves", "This separation exists only to create two different client invoices", "Finding messages figures out what exists; the move step actually writes it to the destination — keeping them separate lets each be retried or watched on its own"], correct: 3 },
  { category: 'technical', body: "Why can a failed channel message often be retried automatically, but a failed DM usually cannot?", options: ["DMs are simply considered less important, so retries are skipped", "Order matters a lot in a private back-and-forth chat — retrying an out-of-order DM risks placing an older message after newer ones, visibly messing up the conversation", "Channel messages are retried only because channels have unlimited storage", "DMs can't be retried due to an unrelated messaging limit"], correct: 1 },
  { category: 'technical', body: "Why would emoji reactions on a message need to be handled only after the message itself has successfully moved?", options: ["Reactions move completely on their own, with no link to the message", "Reactions are always moved before the message, to save space for them", "Reactions are never moved, on any platform, under any circumstance", "A reaction is attached to a specific message — that message has to exist at the destination first before a reaction can be attached to it there"], correct: 3 },
  { category: 'technical', body: "Why does a workspace-level status stay \"not finished\" if even one channel underneath it is still in progress?", options: ["Workspace status is based only on how much time has passed, not on channels", "Workspace status has no real link to individual channels at all", "This rule only applies to workspaces with very few channels", "The overall status has to reflect the real situation — marking it \"finished\" while one part is still going would be misleading"], correct: 3 },

  // ── FLOW (7) — troubleshooting scenarios ─────────────────────────────────
  { category: 'flow', body: "A client asks why some of their DMs never came over, while all their channel messages moved fine. What's your first check?", options: ["Assume DMs simply aren't supported for this client's plan", "Assume the destination platform doesn't support DMs at all", "Check only whether the DMs were sent outside office hours", "Whether the failed DMs hit a real conflict — DMs don't retry automatically, so a DM failure stays failed until someone looks at it, unlike a channel message"], correct: 3 },
  { category: 'flow', body: "A client's replies show as \"conflict,\" but the original messages show as moved successfully. What's the likely cause?", options: ["Assume the parent message needs to be moved again to fix the replies", "Assume this always means the whole thread is broken and needs a full restart", "Assume the replies are duplicates and check for extra parent copies instead", "Since the parent worked, the reply issue is probably its own separate problem — check that specific reply's error, not the parent"], correct: 3 },
  { category: 'flow', body: "Messages in a channel appear to post in the wrong order compared to when they were actually sent. What do you look into?", options: ["Assume this is only ever a display issue, nothing really reordered", "Assume this only happens moving from one specific platform to another", "Assume the client's local timezone is always the cause", "Whether this is a DM (where order matters most and retries are avoided to protect it) versus a channel where a retry might have shifted something"], correct: 3 },
  { category: 'flow', body: "A client on Viva Engage says message counts look stuck while file upload counts keep rising. Is this a problem?", options: ["Yes — counts should always rise together, no matter the platform", "Yes — this always means the message queue quietly failed", "No — but only because Viva doesn't track messages properly", "Not necessarily — Viva needs files uploaded before their message posts, so file progress moving while message progress briefly lags is expected"], correct: 3 },
  { category: 'flow', body: "A client asks why some messages show \"conflict\" while almost all similar messages moved fine. What's your approach?", options: ["Assume a system-wide outage and escalate right away", "Re-run the entire move to see if the same messages fail again", "Check the client's timezone setting first", "Look at the specific reason attached to those few conflicting messages — since most succeeded, the cause is likely specific to them"], correct: 3 },
  { category: 'flow', body: "A client's report shows a much higher message count than they expected. What do you check before assuming it's a bug?", options: ["Assume the report is counting every message twice", "Assume the client's own estimate must be corrected in writing first", "Assume two separate move jobs were started by accident", "Whether hidden items (message versions, system messages, etc.) are being counted — systems often surface more than a client's rough estimate"], correct: 3 },
  { category: 'flow', body: "A client wants to confirm that messages deleted at the source before the move are being handled correctly, not just silently causing errors. What do you explain?", options: ["Tell them deleted messages always cause the whole job to stop", "Tell them deleted messages are impossible to detect, so nothing can be promised", "Tell them deleted messages are converted into a placeholder automatically", "Explain that the system checks for this and skips a message that's no longer there, rather than posting something that doesn't exist anymore"], correct: 3 },
]

async function main() {
  const testTitle = process.env.TEST_TITLE || 'Message Migration Assessment'
  const aptitudeBankName = process.env.APTITUDE_BANK_NAME || 'Freshers Assessment 1'
  const processPick = Number(process.env.PROCESS_PICK) || 8
  const technicalPick = Number(process.env.TECHNICAL_PICK) || 5
  const flowPick = Number(process.env.FLOW_PICK) || 7
  const durationMin = Number(process.env.DURATION_MIN) || 30

  const aptiBank = await prisma.questionBank.findFirst({ where: { name: aptitudeBankName } })
  if (!aptiBank) throw new Error(`Bank "${aptitudeBankName}" not found — needed to resolve tenant/admin.`)
  const tenantId = aptiBank.tenantId

  const admin = await prisma.user.findFirst({
    where: { tenantId, role: { in: ['SUPER_ADMIN', 'COMPANY_ADMIN'] } },
    orderBy: { createdAt: 'asc' },
  })
  if (!admin) throw new Error('No admin user found for the tenant.')

  let bank = await prisma.questionBank.findFirst({ where: { name: MESSAGE_MIGRATION_BANK_NAME, tenantId } })
  if (!bank) {
    bank = await prisma.questionBank.create({ data: { name: MESSAGE_MIGRATION_BANK_NAME, tenantId, description: 'Message migration engineering reasoning MCQ pool — 8 process, 5 technical, 7 flow-driven troubleshooting questions.' } })
  }

  let created = 0
  let updated = 0
  for (let i = 0; i < MESSAGE_MIGRATION_QUESTIONS.length; i++) {
    const title = `Message Migration Q${i + 1}`
    const q = MESSAGE_MIGRATION_QUESTIONS[i]
    const optionsData = q.options.map((text, idx) => ({ text, isCorrect: idx === q.correct, order: idx }))
    const existing = await prisma.question.findFirst({ where: { bankId: bank.id, title }, include: { options: { orderBy: { order: 'asc' } } } })

    if (!existing) {
      await prisma.question.create({
        data: {
          bankId: bank.id, type: 'MCQ_SINGLE', title, body: q.body,
          difficulty: 'MEDIUM', points: 1, domain: 'Message Migration Engineering', tags: [q.category],
          options: { create: optionsData },
        },
      })
      created++
      continue
    }

    const optionsChanged = existing.options.length !== optionsData.length
      || existing.options.some((o, idx) => o.text !== optionsData[idx]?.text || o.isCorrect !== optionsData[idx]?.isCorrect)
    const tagsChanged = JSON.stringify(existing.tags ?? []) !== JSON.stringify([q.category])
    if (existing.body !== q.body || optionsChanged || tagsChanged) {
      if (optionsChanged) await prisma.questionOption.deleteMany({ where: { questionId: existing.id } })
      await prisma.question.update({
        where: { id: existing.id },
        data: { body: q.body, tags: [q.category], options: optionsChanged ? { create: optionsData } : undefined },
      })
      updated++
    }
  }
  console.log(`Message Migration bank: ${created} created, ${updated} updated (simplified wording/category), ${MESSAGE_MIGRATION_QUESTIONS.length - created - updated} unchanged.`)

  // Matched against this script's exact current titles (Q1..Q20), not a broad
  // prefix — a prior 50-question version of this pool left 30 now-unused
  // "Message Migration Q..." rows in the bank (kept, not deleted, so any
  // historical candidate answers against them stay valid); a startsWith match
  // would silently pull those back into the active pool.
  const expectedTitles = MESSAGE_MIGRATION_QUESTIONS.map((_, i) => `Message Migration Q${i + 1}`)
  const questionsByTitle = new Map(
    (await prisma.question.findMany({ where: { bankId: bank.id, title: { in: expectedTitles } }, select: { id: true, title: true } }))
      .map(q => [q.title, q])
  )
  const questions = expectedTitles.map(title => questionsByTitle.get(title)!).filter(Boolean)
  const totalPick = processPick + technicalPick + flowPick

  const instructions = `Message Migration Assessment — ${durationMin} minutes, ${totalPick} questions (${processPick} process, ${technicalPick} technical, ${flowPick} troubleshooting — same mix for everyone), 1 mark each. Choose the best option.`

  let test = await prisma.test.findFirst({ where: { title: testTitle, tenantId } })
  if (!test) {
    test = await prisma.test.create({
      data: {
        title: testTitle, domain: 'Message Migration Engineering', duration: durationMin,
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

  const section = await prisma.testSection.create({
    data: {
      testId: test.id, title: 'Message Migration Engineering', skill: 'GENERAL', order: 0, timeLimit: durationMin * 60,
      pickStrata: { process: processPick, technical: technicalPick, flow: flowPick },
      description: `${totalPick} questions per candidate — ${processPick} process, ${technicalPick} technical, ${flowPick} troubleshooting, drawn from a bank of ${questions.length}. 1 mark each.`,
    },
  })
  await prisma.testQuestion.createMany({
    data: questions.map((q, i) => ({ testId: test!.id, sectionId: section.id, questionId: q.id, order: i, points: 1 })),
  })

  console.log(`\n✅ "${testTitle}": ${totalPick}/${questions.length} questions per candidate (${processPick}p/${technicalPick}t/${flowPick}f), ${durationMin} min, ${totalPick} marks. Status DRAFT — publish it in the admin UI to use.`)
}

if (require.main === module) {
  main().catch(e => { console.error('❌ create-message-migration-assessment failed:', e); process.exit(1) }).finally(() => prisma.$disconnect())
}
