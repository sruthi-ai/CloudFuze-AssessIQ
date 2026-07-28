/**
 * Create/rebuild "Content Migration Assessment":
 *   20 questions in 30 minutes, 20 marks — a category-balanced draw from a
 *   curated 30-question content-migration pool: 10 process (sequence/
 *   dependency), 8 technical (how the system is built), 12 flow
 *   (troubleshooting scenarios). Every candidate gets the same 6 process + 6
 *   technical + 8 flow mix (stratified pickStrata draw), not pure random
 *   luck — see backend/src/routes/sessions.ts's pickStrata handling.
 *
 * Rewritten (v2) in plain, short language after real candidate feedback that
 * the original wording was too dense for entry-level candidates — same
 * underlying concepts and correct answers, simpler sentences and everyday
 * words, distractors still plausible (not a pure giveaway).
 *
 * Trimmed (v3) from the original 50-question pool down to a curated 30 —
 * 20 questions removed by manual review (including one, "calendar-style
 * meeting data," that didn't belong in a content-migration assessment at
 * all). The draw size (6/6/8 = 20 per candidate) is unchanged; only the
 * source pool per category shrank (15/15/20 -> 10/8/12), still comfortably
 * above the draw counts.
 *
 * Idempotent — safe to re-run: existing questions are UPDATED in place if
 * their body/options/category changed (matched by title), not skipped, so
 * re-running this script after an edit actually applies the edit. The test's
 * section is still cleanly rebuilt each run so pool/strata config stays in
 * sync, without touching unrelated tests or the question bank identity.
 * The 20 removed questions' rows are left in the bank untouched (not
 * deleted, so any historical candidate answers against them stay valid) —
 * the pool query below matches an explicit list of this script's current
 * titles, not a broad prefix match, so those orphaned rows are never pulled
 * back into the active test.
 *
 *   docker exec -w /app neutaraassessment-backend-1 npx tsx prisma/create-content-migration-assessment.ts
 *
 * Env overrides: TEST_TITLE (default "Content Migration Assessment"),
 *                APTITUDE_BANK_NAME (default "Freshers Assessment 1" — used only
 *                to resolve the tenant/admin, not as a question source),
 *                PROCESS_PICK/TECHNICAL_PICK/FLOW_PICK (defaults 6/6/8),
 *                DURATION_MIN (default 30).
 */
import { PrismaClient, TestStatus } from '@prisma/client'
const prisma = new PrismaClient()

export const CONTENT_MIGRATION_BANK_NAME = 'Content Migration Questions Bank'

