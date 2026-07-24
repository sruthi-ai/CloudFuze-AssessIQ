/**
 * Create/rebuild "Message Migration Assessment":
 *   20 questions in 30 minutes, 20 marks — a category-balanced draw from a
 *   50-question message-migration pool: 15 process (sequence/dependency),
 *   15 technical (how the system is built), 20 flow (troubleshooting
 *   scenarios). Every candidate gets the same 6 process + 6 technical + 8
 *   flow mix (stratified pickStrata draw), not pure random luck — see
 *   backend/src/routes/sessions.ts's pickStrata handling.
 *
 * Rewritten (v2) in plain, short language after real candidate feedback that
 * the original wording was too dense for entry-level candidates — same
 * underlying concepts and correct answers, simpler sentences and everyday
 * words, distractors still plausible (not a pure giveaway).
 *
 * Idempotent — safe to re-run: existing questions are UPDATED in place if
 * their body/options/category changed (matched by title), not skipped, so
 * re-running this script after an edit actually applies the edit. The test's
 * section is still cleanly rebuilt each run so pool/strata config stays in
 * sync, without touching unrelated tests or the question bank identity.
 *
 *   docker exec -w /app neutaraassessment-backend-1 npx tsx prisma/create-message-migration-assessment.ts
 *
 * Env overrides: TEST_TITLE (default "Message Migration Assessment"),
 *                APTITUDE_BANK_NAME (default "Freshers Assessment 1" — used only
 *                to resolve the tenant/admin, not as a question source),
 *                PROCESS_PICK/TECHNICAL_PICK/FLOW_PICK (defaults 6/6/8),
 *                DURATION_MIN (default 30).
 */
import { PrismaClient, TestStatus } from '@prisma/client'
const prisma = new PrismaClient()

export const MESSAGE_MIGRATION_BANK_NAME = 'Message Migration Questions Bank'

