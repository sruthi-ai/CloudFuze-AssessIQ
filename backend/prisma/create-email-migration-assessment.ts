/**
 * Create/rebuild "Email Migration Assessment":
 *   20 questions in 30 minutes, 20 marks — a category-balanced draw from a
 *   curated 25-question email/mailbox-migration pool: 7 process (sequence/
 *   dependency), 9 technical (how the system is built), 9 flow
 *   (troubleshooting scenarios). Every candidate gets the same 6 process +
 *   6 technical + 8 flow mix (stratified pickStrata draw), not pure random
 *   luck — see backend/src/routes/sessions.ts's pickStrata handling.
 *
 * Rewritten (v2) in plain, short language after real candidate feedback that
 * the original wording was too dense for entry-level candidates — same
 * underlying concepts and correct answers, simpler sentences and everyday
 * words, distractors still plausible (not a pure giveaway).
 *
 * Trimmed (v3) from the original 50-question pool down to a curated 25 by
 * manual review. The draw size (6/6/8 = 20 per candidate) is unchanged; each
 * category still has more available (7/9/9) than its draw count, so there's
 * still real randomization, just less spare pool than before.
 *
 * NOTE (unchanged from v1): unlike Content/Message Migration, this pool
 * isn't grounded in documented internal CloudFuze Email workflow logic yet —
 * it's built from the visible report structure (Job -> Pair -> Folder,
 * One-Time/Delta tabs) plus transferable reasoning from Content/Message
 * migration. Flag anything that doesn't match real CloudFuze Email behavior.
 *
 * Idempotent — safe to re-run: existing questions are UPDATED in place if
 * their body/options/category changed (matched by title), not skipped, so
 * re-running this script after an edit actually applies the edit. The test's
 * section is still cleanly rebuilt each run so pool/strata config stays in
 * sync, without touching unrelated tests or the question bank identity.
 * The 25 removed questions' rows are left in the bank untouched (not
 * deleted, so any historical candidate answers against them stay valid) —
 * the pool query below matches an explicit list of this script's current
 * titles, not a broad prefix match, so those orphaned rows are never pulled
 * back into the active test.
 *
 *   docker exec -w /app neutaraassessment-backend-1 npx tsx prisma/create-email-migration-assessment.ts
 *
 * Env overrides: TEST_TITLE (default "Email Migration Assessment"),
 *                APTITUDE_BANK_NAME (default "Freshers Assessment 1" — used only
 *                to resolve the tenant/admin, not as a question source),
 *                PROCESS_PICK/TECHNICAL_PICK/FLOW_PICK (defaults 6/6/8),
 *                DURATION_MIN (default 30).
 */
import { PrismaClient, TestStatus } from '@prisma/client'
const prisma = new PrismaClient()

export const EMAIL_MIGRATION_BANK_NAME = 'Email Migration Questions Bank'