type Category = 'process' | 'technical' | 'flow'
export const CONTENT_MIGRATION_QUESTIONS: { body: string; options: string[]; correct: number; category: Category }[] = [
  // ── PROCESS (10) — sequence and dependency ──────────────────────────────
  { category: 'process', body: "Why does the destination folder need to exist before its files can move there?", options: ["The folder is the \"container\" the files go into — it has to exist first", "Files move in alphabetical order after the folder is indexed", "An admin must approve the folder before any file can enter it", "Files move first, then the folder is created around them"], correct: 0 },
  { category: 'process', body: "Why does the system find all the files first, then move them later — instead of moving each file the moment it's found?", options: ["Finding files and moving files are different jobs — doing them separately lets many files move at once", "Moving files right away would break the cloud provider's rules", "The system needs the total file size upfront before moving anything", "Files found later are treated as less important and get skipped"], correct: 0 },
  { category: 'process', body: "A client's small files finish moving before the big files, even though everything started at the same time. Is that normal?", options: ["No — every file should take the same amount of time", "Yes — big files move in chunks, which is naturally slower than moving small files in one go", "No — this means the small files went to the wrong account", "Yes, but only because big files are always moved last"], correct: 1 },
  { category: 'process', body: "Why do file permissions (who can access what) only start moving after most of the files have already moved?", options: ["Permission systems need a warm-up period before they accept requests", "Permissions for admins move first, then everyone else's", "A permission needs its file to already exist at the new location before it can be attached to it", "This is just a random delay, unrelated to file movement"], correct: 2 },
  { category: 'process', body: "What's the real difference between a \"one-time\" move and an ongoing \"delta\" move?", options: ["One-time only moves folders; delta only moves files", "One-time copies everything as of right now; delta keeps copying just the new changes afterward", "Delta is just a faster version of one-time, nothing else changes", "One-time needs the source turned off right after; delta doesn't"], correct: 1 },
  { category: 'process', body: "Why does a folder that fails to move also stop everything inside it from moving?", options: ["This is a manual safety step a person applies case by case", "Only folders with many files are blocked this way", "This only happens between two accounts on the same platform", "The files inside need their folder to already exist at the new location first"], correct: 3 },
  { category: 'process', body: "A client asks if their migration is \"done\" once every file shows as moved. Is file-moving alone the right way to check?", options: ["Yes — file-moving is the only thing that matters", "\"Done\" also needs the client to check every file by hand", "No — permissions and link-fixing happen afterward and still need to finish too", "File-moving already includes permissions and links"], correct: 2 },
  { category: 'process', body: "Why does checking for links inside a file happen as its own separate step, not while the file is being copied?", options: ["Link-checking must happen before the file can be copied at all", "Checking for links means reading what's inside the file, which is different work than just copying it", "Combining the two would break most cloud providers' rules", "Link-checking is optional and only done if a client pays extra"], correct: 1 },
  { category: 'process', body: "Why is the final report only created after permissions AND links are also finished, not right when the files are done moving?", options: ["The report is delayed just to give time for a person to proofread it", "The report only ever covers file-moving; permissions and links get separate reports", "A report made too early would be wrong — it needs to reflect the true, final state", "Reports are made on a fixed weekly schedule, unrelated to progress"], correct: 2 },
  { category: 'process', body: "Why would migrating collaboration/sharing settings need to check both the source and destination, not just read the source?", options: ["Checking the destination alone is enough; the source is only checked for record-keeping", "This double-check is only needed between different cloud providers", "The goal is to find what's missing at the destination — checking only the source risks adding permissions that are already there, causing duplicates", "This check exists only to build the client-facing report"], correct: 2 },

  // ── TECHNICAL (8) — how the system is built ─────────────────────────────
  { category: 'technical', body: "How do you think the system keeps track of what still needs to move, across millions of files, without checking every single one constantly?", options: ["A single counter that goes up as things finish, with no per-file detail", "It likely keeps a status per file/folder (not started / in progress / done / failed) that it checks instead of rescanning everything", "A live connection kept open per file for the whole migration", "Rescanning the source and destination fully before every check"], correct: 1 },
  { category: 'technical', body: "Why would the system likely use two different methods for moving small files vs. very large files?", options: ["Small and large files are actually handled identically; it's just labeled differently", "Large files are always moved by a person, not the system", "Two methods exist only because of a size limit per request", "Different methods suit different sizes — this way a slowdown in one doesn't necessarily slow down the other"], correct: 3 },
  { category: 'technical', body: "Why would the system likely wait until content, permissions, AND links are all finished before making the report, instead of just using a timer?", options: ["Timers are avoided only to save on server costs", "The report is secretly made on a timer, just hidden from the client", "This only applies to very large migrations", "A timer can't guarantee the job is actually done — it has to wait for a real \"everything finished\" signal"], correct: 3 },
  { category: 'technical', body: "Why does the system wait a bit longer before each retry attempt, instead of retrying immediately every time?", options: ["Waiting longer is required by a licensing rule", "Retrying instantly could make the problem worse (like hitting a limit harder); waiting gives it time to clear up", "The wait time is random, not increasing", "The wait only exists to reduce how often the dashboard refreshes"], correct: 1 },
  { category: 'technical', body: "Why does the system eventually stop retrying a failure, instead of trying forever?", options: ["Retries stop only once the client's storage is full", "Retrying forever is actually the goal; stopping is a mistake in the system", "A failure that keeps happening won't fix itself no matter how many times it's retried — better to flag it for a person", "It only ever retries once, no matter the type of failure"], correct: 2 },
  { category: 'technical', body: "Why might the system skip re-copying a file that already matches exactly at the destination?", options: ["It always re-copies every file, every time, to be safe", "It only skips files if a person tells it to", "Once skipped, that file is never checked again, ever", "Comparing first avoids wasted work and the risk of overwriting something that's already correct"], correct: 3 },
  { category: 'technical', body: "Why would a report show \"skipped (already there)\" and \"failed\" as two separate results, instead of lumping them together?", options: ["The difference is only useful for internal metrics, not for the client", "They're really the same thing, just with different labels", "They mean very different things — skipped needs no action, failed needs to be looked into", "Skipped items are just failed items that fixed themselves later"], correct: 2 },
  { category: 'technical', body: "Why does the system compare what permissions already exist at the destination, instead of just copying every source permission over?", options: ["This comparison is only for creating a report, not for actually deciding what to copy", "Copying permissions directly is technically impossible between two cloud platforms", "The source's permission list is usually broken, so this fills in the gaps", "Some permissions may already be there in some form — copying blindly risks duplicates or conflicts"], correct: 3 },

  // ── FLOW (12) — troubleshooting scenarios ───────────────────────────────
  { category: 'flow', body: "A client says their migration has been running for 10 hours and looks stuck at the same number. What do you check first?", options: ["Whether the count is truly frozen over time, or just moving slowly through a big batch of large files", "Restart the whole migration from scratch immediately", "Check only the client's internet speed — that's always the cause", "Assume it failed and send the client a report right away"], correct: 0 },
  { category: 'flow', body: "A folder shows as \"done,\" but none of the files inside it show up at the destination. What's your first guess?", options: ["The destination account must be out of storage", "Folder status and file status can be separate — check the actual files' own status", "The folder was processed to a different account by mistake", "The folder must have been deleted from the source mid-move"], correct: 1 },
  { category: 'flow', body: "Permissions didn't carry over for one file, but the file itself moved just fine. What's your first check?", options: ["Whether the file name has unusual characters in it", "Whether that permission truly existed on its own at the source (not just inherited from a folder), and if a matching account exists at the destination", "Whether the file used a different move type than usual", "Whether the destination account has enough storage left"], correct: 1 },
  { category: 'flow', body: "95% of similar files moved fine, but a few show as \"conflict.\" How do you start figuring out why?", options: ["Assume the whole system is down and escalate right away", "Re-run the entire migration to see if it happens again", "Check the client's timezone setting", "Look at the specific reason attached to those few files — the cause is likely specific to them, not a system-wide issue"], correct: 3 },
  { category: 'flow', body: "A big migration has shown zero movement for several hours — not just \"slow,\" but flat. What's your next step?", options: ["Confirm it's truly stuck (not just a big, slow batch) — if so, this is worth escalating for real", "Tell the client this is completely normal and do nothing", "Cancel and restart from a brand-new setup immediately", "Assume the percentage shown is just a display bug"], correct: 0 },
  { category: 'flow', body: "A client insists they've been adding files, but a check for new changes says \"nothing found.\" What do you check?", options: ["Assume the client is simply wrong and move on", "Whether that check actually ran recently, and whether it's still working through deeper folders", "Check only whether their files are too big for this type of check", "Restart the full one-time move instead of looking into it"], correct: 1 },
  { category: 'flow', body: "A client thinks their migration is \"finished\" because file-moving hit 100%, but still sees activity afterward. What do you tell them?", options: ["Tell them the report must be broken", "Tell them 100% file-moving does mean fully done, no more explanation needed", "File-moving finishing isn't the same as the whole job finishing — permissions and links still run afterward", "Tell them the extra activity is unrelated background work"], correct: 2 },
  { category: 'flow', body: "A client's IT team switched their system access off and back on in the middle of a migration. What should you check once access is back?", options: ["What was actively moving at that exact moment — it may need a manual check or retry", "Assume the whole migration needs to restart from zero", "Assume nothing was affected since access is back now", "Assume only folders were affected, not files"], correct: 0 },
  { category: 'flow', body: "A client says their file count looks much higher than they expected. What do you check before assuming it's a bug?", options: ["Assume the system is counting every file twice", "Whether hidden or extra items (older versions, system files, etc.) are being counted in the total", "Assume the client must correct their estimate in writing first", "Assume two migration jobs got started for the same account by accident"], correct: 1 },
  { category: 'flow', body: "A client asks why permissions are taking much longer to move than the files did. What do you check?", options: ["Whether their internet slowed down specifically during this part", "Whether the files actually finished, despite showing 100%", "Whether they have an unusually large number of people with access — comparing permissions takes more work per item than a plain copy", "Whether permissions are being sent to the wrong account"], correct: 2 },
  { category: 'flow', body: "A client using an exported file (instead of a live connection) says their move looks \"frozen\" partway through. What's different about checking this?", options: ["Troubleshoot it exactly like a live-connection migration", "This depends on the client's exported file itself — check whether that file is complete and correct, since there's no live connection to check instead", "Assume the file doesn't matter and check only the destination", "Assume exported-file migrations can never get stuck, so it must be a display bug"], correct: 1 },
  { category: 'flow', body: "A client's report shows some files \"done\" and others \"still waiting\" for a long time, with no conflicts anywhere. What do you tell them?", options: ["Tell them anything waiting a long time is quietly failing", "Tell them waiting files were deliberately left for last by the client", "Files usually move in batches at once — a big remaining batch just means they're waiting their turn, not that anything failed", "Tell them only one file can move at a time, ever"], correct: 2 },
]