type Category = 'process' | 'technical' | 'flow'
export const MESSAGE_MIGRATION_QUESTIONS: { body: string; options: string[]; correct: number; category: Category }[] = [
  // ── PROCESS (15) — sequence and dependency ──────────────────────────────
  { category: 'process', body: "Why must a destination channel or DM exist before any messages can move into it?", options: ["Messages get posted regardless of whether a destination exists", "Messages need somewhere real to be posted into — you can't post to something that isn't there yet", "Channel setup is only about record-keeping, not actual posting", "The channel is created automatically the moment a message is posted"], correct: 1 },
  { category: 'process', body: "Why does a DM only need basic account info at setup, not a full \"channel\" the way a channel needs?", options: ["A DM secretly uses a hidden channel too, just not shown in the UI", "A DM is just a private chat between people — there's no group/channel object being created, just a link between the people", "DM setup is simpler only because DMs are always moved last", "This is only about following privacy rules, not about structure"], correct: 1 },
  { category: 'process', body: "If a parent message fails to move, what happens to its replies?", options: ["Replies move on their own, unaffected by the parent", "Replies turn into new stand-alone top-level messages", "Replies wait forever until an admin deletes the failed parent", "Replies also fail or don't get attempted — a reply needs its parent to exist first"], correct: 3 },
  { category: 'process', body: "If a parent message moves fine but one specific reply fails, is that connected to the parent?", options: ["Yes — one failed reply always means the parent must move again", "Yes — reply failures always trace back to the parent losing its link", "No — once the parent is fine, each reply succeeds or fails on its own", "No, but only for channels — replies in DMs always match the parent's result"], correct: 2 },
  { category: 'process', body: "Why does moving replies need its own separate step, after the main messages are already moved?", options: ["Replies are moved first, then matched to parents afterward", "A reply needs to be linked back to its parent, which may only be possible once all the parent messages in that channel are already moved", "This step only exists to shrink the size of the first request", "This step is only needed when moving between two different platforms"], correct: 1 },
  { category: 'process', body: "Why does closing out a Microsoft Teams \"Team\" need all of its channels to be closed first?", options: ["Teams and channels close completely on their own, with no link between them", "A Team is just a container for its channels — if channels underneath are still open, the Team can't really be called finished yet", "Closing a Team automatically force-closes every channel inside it", "This rule only applies to Teams with a large number of channels"], correct: 1 },
  { category: 'process', body: "Why is \"copying who has access\" usually only done for channels, and not for DMs?", options: ["DMs can't be moved at all, so there's nothing to copy", "Channels have a membership list similar to what's being copied; DMs are just private one-to-one chats with no such list", "It actually is done for DMs too, just under a different name", "Channels were picked first at random — DM support may come later"], correct: 1 },
  { category: 'process', body: "Why does copying access rights need to match a source person to a destination person, instead of just copying the name over?", options: ["Matching by name is disallowed only for legal reasons", "This matching is only needed if both platforms use the same login system", "The source and destination are different systems — the same person may have a different account on each, so a match has to be found first", "The source account is always reused exactly as-is"], correct: 2 },
  { category: 'process', body: "What should happen if no matching destination account can be found for someone who had access at the source?", options: ["A generic shared account is given access instead", "That person is silently left out, with no record of it", "The whole channel's access-copying is cancelled completely", "It should be flagged as a gap to sort out — not guessed or silently skipped"], correct: 3 },
  { category: 'process', body: "Why would a platform like Viva Engage need files uploaded BEFORE the message that mentions them is posted?", options: ["This is true for every messaging platform, not just Viva", "This only applies to very large files", "File order doesn't actually matter for posting a message", "Viva's own posting system may need the file to already exist before the message can reference it — a platform-specific requirement"], correct: 3 },
  { category: 'process', body: "Why are messages fetched from the source in one step, then posted to the destination in a separate step?", options: ["Doing both at once is technically impossible across platforms", "This separation exists only to satisfy a compliance record", "Fetching and posting are combined by default for large channels", "Each step can be retried or checked on its own — a posting problem doesn't mean you have to re-fetch everything again"], correct: 3 },
  { category: 'process', body: "Why might a client need a file-export option, instead of only a live connection, to move their messages?", options: ["Export is always faster, so it's simply the better default", "This only matters for very small message counts", "Some setups don't allow full live access (security rules, limited access, company policy) — an exported file lets the move happen from that file instead", "Export-based moving is an old option nobody actually uses anymore"], correct: 2 },
  { category: 'process', body: "Why does the system need to find out what channels and DMs exist BEFORE it starts fetching any messages?", options: ["Finding channels and fetching messages always happen in one single request", "This step exists only to give the client a cost estimate", "You need the full list of channels/DMs first so you know where to fetch messages from at all", "Fetching messages can start early and simply retries later if needed"], correct: 2 },
  { category: 'process', body: "Why might a very busy channel take longer per message to move than a quiet channel, even with the same total number of messages?", options: ["Busy channels are always slowed down on purpose", "Time per message is always identical, no matter how busy the channel is", "Busy channels only take longer because of extra file attachments, never because of replies", "Busy channels usually have a lot more replies/threads, which adds extra work per message to check"], correct: 3 },
  { category: 'process', body: "Why would a client ask if their message timestamps (send times) stay the same after moving, and why does this matter?", options: ["Timestamps are never kept on any platform", "Whether the real send time is kept (instead of showing the move time) affects how the client reads their own message history — worth knowing for sure, not assuming", "Timestamps are always kept exactly, so this never needs checking", "This only matters for message length, not for the date shown"], correct: 1 },

  // ── TECHNICAL (15) — how the system is built ────────────────────────────
  { category: 'technical', body: "How would the system likely know if a reply is allowed to post yet, given that it depends on its parent message?", options: ["It only checks the reply's own time, not the parent at all", "It relies on the destination platform to block replies in the wrong order automatically", "It likely stores a link from the reply back to its parent, and checks the parent's status before posting the reply", "It doesn't track this — replies and parents post fully separately"], correct: 2 },
  { category: 'technical', body: "Why would a \"lock\" make sense for controlling which messages can move into a channel or thread at one time?", options: ["Locks mainly exist to stop duplicate billing", "Locks are only used for DMs, not channels", "Locks mostly control how often the dashboard refreshes", "It stops two processes from writing to the same conversation at once, which could otherwise mix up the message order"], correct: 3 },
  { category: 'technical', body: "How might the system tell a DM apart from a channel internally, so different retry rules can apply to each?", options: ["It probably tags each conversation by type when it's created, then applies rules based on that tag", "It counts the people in the conversation freshly, every single time", "It stores DMs and channels in two completely separate systems with no shared logic", "Retry rules are actually identical for both; any difference is a coincidence"], correct: 0 },
  { category: 'technical', body: "How would a lock-checking process know a lock is truly stuck, rather than just still being used normally?", options: ["It asks the process holding the lock directly if it's still active", "It likely uses a time limit — if a lock has been held far longer than any normal task should take, it's treated as stuck", "It assumes every lock is stuck after exactly one second", "It waits for the client to report a stuck lock manually"], correct: 1 },
  { category: 'technical', body: "Why would matching a source person to a destination person need to be saved and reused, instead of being looked up fresh every time?", options: ["Fresh look-ups are actually faster, so saving them is old and pointless", "Saving the match once avoids repeating the same look-up for the same person across many channels, and keeps it consistent", "This saving only happens to shrink the size of the client report", "Live look-ups are technically blocked by most platforms"], correct: 1 },
  { category: 'technical', body: "How would the system likely handle \"finding what to move\" and \"actually moving it\" as two separate steps for messages?", options: ["The two steps are actually merged for messages, unlike for files/folders", "Finding messages only applies to files, never to messages themselves", "This separation exists only to create two different client invoices", "Finding messages figures out what exists; the move step actually writes it to the destination — keeping them separate lets each be retried or watched on its own"], correct: 3 },
  { category: 'technical', body: "Why can a failed channel message often be retried automatically, but a failed DM usually cannot?", options: ["DMs are simply considered less important, so retries are skipped", "Order matters a lot in a private back-and-forth chat — retrying an out-of-order DM risks placing an older message after newer ones, visibly messing up the conversation", "Channel messages are retried only because channels have unlimited storage", "DMs can't be retried due to an unrelated messaging limit"], correct: 1 },
  { category: 'technical', body: "Why would the system limit how many times it retries a reply-syncing problem, instead of trying forever?", options: ["The limit exists only to control server costs", "Unlimited retries are technically not possible due to platform limits", "A problem that keeps happening won't fix itself no matter how many times it's retried — capping retries means a person can look into it instead", "Reply-sync problems are always allowed only one retry, by design"], correct: 2 },
  { category: 'technical', body: "Why would a message that gets edited AFTER it has already moved need special handling?", options: ["Edited messages are always skipped entirely and never moved", "Edits are applied to the destination copy instantly, with no need for any tracking", "An edit after moving is a real, separate change — the system needs a way to catch it later (like a follow-up check), or the moved copy stays out of date", "Edited messages always have to be moved again as a brand-new, unrelated message"], correct: 2 },
  { category: 'technical', body: "Why would @mentions of people need to be changed, not just copied as-is, when a message moves?", options: ["Mentions are just plain text and don't point to a real person", "Mentions are always removed completely during a move", "Changing mentions only affects how the message looks, not whether it works", "A mention usually links to a specific person's account on the source platform — without updating it, the mention would point to the wrong (or no) person at the destination"], correct: 3 },
  { category: 'technical', body: "Why might the system need to slow down how fast it posts messages to the destination, even if it's ready to send them faster?", options: ["Slowing down is done only to make migrations for bigger clients take longer", "Rate limits only apply to file uploads, never to posting messages", "The destination platform usually has its own limit on how many requests it accepts at once — posting faster than that limit causes errors, so the system has to pace itself", "The source platform's speed is the only thing that matters here"], correct: 2 },
  { category: 'technical', body: "If a message was deleted at the source after being found, but before it was actually moved, what should reasonably happen?", options: ["It should be moved anyway since it was already found and queued", "The whole channel's move should be cancelled because of one deleted message", "Deleted messages should always be replaced with a placeholder message", "The system should notice the message is gone and skip moving it, instead of posting content that no longer exists"], correct: 3 },
  { category: 'technical', body: "Why would emoji reactions on a message need to be handled only after the message itself has successfully moved?", options: ["Reactions move completely on their own, with no link to the message", "Reactions are always moved before the message, to save space for them", "Reactions are never moved, on any platform, under any circumstance", "A reaction is attached to a specific message — that message has to exist at the destination first before a reaction can be attached to it there"], correct: 3 },
  { category: 'technical', body: "Why does a workspace-level status stay \"not finished\" if even one channel underneath it is still in progress?", options: ["Workspace status is based only on how much time has passed, not on channels", "Workspace status has no real link to individual channels at all", "This rule only applies to workspaces with very few channels", "The overall status has to reflect the real situation — marking it \"finished\" while one part is still going would be misleading"], correct: 3 },
  { category: 'technical', body: "Why would a workspace be marked \"stuck/blocked\" specifically when its setup (source or destination connection) is missing, rather than just \"still working\"?", options: ["\"Stuck/blocked\" is only used when a client asks for a pause", "The two labels mean exactly the same thing", "Workspaces are marked this way automatically after a fixed number of days, regardless of the reason", "This label points out that something needs a person's attention to fix — leaving it as \"still working\" would hide that it can't move forward on its own"], correct: 3 },

  // ── FLOW (20) — troubleshooting scenarios ───────────────────────────────
  { category: 'flow', body: "A client says their Slack channel has been \"in progress\" for days with barely anything processed, and no errors are showing. What do you check first?", options: ["Immediately assume the channel is broken and needs to be recreated", "Check only the client's browser cache, since that's the usual cause", "Whether this channel has a lot of replies/threads adding extra work, versus it being genuinely stuck with zero movement", "Escalate to engineering immediately with no other checks"], correct: 2 },
  { category: 'flow', body: "A client asks why some of their DMs never came over, while all their channel messages moved fine. What's your first check?", options: ["Assume DMs simply aren't supported for this client's plan", "Assume the destination platform doesn't support DMs at all", "Check only whether the DMs were sent outside office hours", "Whether the failed DMs hit a real conflict — DMs don't retry automatically, so a DM failure stays failed until someone looks at it, unlike a channel message"], correct: 3 },
  { category: 'flow', body: "A Microsoft Teams \"Team\" won't close out, even though the client says every conversation is finished. What do you check?", options: ["Check only the Team's total message count against the client's guess", "Assume the Team itself is broken and needs to be recreated", "Check whether the client has admin rights on the destination Team", "The status of each individual channel inside that Team — if even one hasn't fully closed, the whole Team stays open"], correct: 3 },
  { category: 'flow', body: "A client's replies show as \"conflict,\" but the original messages show as moved successfully. What's the likely cause?", options: ["Assume the parent message needs to be moved again to fix the replies", "Assume this always means the whole thread is broken and needs a full restart", "Assume the replies are duplicates and check for extra parent copies instead", "Since the parent worked, the reply issue is probably its own separate problem — check that specific reply's error, not the parent"], correct: 3 },
  { category: 'flow', body: "A client insists their delta (ongoing) sync should have picked up messages sent right before a scheduled check. What do you check?", options: ["Assume the messages went to the wrong channel by mistake", "Assume delta sync is broken and switch permanently to a full one-time move", "Check only whether the client's account has the right license", "Whether delta actually ran recently enough to catch those messages — a timing gap right at the edge is very different from delta being broken"], correct: 3 },
  { category: 'flow', body: "Messages in a channel appear to post in the wrong order compared to when they were actually sent. What do you look into?", options: ["Assume this is only ever a display issue, nothing really reordered", "Assume this only happens moving from one specific platform to another", "Assume the client's local timezone is always the cause", "Whether this is a DM (where order matters most and retries are avoided to protect it) versus a channel where a retry might have shifted something"], correct: 3 },
  { category: 'flow', body: "A client on Viva Engage says message counts look stuck while file upload counts keep rising. Is this a problem?", options: ["Yes — counts should always rise together, no matter the platform", "Yes — this always means the message queue quietly failed", "No — but only because Viva doesn't track messages properly", "Not necessarily — Viva needs files uploaded before their message posts, so file progress moving while message progress briefly lags is expected"], correct: 3 },
  { category: 'flow', body: "A client's workspace status shows \"stuck/blocked.\" What's your first question or check?", options: ["Check only if their payment method has expired", "Assume another engineer paused it and wait for them to resume it", "Assume it failed permanently and must restart from zero", "Whether the source or destination connection/setup is actually missing or broken for that workspace — that's specifically what this status flags"], correct: 3 },
  { category: 'flow', body: "A client's final report shows \"processed with some conflicts\" instead of a clean pass, even though most messages look fine to them. What do you tell them?", options: ["Tell them the label is just a system default and means nothing", "Tell them \"with conflicts\" and \"clean\" mean the same thing", "Tell them to ignore the report and trust their own quick check instead", "Explain what's actually still in conflict — the label reflects a real, smaller set of unresolved items, not the whole migration"], correct: 3 },
  { category: 'flow', body: "A client's shared channel membership at the destination doesn't match who had access at the source. What do you check first?", options: ["Assume the destination has a hard cap on how many members a channel can have", "Assume membership was lost due to a random network glitch", "Assume the source never tracked membership correctly", "Whether every source member actually had a matching destination account found — anyone missing that match is a real, explainable gap"], correct: 3 },
  { category: 'flow', body: "A client using an exported file (instead of a live connection) says their messages look \"frozen\" partway through. What's different here?", options: ["Troubleshoot it exactly the same as a live-connection move", "Assume the export file doesn't matter, only check the destination side", "Assume export-based moves can never get stuck, so it's a display bug", "This depends on the client's export file itself — check whether that file is complete and correct, since there's no live source to fall back on"], correct: 3 },
  { category: 'flow', body: "A client says their message move is \"done,\" but they still see access/sharing updates happening afterward. Is this expected?", options: ["No — this always means the \"done\" report was wrong", "No — access updates should only ever happen before messages, never after", "Yes, but only for clients using an exported file", "Yes — closing out and copying access is a separate step that comes after messages finish, so this is normal"], correct: 3 },
  { category: 'flow', body: "A client's admin turned system access off and back on in the middle of a move, for a security review. What should you check once access is back?", options: ["Assume the whole move needs to be re-scoped from scratch", "Assume only messages were affected, since channels use a separate access grant", "Assume access being back means everything resumed perfectly on its own", "What was actively being moved at the exact moment access was cut — those specific items may need a manual look or retry"], correct: 3 },
  { category: 'flow', body: "A client asks why some messages show \"conflict\" while almost all similar messages moved fine. What's your approach?", options: ["Assume a system-wide outage and escalate right away", "Re-run the entire move to see if the same messages fail again", "Check the client's timezone setting first", "Look at the specific reason attached to those few conflicting messages — since most succeeded, the cause is likely specific to them"], correct: 3 },
  { category: 'flow', body: "A large message-moving job shows zero movement for several hours, unlike a normal slow-but-moving job. What's your next step?", options: ["Tell the client it's totally normal for large jobs and do nothing", "Cancel and restart the whole job from a fresh setup immediately", "Assume the percentage shown is just a display bug", "Confirm whether it's truly flat with no movement at all — if so, this is a real stuck job worth escalating"], correct: 3 },
  { category: 'flow', body: "A client on a path-based platform like Dropbox says files they renamed at the source aren't showing the new name at the destination during sync. What's the likely issue?", options: ["Assume the client's plan doesn't support renaming at all", "Assume the destination blocks renamed items on purpose", "Assume it just needs 24 more hours with no other check", "Path-based platforms can read a rename as \"old item gone, new item appeared\" instead of an actual in-place rename — check if that's what's happening"], correct: 3 },
  { category: 'flow', body: "A client's report shows a much higher message count than they expected. What do you check before assuming it's a bug?", options: ["Assume the report is counting every message twice", "Assume the client's own estimate must be corrected in writing first", "Assume two separate move jobs were started by accident", "Whether hidden items (message versions, system messages, etc.) are being counted — systems often surface more than a client's rough estimate"], correct: 3 },
  { category: 'flow', body: "A client asks why copying access/permissions is taking much longer than moving the messages did. What do you check?", options: ["Check whether their internet connection slowed specifically during this part", "Check whether the messages actually finished, despite showing 100%", "Check whether access is being copied to the wrong account", "Whether there's an unusually large number of members/collaborators — comparing access takes more work per item than a plain message copy"], correct: 3 },
  { category: 'flow', body: "A client wants to confirm that messages deleted at the source before the move are being handled correctly, not just silently causing errors. What do you explain?", options: ["Tell them deleted messages always cause the whole job to stop", "Tell them deleted messages are impossible to detect, so nothing can be promised", "Tell them deleted messages are converted into a placeholder automatically", "Explain that the system checks for this and skips a message that's no longer there, rather than posting something that doesn't exist anymore"], correct: 3 },
  { category: 'flow', body: "A client is confused why some emoji reactions on older messages didn't carry over. What's the likely explanation?", options: ["Reactions are never supported by any messaging platform's migration", "Reactions always move before the message, so timing shouldn't matter", "Reactions are permanently excluded on every platform, no exceptions", "A reaction needs its message to already exist at the destination — if that specific message didn't fully move, its reactions wouldn't carry over either"], correct: 3 },
]

async function main() {
  const testTitle = process.env.TEST_TITLE || 'Message Migration Assessment'
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

  let bank = await prisma.questionBank.findFirst({ where: { name: MESSAGE_MIGRATION_BANK_NAME, tenantId } })
  if (!bank) {
    bank = await prisma.questionBank.create({ data: { name: MESSAGE_MIGRATION_BANK_NAME, tenantId, description: 'Message migration engineering reasoning MCQ pool — 15 process, 15 technical, 20 flow-driven troubleshooting questions.' } })
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

  const questions = await prisma.question.findMany({
    where: { bankId: bank.id, title: { startsWith: 'Message Migration Q' } },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
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