type Category = 'process' | 'technical' | 'flow'
export const EMAIL_MIGRATION_QUESTIONS: { body: string; options: string[]; correct: number; category: Category }[] = [
  // ── PROCESS (7) — sequence and dependency ────────────────────────────────
  { category: 'process', body: "A pair shows Inbox, Sent, and Drafts as \"done,\" but Trash is still waiting, and the whole pair is only partway done. Is that a problem?", options: ["Yes — every folder must finish in the order it appears", "Yes — Trash lagging always means the mailbox is broken", "Not really — folders don't block each other, so one lagging behind while others finish is normal", "It's fine, but only because Trash is always left for last on purpose"], correct: 2 },
  { category: 'process', body: "Why does moving email usually need both a \"one-time\" move and an ongoing \"delta\" move?", options: ["One-time only moves folders; delta only moves individual emails", "One-time copies everything as of right now; delta then keeps catching new or changed email afterward, right up until the final switch-over", "Delta only exists to make the invoice smaller", "One-time and delta are really the same thing, just named differently"], correct: 1 },
  { category: 'process', body: "Why might a client need delta to keep running for weeks after the one-time move is done, instead of just running one-time again later?", options: ["One-time can technically only ever be run once", "Delta only exists to satisfy a paperwork requirement", "Running one-time again means starting over completely, which is slow — delta only grabs what's changed since the last check", "Running one-time again would actually be faster, but nobody bothers"], correct: 2 },
  { category: 'process', body: "What happens, logically, if admin access is turned off partway through a mailbox move?", options: ["The whole job gets permanently deleted the moment access is turned off", "Anything already finished should stay fine, but anything that was actively depending on that access can't continue until it's restored", "Everything already moved gets automatically undone", "Turning access off mid-move has no effect at all"], correct: 1 },
  { category: 'process', body: "Why might calendar and contacts move on a different timeline than the actual email, for the same person?", options: ["Calendar and contacts are always moved only after 100% of email is done", "A timeline difference always means the calendar or contacts are broken", "These are often handled as separate pieces of data, so they can progress at their own pace, even for the same account", "Calendar, contacts, and email always move through the exact same process, so there should never be a difference"], correct: 2 },
  { category: 'process', body: "Why might \"done\" for a folder not fully guarantee that every single email inside it actually landed correctly?", options: ["\"Done\" is a perfect guarantee with no room for individual issues", "Folder status usually rolls up many individual email results — a few could still have quietly failed and need their own check", "Folder status only reflects the very first email in that folder", "Any single email failing always flips the whole folder back to \"waiting\""], correct: 1 },
  { category: 'process', body: "Why might spam/junk and trash sometimes be treated as lower priority, or skipped, in some move setups?", options: ["Spam and trash are technically impossible to move on any platform", "These folders are always moved first, ahead of Inbox", "This content usually isn't something the client needs kept long-term, so some clients choose to skip or deprioritize it to save time", "Skipping these folders is always forced by the system, never a client's choice"], correct: 2 },

  // ── TECHNICAL (9) — how the system is built ─────────────────────────────
  { category: 'technical', body: "How might the system check that source and destination counts truly match, to confirm a move is really finished?", options: ["It declares the job done just because no errors were reported, without comparing counts", "It relies entirely on the client to manually count and confirm", "It only compares counts for the Inbox, not other folders", "It likely compares a final count of what successfully landed at the destination against what was found at the source, flagging any shortfall"], correct: 3 },
  { category: 'technical', body: "Why might a client's inbox rules/filters (auto-sorting mail into folders) need to be checked separately, instead of assuming they \"just carry over\"?", options: ["Rules/filters are always embedded in every message, so they move automatically with the mail", "Rules and filters are never supported on any platform and can't be moved at all", "Rules only need re-creating for a shared mailbox, never a personal one", "Rules are usually a separate setting from the mail content itself — moving messages doesn't automatically recreate the rules for future incoming mail"], correct: 3 },
  { category: 'technical', body: "Why might a single message or attachment being too large for the destination's limit need special handling?", options: ["Size limits are exactly the same on every mail platform, so this never comes up", "Oversized items are always compressed automatically with no client involvement", "If something is too big to fit as-is, it can't just be silently dropped or assumed to fit — it needs a defined way to be flagged", "Size limits only ever apply to calendar invites, never regular email"], correct: 2 },
  { category: 'technical', body: "Why might \"out of office\" auto-reply settings need their own handling, instead of assuming they carry over automatically with the mailbox?", options: ["Auto-reply is automatically switched off for every move, by design", "Auto-reply is actually part of every single email message, so it moves with each one", "This setting has no real impact since it only affects mail arriving after the move", "Auto-reply is a mailbox setting, separate from the messages — if it's not specifically handled, someone could lose their active auto-reply during a busy transition period"], correct: 3 },
  { category: 'technical', body: "Why might a distribution list or shared team mailbox need different handling than one person's mailbox?", options: ["Distribution lists are functionally identical to a personal mailbox, with nothing extra to consider", "Group mailboxes can't be moved at all and must be manually recreated", "Membership always transfers automatically the instant any mail from the group moves", "A group mailbox usually has its own membership list and access rules — its mail moving fine doesn't guarantee that list also moved correctly"], correct: 3 },
  { category: 'technical', body: "Why might specially protected email (like something under legal hold) need different handling than normal email?", options: ["Protected email always moves exactly like normal email, with nothing extra to think about", "Protection is automatically removed from every message the moment a move starts", "Only calendar data can ever be protected, never regular email", "Protected content might not be readable or movable the normal way without the right permission or unlocking step — worth flagging as its own case"], correct: 3 },
  { category: 'technical', body: "Why does email formatting (fonts, images, layout) matter as part of the move, not just the plain text content?", options: ["Formatting is always stripped from every email as a standard part of moving", "Formatting only matters for Sent items, never for received mail", "Only plain text is ever shown by any mail app, so formatting is irrelevant", "A message that loses its formatting or images can look broken to the person reading it, even if the plain text technically came through fine"], correct: 3 },
  { category: 'technical', body: "Why does a mailbox move typically need to slow itself down (respecting rate limits), similar to other types of moves?", options: ["Slowing down is done only to intentionally make bigger clients wait longer", "Rate limits only ever apply to calendar data, never to email itself", "Mail platforms almost never have any request limits, so this is rarely a real concern", "Mail platforms usually have their own limits on how many requests they'll accept — moving faster than that risks getting blocked or slowed down even more"], correct: 3 },
  { category: 'technical', body: "Why might very large mailboxes (with lots of attachments) take much longer to move than the mailbox count alone would suggest?", options: ["Attachments are always moved in a completely separate job, after everything else finishes", "Attachment size only ever affects calendar data, not email folders", "How long a mailbox takes depends only on message count, never on attachment size", "Message count isn't the same as data volume — attachments add real transfer weight that a simple message-count comparison wouldn't capture"], correct: 3 },

  // ── FLOW (9) — troubleshooting scenarios ─────────────────────────────────
  { category: 'flow', body: "A client's pair shows 8,000 of 65,000 emails done, with some folders already fully finished. Is this a problem?", options: ["Always concerning — anything under half-done should be escalated right away", "Not necessarily — check whether the remaining folders (like a big Inbox) explain most of what's left; only worry if progress has genuinely stopped", "Assume the count is wrong and recalculate it by hand first", "Assume the smaller, finished folders are secretly failing"], correct: 1 },
  { category: 'flow', body: "A client asks why their move shows \"in progress\" with no visible errors, but hasn't moved in several hours. What do you check first?", options: ["Restart the whole mailbox move from the very beginning", "Assume the mailbox is simply too large to ever finish and suggest splitting it", "Check only the client's internet connection, since that's always the cause", "Whether this is truly stuck (zero movement over time) versus just a large folder processing slowly, and whether access/authentication is still working"], correct: 3 },
  { category: 'flow', body: "A client's calendar events show up at the wrong time after moving. What do you check first?", options: ["Check only whether the client's computer clock is set correctly", "Assume the client edited the events by hand afterward", "Assume this is unrelated to the move and just a display issue in their calendar app", "Time zone handling specifically — this is a known trouble spot for calendar/date data"], correct: 3 },
  { category: 'flow', body: "A shared mailbox moved all its email successfully, but a second person who used to have access can no longer get in. What's your triage?", options: ["Assume the email move itself must have quietly failed for that person", "Assume that person's account was deleted at the destination", "Re-move the entire shared mailbox from scratch to fix the access issue", "Recognize this as a separate access/delegation gap — the email moving fine doesn't mean delegated access was also set up at the destination"], correct: 3 },
  { category: 'flow', body: "One mailbox is taking dramatically longer than every other similarly-sized mailbox in the same batch. What's a reasonable first guess?", options: ["Assume the entire batch process is fundamentally broken", "Assume this mailbox was wrongly included and should be removed", "Assume alphabetical processing order is simply working against this one mailbox", "Consider real content differences — heavy attachments, unusually large folders, or one specific problem item — rather than assuming the whole batch is broken"], correct: 3 },
  { category: 'flow', body: "A client asks why delta sync seems to have \"missed\" some emails sent right before a scheduled sync run. What do you check?", options: ["Assume delta sync is fundamentally broken and switch to one-time moves permanently", "Assume the emails were sent to a folder delta never checks", "Assume the client's mail app cached an old view and ignore the report", "The actual timing of when delta last ran versus when those emails arrived — a narrow timing gap right at the edge is very different from delta being broken"], correct: 3 },
  { category: 'flow', body: "A client asks why their inbox rules (auto-sorting incoming mail into folders) don't seem to be working at the new mailbox. What do you explain?", options: ["Tell them rules always move automatically and this must be a bug", "Tell them rules can never be recreated on any platform", "Assume the client set the rules up wrong themselves", "Explain that rules/filters are a separate setting from the mail itself, and usually need to be explicitly recreated or migrated on their own"], correct: 3 },
  { category: 'flow', body: "A client's email arrives with a much larger attachment than the destination platform normally allows. What do you check?", options: ["Assume the attachment was silently and safely dropped with no trace", "Assume this can never actually happen, so it must be a reporting error", "Assume the file was automatically compressed with no data lost", "Whether there's a defined way this oversized item is being flagged for review, rather than assuming it just fits or vanishes quietly"], correct: 3 },
  { category: 'flow', body: "A client says some of their protected/legal-hold email seems to be missing after the move. What do you explain?", options: ["Tell them protected email is always fully guaranteed to move exactly like normal mail", "Tell them protected email can never be moved under any circumstances", "Assume the client is mistaken and no explanation is needed", "Explain that protected content sometimes needs special handling or permission to read/move, and that's worth checking specifically for this case"], correct: 3 },
]