async function main() {
  const testTitle = process.env.TEST_TITLE || 'Content Migration Assessment'
  const aptitudeBankName = process.env.APTITUDE_BANK_NAME || 'Freshers Assessment 1'
  const processPick = Number(process.env.PROCESS_PICK) || 6
  const technicalPick = Number(process.env.TECHNICAL_PICK) || 6
  const flowPick = Number(process.env.FLOW_PICK) || 8
  const durationMin = Number(process.env.DURATION_MIN) || 30

  // Only used to resolve the tenant/admin — this test's questions are entirely its own pool.
  const aptiBank = await prisma.questionBank.findFirst({ where: { name: aptitudeBankName } })
  if (!aptiBank) throw new Error(`Bank "${aptitudeBankName}" not found — needed to resolve tenant/admin.`)
  const tenantId = aptiBank.tenantId

  const admin = await prisma.user.findFirst({
    where: { tenantId, role: { in: ['SUPER_ADMIN', 'COMPANY_ADMIN'] } },
    orderBy: { createdAt: 'asc' },
  })
  if (!admin) throw new Error('No admin user found for the tenant.')

  let bank = await prisma.questionBank.findFirst({ where: { name: CONTENT_MIGRATION_BANK_NAME, tenantId } })
  if (!bank) {
    bank = await prisma.questionBank.create({ data: { name: CONTENT_MIGRATION_BANK_NAME, tenantId, description: 'Content migration engineering reasoning MCQ pool — 10 process, 8 technical, 12 flow-driven troubleshooting questions.' } })
  }

  let created = 0
  let updated = 0
  for (let i = 0; i < CONTENT_MIGRATION_QUESTIONS.length; i++) {
    const title = `Content Migration Q${i + 1}`
    const q = CONTENT_MIGRATION_QUESTIONS[i]
    const optionsData = q.options.map((text, idx) => ({ text, isCorrect: idx === q.correct, order: idx }))
    const existing = await prisma.question.findFirst({ where: { bankId: bank.id, title }, include: { options: { orderBy: { order: 'asc' } } } })

    if (!existing) {
      await prisma.question.create({
        data: {
          bankId: bank.id, type: 'MCQ_SINGLE', title, body: q.body,
          difficulty: 'MEDIUM', points: 1, domain: 'Content Migration Engineering', tags: [q.category],
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
  console.log(`Content Migration bank: ${created} created, ${updated} updated (simplified wording/category), ${CONTENT_MIGRATION_QUESTIONS.length - created - updated} unchanged.`)

  // Matched against this script's exact current titles (Q1..Q30), not a broad
  // prefix — a prior 50-question version of this pool left 20 now-unused
  // "Content Migration Q31".."Q50" rows in the bank (kept, not deleted, so any
  // historical candidate answers against them stay valid); a startsWith match
  // would silently pull those back into the active pool.
  const expectedTitles = CONTENT_MIGRATION_QUESTIONS.map((_, i) => `Content Migration Q${i + 1}`)
  const questionsByTitle = new Map(
    (await prisma.question.findMany({ where: { bankId: bank.id, title: { in: expectedTitles } }, select: { id: true, title: true } }))
      .map(q => [q.title, q])
  )
  const questions = expectedTitles.map(title => questionsByTitle.get(title)!).filter(Boolean)
  const totalPick = processPick + technicalPick + flowPick

  const instructions = `Content Migration Assessment — ${durationMin} minutes, ${totalPick} questions (${processPick} process, ${technicalPick} technical, ${flowPick} troubleshooting — same mix for everyone), 1 mark each. Choose the best option.`

  let test = await prisma.test.findFirst({ where: { title: testTitle, tenantId } })
  if (!test) {
    test = await prisma.test.create({
      data: {
        title: testTitle, domain: 'Content Migration Engineering', duration: durationMin,
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
      testId: test.id, title: 'Content Migration Engineering', skill: 'GENERAL', order: 0, timeLimit: durationMin * 60,
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
  main().catch(e => { console.error('❌ create-content-migration-assessment failed:', e); process.exit(1) }).finally(() => prisma.$disconnect())
}
