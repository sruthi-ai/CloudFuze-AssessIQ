/**
 * Create/rebuild "Email Migration Assessment":
 *   20 questions in 30 minutes, 20 marks — a category-balanced draw from a
 *   50-question email/mailbox-migration pool: 15 process (sequence/
 *   dependency), 15 technical (how the system is built), 20 flow
 *   (troubleshooting scenarios). Every candidate gets the same 6 process +
 *   6 technical + 8 flow mix (stratified pickStrata draw), not pure random
 *   luck — see backend/src/routes/sessions.ts's pickStrata handling.
 *
 * Rewritten (v2) in plain, short language after real candidate feedback that
 * the original wording was too dense for entry-level candidates — same
 * underlying concepts and correct answers, simpler sentences and everyday
 * words, distractors still plausible (not a pure giveaway).
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
  // ── PROCESS (15) — sequence and dependency ──────────────────────────────
  { category: 'process', body: "Why does a mailbox move usually process folders (Inbox, Sent, Drafts, etc.) mostly on their own, not in one strict order?", options: ["Folders must always finish in alphabetical order", "Folders are separate collections of email with no real link between them — so they can move independently without anything being wrong", "This only happens because Trash and Spam are skipped by default", "Folders depend on each other the same way a parent folder depends on a file inside it"], correct: 1 },
  { category: 'process', body: "A pair shows Inbox, Sent, and Drafts as \"done,\" but Trash is still waiting, and the whole pair is only partway done. Is that a problem?", options: ["Yes — every folder must finish in the order it appears", "Yes — Trash lagging always means the mailbox is broken", "Not really — folders don't block each other, so one lagging behind while others finish is normal", "It's fine, but only because Trash is always left for last on purpose"], correct: 2 },
  { category: 'process', body: "Why does moving email usually need both a \"one-time\" move and an ongoing \"delta\" move?", options: ["One-time only moves folders; delta only moves individual emails", "One-time copies everything as of right now; delta then keeps catching new or changed email afterward, right up until the final switch-over", "Delta only exists to make the invoice smaller", "One-time and delta are really the same thing, just named differently"], correct: 1 },
  { category: 'process', body: "Why might a client need delta to keep running for weeks after the one-time move is done, instead of just running one-time again later?", options: ["One-time can technically only ever be run once", "Delta only exists to satisfy a paperwork requirement", "Running one-time again means starting over completely, which is slow — delta only grabs what's changed since the last check", "Running one-time again would actually be faster, but nobody bothers"], correct: 2 },
  { category: 'process', body: "Why does moving email usually need admin-level permission, rather than each person logging in themselves?", options: ["Each person's own login is actually required in addition to admin access", "Admin access is only needed for calendar and contacts, not email itself", "This is purely a billing checkpoint, not really about access", "Moving hundreds or thousands of mailboxes one login at a time isn't realistic — an admin-level grant lets the tool act across the whole company at once"], correct: 3 },
  { category: 'process', body: "What happens, logically, if admin access is turned off partway through a mailbox move?", options: ["The whole job gets permanently deleted the moment access is turned off", "Anything already finished should stay fine, but anything that was actively depending on that access can't continue until it's restored", "Everything already moved gets automatically undone", "Turning access off mid-move has no effect at all"], correct: 1 },
  { category: 'process', body: "Why might calendar and contacts move on a different timeline than the actual email, for the same person?", options: ["Calendar and contacts are always moved only after 100% of email is done", "A timeline difference always means the calendar or contacts are broken", "These are often handled as separate pieces of data, so they can progress at their own pace, even for the same account", "Calendar, contacts, and email always move through the exact same process, so there should never be a difference"], correct: 2 },
  { category: 'process', body: "Why does a shared mailbox need different handling than a personal one, even if all its email moved over fine?", options: ["Shared mailboxes need no different handling — access always moves automatically with the email", "Shared mailboxes are treated exactly like personal ones on every platform", "The email moving fine doesn't mean who-else-has-access also moved — that's a separate thing that needs its own check", "Shared access is just a display setting with no real effect on the move"], correct: 2 },
  { category: 'process', body: "Why might matching an old folder (like \"Archive\") to a new one sometimes need to be set up by hand, instead of happening automatically?", options: ["Folder matching is always automatic no matter the platform", "This is only needed for Trash and Spam, never other folders", "Old and new systems don't always have folders with the same name or structure — setting the match by hand avoids emails landing in the wrong place", "Folder matching is just a cosmetic renaming option"], correct: 2 },
  { category: 'process', body: "Why might \"done\" for a folder not fully guarantee that every single email inside it actually landed correctly?", options: ["\"Done\" is a perfect guarantee with no room for individual issues", "Folder status usually rolls up many individual email results — a few could still have quietly failed and need their own check", "Folder status only reflects the very first email in that folder", "Any single email failing always flips the whole folder back to \"waiting\""], correct: 1 },
  { category: 'process', body: "Why does moving email usually keep the exact original send/received date, instead of stamping everything with today's date?", options: ["Dates are always changed to today's date for record-keeping", "Keeping the original date has no real effect on the user", "Original dates are only kept for Sent items, never Inbox", "Email is basically a timeline for the user — losing the real date would break how they search and sort their own history"], correct: 3 },
  { category: 'process', body: "Why might \"Sent\" and \"Drafts\" need slightly different handling than \"Inbox,\" even though they're just more folders?", options: ["Sent and Drafts are actually never moved — only Inbox and Trash are supported", "These folders use a completely separate, unrelated system from Inbox", "There's no real difference; every folder is handled identically in every case", "Sent/Drafts can involve small details (like draft state, or who's the sender vs. receiver) that are a bit different from a normal received email"], correct: 3 },
  { category: 'process', body: "Why might spam/junk and trash sometimes be treated as lower priority, or skipped, in some move setups?", options: ["Spam and trash are technically impossible to move on any platform", "These folders are always moved first, ahead of Inbox", "This content usually isn't something the client needs kept long-term, so some clients choose to skip or deprioritize it to save time", "Skipping these folders is always forced by the system, never a client's choice"], correct: 2 },
  { category: 'process', body: "Why does a move tool double-check final counts between source and destination after everything shows \"complete,\" instead of just trusting the process worked?", options: ["This check is only for the invoice, not a real check", "A process that shows no errors is always guaranteed to be fully correct", "This check only looks at folder names, not actual email counts", "It catches quiet gaps — something that looked fine but didn't actually land, or got missed entirely — before calling the job truly done"], correct: 3 },
  { category: 'process', body: "Why would a client ask if their original folder structure stays exactly the same, instead of being reorganized during the move?", options: ["Folder structure is always flattened into one single folder by default", "Keeping search working is the only reason structure matters, so this barely matters", "People build habits around their folder structure — keeping it the same (unless asked otherwise) avoids breaking how they actually work", "Keeping the same structure is technically impossible between two different platforms"], correct: 2 },

  // ── TECHNICAL (15) — how the system is built ────────────────────────────
  { category: 'technical', body: "How would the system likely track progress across many folders in one mailbox, without redoing work that's already finished?", options: ["It rescans every folder completely, every single time it checks status", "It likely keeps a status per folder/item (not started / in progress / done / failed), so already-finished work doesn't need to be repeated", "It only tracks status for the whole mailbox, with no per-folder detail", "It relies on the client to mark folders as done by hand"], correct: 1 },
  { category: 'technical', body: "Why would checking for new email changes likely need some kind of \"last checked\" marker, similar to how content-moving does it?", options: ["Without a marker, every check would have to rescan everything to find what's new", "Mail servers push every change automatically, so no marker is needed", "A marker is used only for a paperwork log, not for deciding what to check", "The system always rescans the whole mailbox regardless of any marker"], correct: 0 },
  { category: 'technical', body: "How would the system likely handle a mailbox with tons of tiny messages differently than one with fewer, much bigger messages?", options: ["Both types are handled with the exact same fixed batch size", "Big-message mailboxes are always handled one message at a time, with no batching", "It likely processes many small messages in batches at once, while big messages are more limited by their sheer size/transfer time per item", "A mailbox with more messages is always slower than one with bigger messages of the same total size"], correct: 2 },
  { category: 'technical', body: "Why would matching an old folder to a new one need to be worked out before moving any messages in that folder, rather than message-by-message?", options: ["Message-by-message matching is actually more efficient and is the usual approach", "Folder matching only happens after every message has already moved", "Every message in that folder goes to the same destination folder — working the match out once avoids repeating the same look-up for every single message", "This timing has no real effect on speed or correctness either way"], correct: 2 },
  { category: 'technical', body: "How might the system check that source and destination counts truly match, to confirm a move is really finished?", options: ["It declares the job done just because no errors were reported, without comparing counts", "It relies entirely on the client to manually count and confirm", "It only compares counts for the Inbox, not other folders", "It likely compares a final count of what successfully landed at the destination against what was found at the source, flagging any shortfall"], correct: 3 },
  { category: 'technical', body: "Why does admin-level permission make sense for moving thousands of mailboxes at once, instead of needing each person to log in?", options: ["Individual logins would actually be quicker to set up than one admin grant", "Admin access is only required for calendar data, not for mailboxes themselves", "This exists only to simplify billing, not to actually enable access", "At that scale, requiring every single person to separately log in isn't realistic — one admin-level grant is the only practical way to reach every mailbox"], correct: 3 },
  { category: 'technical', body: "Why might a client's inbox rules/filters (auto-sorting mail into folders) need to be checked separately, instead of assuming they \"just carry over\"?", options: ["Rules/filters are always embedded in every message, so they move automatically with the mail", "Rules and filters are never supported on any platform and can't be moved at all", "Rules only need re-creating for a shared mailbox, never a personal one", "Rules are usually a separate setting from the mail content itself — moving messages doesn't automatically recreate the rules for future incoming mail"], correct: 3 },
  { category: 'technical', body: "Why might a single message or attachment being too large for the destination's limit need special handling?", options: ["Size limits are exactly the same on every mail platform, so this never comes up", "Oversized items are always compressed automatically with no client involvement", "If something is too big to fit as-is, it can't just be silently dropped or assumed to fit — it needs a defined way to be flagged", "Size limits only ever apply to calendar invites, never regular email"], correct: 2 },
  { category: 'technical', body: "Why might \"out of office\" auto-reply settings need their own handling, instead of assuming they carry over automatically with the mailbox?", options: ["Auto-reply is automatically switched off for every move, by design", "Auto-reply is actually part of every single email message, so it moves with each one", "This setting has no real impact since it only affects mail arriving after the move", "Auto-reply is a mailbox setting, separate from the messages — if it's not specifically handled, someone could lose their active auto-reply during a busy transition period"], correct: 3 },
  { category: 'technical', body: "Why might a distribution list or shared team mailbox need different handling than one person's mailbox?", options: ["Distribution lists are functionally identical to a personal mailbox, with nothing extra to consider", "Group mailboxes can't be moved at all and must be manually recreated", "Membership always transfers automatically the instant any mail from the group moves", "A group mailbox usually has its own membership list and access rules — its mail moving fine doesn't guarantee that list also moved correctly"], correct: 3 },
  { category: 'technical', body: "Why might specially protected email (like something under legal hold) need different handling than normal email?", options: ["Protected email always moves exactly like normal email, with nothing extra to think about", "Protection is automatically removed from every message the moment a move starts", "Only calendar data can ever be protected, never regular email", "Protected content might not be readable or movable the normal way without the right permission or unlocking step — worth flagging as its own case"], correct: 3 },
  { category: 'technical', body: "Why might a client ask about an export-file option (instead of only a live connection) for moving their email, similar to other types of moves?", options: ["Export-based moving is always faster and should be the default choice", "This only ever applies to very large mailboxes", "Some environments don't allow full live access (security rules, decommissioned mailboxes, company policy) — an export file lets the move happen from that file instead", "Export-based options are an old idea nobody actually uses anymore"], correct: 2 },
  { category: 'technical', body: "Why does email formatting (fonts, images, layout) matter as part of the move, not just the plain text content?", options: ["Formatting is always stripped from every email as a standard part of moving", "Formatting only matters for Sent items, never for received mail", "Only plain text is ever shown by any mail app, so formatting is irrelevant", "A message that loses its formatting or images can look broken to the person reading it, even if the plain text technically came through fine"], correct: 3 },
  { category: 'technical', body: "Why does a mailbox move typically need to slow itself down (respecting rate limits), similar to other types of moves?", options: ["Slowing down is done only to intentionally make bigger clients wait longer", "Rate limits only ever apply to calendar data, never to email itself", "Mail platforms almost never have any request limits, so this is rarely a real concern", "Mail platforms usually have their own limits on how many requests they'll accept — moving faster than that risks getting blocked or slowed down even more"], correct: 3 },
  { category: 'technical', body: "Why might very large mailboxes (with lots of attachments) take much longer to move than the mailbox count alone would suggest?", options: ["Attachments are always moved in a completely separate job, after everything else finishes", "Attachment size only ever affects calendar data, not email folders", "How long a mailbox takes depends only on message count, never on attachment size", "Message count isn't the same as data volume — attachments add real transfer weight that a simple message-count comparison wouldn't capture"], correct: 3 },

  // ── FLOW (20) — troubleshooting scenarios ───────────────────────────────
  { category: 'flow', body: "A client's pair shows 8,000 of 65,000 emails done, with some folders already fully finished. Is this a problem?", options: ["Always concerning — anything under half-done should be escalated right away", "Not necessarily — check whether the remaining folders (like a big Inbox) explain most of what's left; only worry if progress has genuinely stopped", "Assume the count is wrong and recalculate it by hand first", "Assume the smaller, finished folders are secretly failing"], correct: 1 },
  { category: 'flow', body: "A client asks why their move shows \"in progress\" with no visible errors, but hasn't moved in several hours. What do you check first?", options: ["Restart the whole mailbox move from the very beginning", "Assume the mailbox is simply too large to ever finish and suggest splitting it", "Check only the client's internet connection, since that's always the cause", "Whether this is truly stuck (zero movement over time) versus just a large folder processing slowly, and whether access/authentication is still working"], correct: 3 },
  { category: 'flow', body: "A client's calendar events show up at the wrong time after moving. What do you check first?", options: ["Check only whether the client's computer clock is set correctly", "Assume the client edited the events by hand afterward", "Assume this is unrelated to the move and just a display issue in their calendar app", "Time zone handling specifically — this is a known trouble spot for calendar/date data"], correct: 3 },
  { category: 'flow', body: "A shared mailbox moved all its email successfully, but a second person who used to have access can no longer get in. What's your triage?", options: ["Assume the email move itself must have quietly failed for that person", "Assume that person's account was deleted at the destination", "Re-move the entire shared mailbox from scratch to fix the access issue", "Recognize this as a separate access/delegation gap — the email moving fine doesn't mean delegated access was also set up at the destination"], correct: 3 },
  { category: 'flow', body: "A client insists they had far fewer emails than the move is reporting. What do you check?", options: ["Assume the tool duplicated every message during the move", "Assume the client's original estimate must be corrected in writing first", "Assume a second mailbox got merged into this move by accident", "Whether hidden or extra items (older versions, system folders, etc.) are being counted in the total that the client didn't think to include"], correct: 3 },
  { category: 'flow', body: "A client's admin turned system access off and back on mid-move, for an internal security review. What should you check once access is restored?", options: ["Assume the entire move needs to be re-scoped and restarted from zero", "Assume only calendar data was affected, since email uses a separate access grant", "Assume access being back means everything resumed cleanly with no issues", "What was actively being processed at the exact moment access was cut — those specific items may need a manual check or retry"], correct: 3 },
  { category: 'flow', body: "One mailbox is taking dramatically longer than every other similarly-sized mailbox in the same batch. What's a reasonable first guess?", options: ["Assume the entire batch process is fundamentally broken", "Assume this mailbox was wrongly included and should be removed", "Assume alphabetical processing order is simply working against this one mailbox", "Consider real content differences — heavy attachments, unusually large folders, or one specific problem item — rather than assuming the whole batch is broken"], correct: 3 },
  { category: 'flow', body: "A client asks why delta sync seems to have \"missed\" some emails sent right before a scheduled sync run. What do you check?", options: ["Assume delta sync is fundamentally broken and switch to one-time moves permanently", "Assume the emails were sent to a folder delta never checks", "Assume the client's mail app cached an old view and ignore the report", "The actual timing of when delta last ran versus when those emails arrived — a narrow timing gap right at the edge is very different from delta being broken"], correct: 3 },
  { category: 'flow', body: "A client reports their read/unread status doesn't match after moving. What do you check, and how do you explain it?", options: ["Tell the client this is always fully guaranteed, so it must be a bug in their specific case", "Tell the client read/unread status is never trackable on any platform", "Assume the client is simply misremembering which emails they'd read", "Confirm whether preserving read/unread status is actually expected/supported for this setup at all, then explain based on that — not assumed"], correct: 3 },
  { category: 'flow', body: "A client's folder structure looks reorganized or flattened at the destination compared to the source. What's your first question?", options: ["Assume the destination can't support nested folders at all", "Assume this always means the move is broken and needs a full restart", "Assume the client reorganized their own folders after the move", "Whether folder matching was set up to preserve the exact structure, or whether some folders didn't have a direct match and got placed differently"], correct: 3 },
  { category: 'flow', body: "A client viewing an older bookmarked report link says it looks different from what your team sees internally. What do you check?", options: ["Assume the client's browser needs updating", "Assume their report link expired and start a brand-new job", "Assume the underlying data itself is actually different for them", "Whether they're viewing an older report page while your team is looking at a newer version — a real, explainable mismatch, not a data problem"], correct: 3 },
  { category: 'flow', body: "A client's pair shows every individual folder as \"done,\" but the overall pair status still says \"in progress.\" What do you check?", options: ["Assume this combination is impossible and must be a display bug", "Assume the move needs to be restarted since the two statuses conflict", "Assume the client is viewing a cached page and tell them to clear their cache", "Look for any folder not currently shown in the view, or a final check that runs after individual folders finish"], correct: 3 },
  { category: 'flow', body: "A client asks why their inbox rules (auto-sorting incoming mail into folders) don't seem to be working at the new mailbox. What do you explain?", options: ["Tell them rules always move automatically and this must be a bug", "Tell them rules can never be recreated on any platform", "Assume the client set the rules up wrong themselves", "Explain that rules/filters are a separate setting from the mail itself, and usually need to be explicitly recreated or migrated on their own"], correct: 3 },
  { category: 'flow', body: "A client's email arrives with a much larger attachment than the destination platform normally allows. What do you check?", options: ["Assume the attachment was silently and safely dropped with no trace", "Assume this can never actually happen, so it must be a reporting error", "Assume the file was automatically compressed with no data lost", "Whether there's a defined way this oversized item is being flagged for review, rather than assuming it just fits or vanishes quietly"], correct: 3 },
  { category: 'flow', body: "A client says their auto-reply (\"out of office\") stopped working right after the move. What's the likely explanation?", options: ["Assume auto-reply is always disabled automatically during any move, by design", "Assume auto-reply is part of every message and should have moved with the mail", "Assume this has nothing to do with the move at all", "Auto-reply is a mailbox setting, not part of the messages — if it wasn't specifically carried over or reconfigured, it can be lost during the transition"], correct: 3 },
  { category: 'flow', body: "A client asks why a shared team mailbox lost some member access after the move. What's your first check?", options: ["Assume the destination has a hard cap on mailbox membership size", "Assume access was lost due to a random network issue", "Assume the source never tracked membership correctly to begin with", "Whether every member from the source had a matching destination account found — anyone missing that match is a known, explainable gap"], correct: 3 },
  { category: 'flow', body: "A client says some of their protected/legal-hold email seems to be missing after the move. What do you explain?", options: ["Tell them protected email is always fully guaranteed to move exactly like normal mail", "Tell them protected email can never be moved under any circumstances", "Assume the client is mistaken and no explanation is needed", "Explain that protected content sometimes needs special handling or permission to read/move, and that's worth checking specifically for this case"], correct: 3 },
  { category: 'flow', body: "A client using an exported file (instead of a live connection) says their move looks \"frozen\" partway through. What's different about checking this?", options: ["Troubleshoot it exactly like a live-connection move, starting with API limits", "Assume the export file is irrelevant and only check the destination side", "Assume export-based moves can never get stuck, so it must be a display bug", "This depends on the client's export file itself — check whether that file is complete and correct, since there's no live source to fall back on"], correct: 3 },
  { category: 'flow', body: "A client's migrated emails read fine in plain text but lost all their formatting and embedded images. What do you explain?", options: ["Tell them formatting is always stripped as a standard, expected part of every move", "Tell them formatting only ever matters for Sent items", "Tell them this has no bearing on how the email looks to a reader", "Explain that formatting/image fidelity is a real part of \"did my email move correctly,\" and this is worth investigating, not brushing off as just text content"], correct: 3 },
  { category: 'flow', body: "A client asks why moving permissions/collaborator access is taking much longer than moving the actual emails. What do you check?", options: ["Check whether their internet connection slowed specifically during this phase", "Check whether the emails actually finished, despite showing 100%", "Check whether access is being sent to the wrong destination account", "Whether there's an unusually large number of people with access — comparing permissions takes more work per item than a plain email copy"], correct: 3 },
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
    bank = await prisma.questionBank.create({ data: { name: EMAIL_MIGRATION_BANK_NAME, tenantId, description: 'Email/mailbox migration engineering reasoning MCQ pool — 15 process, 15 technical, 20 flow-driven troubleshooting questions. First-draft pool (not yet validated against documented CloudFuze Email workflow).' } })
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

  const questions = await prisma.question.findMany({
    where: { bankId: bank.id, title: { startsWith: 'Email Migration Q' } },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
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