async function main() {
  const testTitle = process.env.TEST_TITLE || 'Email Migration Assessment'
  const aptitudeBankName = process.env.APTITUDE_BANK_NAME || 'Freshers Assessment 1'
  const processPick = Number(process.env.PROCESS_PICK) || 6
  const technicalPick = Number(process.env.TECHNICAL_PICK) || 6
  const flowPick = Number(process.env.FLOW_PICK) || 8
  const durationMin = Number(process.env.DURATION_MIN) || 30

  const aptiBank = await prisma.questionBank.findFirst({ where: { name: aptitudeBankName } })
  if (!aptiBank) throw new Error(`Bank "${aptitudeBankName}" not found — needed to resolve tenant/admin.`)
  const tenantId = aptiBank.tenantId

  const admin = await prisma.user.findFirst({
    where: { tenantId, role: { in: ['SUPER_ADMIN', 'COMPANY_ADMIN'] } },
    orderBy: { createdAt: 'asc' },
  })
  if (!admin) throw new Error('No admin user found for the tenant.')

  let bank = await prisma.questionBank.findFirst({ where: { name: EMAIL_MIGRATION_BANK_NAME, tenantId } })
  if (!bank) {
    bank = await prisma.questionBank.create({ data: { name: EMAIL_MIGRATION_BANK_NAME, tenantId, description: 'Email/mailbox migration engineering reasoning MCQ pool — 7 process, 9 technical, 9 flow-driven troubleshooting questions. First-draft pool (not yet validated against documented CloudFuze Email workflow).' } })
  }

  let created = 0
  let updated = 0
  for (let i = 0; i < EMAIL_MIGRATION_QUESTIONS.length; i++) {
    const title = `Email Migration Q${i + 1}`
    const q = EMAIL_MIGRATION_QUESTIONS[i]
    const optionsData = q.options.map((text, idx) => ({ text, isCorrect: idx === q.correct, order: idx }))
    const existing = await prisma.question.findFirst({ where: { bankId: bank.id, title }, include: { options: { orderBy: { order: 'asc' } } } })

    if (!existing) {
      await prisma.question.create({
        data: {
          bankId: bank.id, type: 'MCQ_SINGLE', title, body: q.body,
          difficulty: 'MEDIUM', points: 1, domain: 'Email Migration Engineering', tags: [q.category],
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
  console.log(`Email Migration bank: ${created} created, ${updated} updated (simplified wording/category), ${EMAIL_MIGRATION_QUESTIONS.length - created - updated} unchanged.`)

  // Matched against this script's exact current titles (Q1..Q25), not a broad
  // prefix — a prior 50-question version of this pool left 25 now-unused
  // "Email Migration Q..." rows in the bank (kept, not deleted, so any
  // historical candidate answers against them stay valid); a startsWith match
  // would silently pull those back into the active pool.
  const expectedTitles = EMAIL_MIGRATION_QUESTIONS.map((_, i) => `Email Migration Q${i + 1}`)
  const questionsByTitle = new Map(
    (await prisma.question.findMany({ where: { bankId: bank.id, title: { in: expectedTitles } }, select: { id: true, title: true } }))
      .map(q => [q.title, q])
  )
  const questions = expectedTitles.map(title => questionsByTitle.get(title)!).filter(Boolean)
  const totalPick = processPick + technicalPick + flowPick

  const instructions = `Email Migration Assessment — ${durationMin} minutes, ${totalPick} questions (${processPick} process, ${technicalPick} technical, ${flowPick} troubleshooting — same mix for everyone), 1 mark each. Choose the best option.`

  let test = await prisma.test.findFirst({ where: { title: testTitle, tenantId } })
  if (!test) {
    test = await prisma.test.create({
      data: {
        title: testTitle, domain: 'Email Migration Engineering', duration: durationMin,
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
      testId: test.id, title: 'Email Migration Engineering', skill: 'GENERAL', order: 0, timeLimit: durationMin * 60,
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
  main().catch(e => { console.error('❌ create-email-migration-assessment failed:', e); process.exit(1) }).finally(() => prisma.$disconnect())
}
