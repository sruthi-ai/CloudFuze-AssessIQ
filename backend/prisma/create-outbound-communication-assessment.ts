/**
 * Create/rebuild "Outbound - Communication Assessment":
 *   25 minutes, 4 sections — General English (10/15 MCQ, 7 min), Listen &
 *   Answer — Sales Calls (1 of 5 random cold/warm-call passages, 5 questions
 *   each, 6 min), Sales Objection Handling / JAM-style (1 of 15 prompts,
 *   6 min), and a Written Sales Follow-up (1 of 8 scenarios, 6 min).
 *
 * Rewritten (v2) for an outbound SALES role rather than inbound customer
 * support — every scenario (listening, objection handling, written) is now a
 * prospect/sales-call situation (cold calls, price objections, stalling,
 * competitor pressure) instead of a complaint/support ticket. General English
 * keeps the same 15-question pool but with harder, more plausible distractors.
 *
 * The customer-facing questions here are tagged SALES_TAG so aiGrading.ts
 * scores them on rapport/tone, discovery & value fit, objection handling, and
 * closing orientation — i.e. how the response would actually move a real
 * sales conversation forward — instead of the customer-service rubric (which
 * this assessment used before the v2 rewrite) or the platform's default
 * communication-ability-only / IELTS-writing rubric. See aiGrading.ts.
 *
 * Idempotent — safe to re-run: existing questions are UPDATED in place (body/
 * options/tags/audio diffed against this script, matched by title, so
 * editing this script and re-running actually applies the edit) rather than
 * skipped. The Listen & Answer passages keep their ORIGINAL internal name
 * slots (via legacyName) even though the content changed from support
 * complaints to sales calls — that preserves the same Question/AudioAsset
 * ids across the rewrite, so historical candidate answers/results from the
 * v1 (customer-support) version of this test stay valid, and audio is only
 * regenerated when its script actually changed. The test's sections are
 * still cleanly rebuilt each run so pool sizes/timing always match this
 * script.
 *
 *   docker exec -w /app neutaraassessment-backend-1 npx tsx prisma/create-outbound-communication-assessment.ts
 *
 * Env overrides: TEST_TITLE (default "Outbound - Communication Assessment"),
 *                APTITUDE_BANK_NAME (default "Freshers Assessment 1" — used only
 *                to resolve the tenant/admin, not as a question source).
 */
import { PrismaClient, TestStatus } from '@prisma/client'
import OpenAI from 'openai'
import { writeFile } from 'fs/promises'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

const prisma = new PrismaClient()
const UPLOADS_DIR = process.env.UPLOADS_DIR ?? join(process.cwd(), 'uploads')
mkdirSync(join(UPLOADS_DIR, 'audio-assets'), { recursive: true })

export const OUTBOUND_BANK_NAME = 'Outbound Communication Questions Bank'
// Tags a question for the outbound-sales AI rubric (see aiGrading.ts) instead
// of the platform's default communication-ability-only / IELTS-writing rubric.
export const SALES_TAG = 'sales-rubric'

// ── Section 1: General English (grammar/prepositions) ──────────────────────
// Harder than v1: distractors are now in the same tense/preposition "family"
// as the correct answer (plausible near-misses) instead of obviously wrong
// words, so guessing is harder without changing question count or topics.
export const GENERAL_ENGLISH_QUESTIONS: { body: string; options: string[]; correct: number }[] = [
  { body: 'She _____ to the store every Sunday morning.', options: ['go', 'goes', 'has gone', 'going'], correct: 1 },
  { body: 'By the time we arrived, the meeting _____ already started.', options: ['has', 'have', 'had', 'would have'], correct: 2 },
  { body: "I'm looking forward _____ you next week.", options: ['to see', 'to seeing', 'seeing', 'having seen'], correct: 1 },
  { body: 'He has been working here _____ 2019.', options: ['for', 'since', 'during', 'within'], correct: 1 },
  { body: 'The report _____ reviewed by the manager before it is sent out.', options: ['is', 'was', 'has been', 'will be'], correct: 0 },
  { body: 'Could you please explain _____ this happened, rather than simply how it was fixed?', options: ['why', 'how', 'what', 'which'], correct: 0 },
  { body: 'They _____ finished the project by Friday, according to the current plan.', options: ['will finish', 'will have finished', 'have finished', 'had finished'], correct: 1 },
  { body: "I'm not interested _____ that offer, though I appreciate you asking.", options: ['in', 'on', 'about', 'with'], correct: 0 },
  { body: 'If I _____ known earlier, I would have told you immediately.', options: ['had', 'have', 'would have', 'having'], correct: 0 },
  { body: 'She is responsible _____ managing the team, not just supporting it.', options: ['for', 'of', 'in', 'to'], correct: 0 },
  { body: 'The customer complained _____ the delayed delivery for the third time this month.', options: ['about', 'of', 'for', 'over'], correct: 0 },
  { body: 'We need to look _____ this issue immediately, before it affects other accounts.', options: ['into', 'at', 'over', 'through'], correct: 0 },
  { body: "He apologized _____ the inconvenience caused, though the delay wasn't really his fault.", options: ['for', 'about', 'over', 'of'], correct: 0 },
  { body: 'I would appreciate it if you _____ respond soon, ideally before the end of the day.', options: ['could', 'would', 'can', 'should'], correct: 0 },
  { body: 'The issue has _____ resolved successfully, according to the latest update.', options: ['been', 'be', 'being', 'was'], correct: 0 },
]

// ── Section 2: Listen & Answer — Sales Calls (5 passages × 5 questions) ────
// `legacyName`/`legacyTitlePrefix` point at this passage's v1 (customer-support)
// name so the existing AudioAsset/Question rows get renamed-and-updated in
// place rather than orphaned — preserving ids for any historical answers.
type SalesCallPassage = { name: string; legacyName: string; script: string }
export const SALES_CALL_PASSAGES: SalesCallPassage[] = [
  {
    name: 'Outbound Listening — Cold Call, Busy Prospect',
    legacyName: 'Outbound Listening — Late Delivery',
    script: "Hi, sorry, who is this again? I'm right in the middle of something. Look, I get calls like this every single day, so I really don't have much time right now. If this is a sales call, I'll be honest, we're not looking to buy anything new this quarter. But if you can make it quick, go ahead, I'm listening.",
  },
  {
    name: 'Outbound Listening — Warm Lead Considering a Competitor',
    legacyName: 'Outbound Listening — Billing Discrepancy',
    script: "Hi, yes, I remember you reaching out before. I'll be upfront with you, I've actually been talking to one of your competitors as well, and their price came in a bit lower than what we discussed. I'm not against working with you, but I need a real reason to pick you over them.",
  },
  {
    name: 'Outbound Listening — Budget Timing Objection',
    legacyName: 'Outbound Listening — Product Not Working',
    script: "Honestly, I like what your product does, our team could really use something like this. The problem is timing, we don't have budget approved for anything new until next quarter. I don't want to waste your time if this isn't going to go anywhere before then.",
  },
  {
    name: 'Outbound Listening — Needs Team Sign-Off',
    legacyName: 'Outbound Listening — Cancellation Request',
    script: "This all sounds fine on paper. But I'm not the only person involved, I'd need to check with my team before committing to anything. Every time we bring in something new like this, it takes weeks to get everyone on the same page, so I can't promise anything soon.",
  },
  {
    name: 'Outbound Listening — Skeptical Referral Lead',
    legacyName: 'Outbound Listening — Repeated Unresolved Issue',
    script: "So, a friend of mine mentioned your company and said I should hear you out, that's honestly the only reason I picked up. I'll admit, I don't love being sold to, so if this turns into some big pitch, I'm probably going to lose interest fast.",
  },
]
// Same 5-question progression applies to whichever passage is randomly picked.
export const SALES_CALL_QUESTIONS = [
  'How would you open your response to keep this person on the call instead of losing them right away?',
  'What would you ask to understand what they actually need or care about, before pitching anything?',
  'How would you explain the value of what you\'re offering in a way that connects to what they just said?',
  'They push back again with more resistance. How do you handle that without sounding pushy or defensive?',
  "How would you close this call with a concrete next step, even if they don't commit to buying today?",
]

// ── Section 3: Sales Objection Handling (JAM-style, pick 1 of N) ───────────
export const OBJECTION_PROMPTS: string[] = [
  "A prospect says: \"Your price is a lot higher than what I've seen elsewhere.\" Respond as you would on a call.",
  "A prospect says: \"Can you just send me something over email instead?\" Respond as you would on a call.",
  "A prospect says: \"We already have a vendor for this.\" Respond as you would on a call.",
  "A prospect says: \"Call me back next quarter, we're not ready right now.\" Respond as you would on a call.",
  "A prospect says: \"I need to think about it and get back to you.\" Respond as you would on a call.",
  "A prospect says: \"Honestly, I don't have time for this right now.\" Respond as you would on a call.",
  "A prospect says: \"How is this actually different from what everyone else is selling?\" Respond as you would on a call.",
  "A prospect says: \"I've been burned by a vendor promising this before, why should I trust you?\" Respond as you would on a call.",
  "A prospect says: \"I'm not the one who makes this decision.\" Respond as you would on a call.",
  "A prospect says: \"This feels like a lot of change for our team right now.\" Respond as you would on a call.",
  "A prospect says: \"What happens if this doesn't work out for us?\" Respond as you would on a call.",
  "A prospect says: \"We tried something similar before and it didn't go well.\" Respond as you would on a call.",
  "A prospect says: \"Just to be clear, is this a sales call?\" Respond as you would on a call.",
  "A prospect says: \"I like it, but I don't want to commit to a long contract.\" Respond as you would on a call.",
  "A prospect says: \"Your competitor already reached out and offered a better deal.\" Respond as you would on a call.",
]

// ── Section 4: Written Sales Follow-up (pick 1 of N, ESSAY) ────────────────
export const WRITTEN_SCENARIOS: string[] = [
  "A prospect you spoke with last week hasn't responded to your last email. Write a brief, friendly follow-up email that re-engages them without being pushy, and proposes a next step.",
  "You just finished a promising discovery call with a prospect who seemed genuinely interested but didn't commit to anything. Write a follow-up email summarizing the value discussed and proposing a clear next step.",
  "A prospect told you on a call that your price is higher than a competitor's. Write a follow-up email that addresses the price concern and reinforces your value.",
  "A prospect said they need to check with their team before deciding. Write a follow-up email that keeps momentum going and offers to help them make the case internally.",
  "A warm lead went quiet after a promising call three weeks ago. Write a re-engagement email that doesn't feel like a generic nag.",
  "A prospect asked you to \"just send some information\" instead of getting on a call. Write an email that provides real value while still working toward a next conversation.",
  "You just closed a deal with a new customer. Write a warm welcome/next-steps email to start the relationship off well.",
  "A prospect said they're happy with their current vendor but agreed to \"stay in touch.\" Write a low-pressure follow-up email that keeps the door open for the future.",
]

async function generateAudio(client: OpenAI, script: string): Promise<string> {
  const speech = await client.audio.speech.create({
    model: 'gpt-4o-mini-tts',
    voice: 'alloy',
    input: script,
    instructions: 'Speak as a real sales prospect on a phone call — natural, conversational American English, a mix of mild interest and mild resistance depending on the line, suitable for a listening comprehension exercise.',
    response_format: 'mp3',
  }, { timeout: 30_000 })
  const buffer = Buffer.from(await speech.arrayBuffer())
  const filename = `${randomUUID()}.mp3`
  await writeFile(join(UPLOADS_DIR, 'audio-assets', filename), buffer)
  return `/uploads/audio-assets/${filename}`
}

export async function main() {
  const testTitle = process.env.TEST_TITLE || 'Outbound - Communication Assessment'
  const aptitudeBankName = process.env.APTITUDE_BANK_NAME || 'Freshers Assessment 1'

  const aptiBank = await prisma.questionBank.findFirst({ where: { name: aptitudeBankName } })
  if (!aptiBank) throw new Error(`Bank "${aptitudeBankName}" not found — needed to resolve tenant/admin.`)
  const tenantId = aptiBank.tenantId

  const admin = await prisma.user.findFirst({
    where: { tenantId, role: { in: ['SUPER_ADMIN', 'COMPANY_ADMIN'] } },
    orderBy: { createdAt: 'asc' },
  })
  if (!admin) throw new Error('No admin user found for the tenant.')

  let bank = await prisma.questionBank.findFirst({ where: { name: OUTBOUND_BANK_NAME, tenantId } })
  if (!bank) {
    bank = await prisma.questionBank.create({ data: { name: OUTBOUND_BANK_NAME, tenantId, description: 'Outbound sales communication assessment — grammar, sales-call listening, objection handling, written sales follow-up.' } })
  }

  // ── Section 1 questions: General English (create-or-update) ───────────────
  let englishCreated = 0, englishUpdated = 0
  for (let i = 0; i < GENERAL_ENGLISH_QUESTIONS.length; i++) {
    const title = `Outbound English Q${i + 1}`
    const q = GENERAL_ENGLISH_QUESTIONS[i]
    const optionsData = q.options.map((text, idx) => ({ text, isCorrect: idx === q.correct, order: idx }))
    const existing = await prisma.question.findFirst({ where: { bankId: bank.id, title }, include: { options: { orderBy: { order: 'asc' } } } })

    if (!existing) {
      await prisma.question.create({
        data: {
          bankId: bank.id, type: 'MCQ_SINGLE', title, body: q.body,
          difficulty: 'MEDIUM', points: 1, domain: 'General English',
          options: { create: optionsData },
        },
      })
      englishCreated++
      continue
    }
    const optionsChanged = existing.options.length !== optionsData.length
      || existing.options.some((o, idx) => o.text !== optionsData[idx]?.text || o.isCorrect !== optionsData[idx]?.isCorrect)
    if (existing.body !== q.body || optionsChanged) {
      if (optionsChanged) await prisma.questionOption.deleteMany({ where: { questionId: existing.id } })
      await prisma.question.update({
        where: { id: existing.id },
        data: { body: q.body, options: optionsChanged ? { create: optionsData } : undefined },
      })
      englishUpdated++
    }
  }
  console.log(`General English: ${englishCreated} created, ${englishUpdated} updated, ${GENERAL_ENGLISH_QUESTIONS.length - englishCreated - englishUpdated} unchanged.`)

  // ── Section 2 questions + audio: Listen & Answer — Sales Calls ─────────────
  // Same key resolution as aiGrading.ts: the tenant's UI-configured key
  // (Settings page) takes priority over the server's raw env var — in
  // production that's where the real key actually lives.
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } })
  const tenantSettings = (tenant?.settings as Record<string, unknown> | null) ?? {}
  const tenantKey = typeof tenantSettings.openaiApiKey === 'string' ? tenantSettings.openaiApiKey.trim() : ''
  const apiKey = tenantKey || process.env.OPENAI_API_KEY
  let client: OpenAI | null = null
  let listenCreated = 0, listenUpdated = 0

  for (const passage of SALES_CALL_PASSAGES) {
    let asset = await prisma.audioAsset.findFirst({ where: { name: passage.name, tenantId } })
    if (!asset) asset = await prisma.audioAsset.findFirst({ where: { name: passage.legacyName, tenantId } })

    if (!asset) {
      if (!apiKey) throw new Error('OPENAI_API_KEY is not configured — cannot generate sales-call audio.')
      if (!client) client = new OpenAI({ apiKey })
      console.log(`Generating audio for "${passage.name}"...`)
      const url = await generateAudio(client, passage.script)
      asset = await prisma.audioAsset.create({
        data: {
          name: passage.name, url, sourceType: 'TTS_GENERATED', accent: 'American English', voice: 'alloy',
          transcript: passage.script, playLimit: 2, tenantId,
        },
      })
      console.log(`  -> created audio asset ${asset.id}`)
    } else if (asset.name !== passage.name || asset.transcript !== passage.script) {
      if (!apiKey) throw new Error('OPENAI_API_KEY is not configured — cannot regenerate sales-call audio.')
      if (!client) client = new OpenAI({ apiKey })
      console.log(`Regenerating audio for "${passage.name}" (script changed from legacy)...`)
      const url = await generateAudio(client, passage.script)
      asset = await prisma.audioAsset.update({ where: { id: asset.id }, data: { name: passage.name, url, transcript: passage.script } })
    } else {
      console.log(`Audio asset "${passage.name}" unchanged — skipping generation.`)
    }

    const titleBase = passage.name.replace('Outbound Listening — ', 'Outbound Listen — ')
    const legacyTitleBase = passage.legacyName.replace('Outbound Listening — ', 'Outbound Listen — ')
    for (let i = 0; i < SALES_CALL_QUESTIONS.length; i++) {
      const title = `${titleBase} Q${i + 1}`
      const body = SALES_CALL_QUESTIONS[i]
      let question = await prisma.question.findFirst({ where: { bankId: bank.id, title } })
      if (!question) question = await prisma.question.findFirst({ where: { bankId: bank.id, title: `${legacyTitleBase} Q${i + 1}` } })

      const tags = ['listening', SALES_TAG]
      if (!question) {
        await prisma.question.create({
          data: {
            bankId: bank.id, type: 'AUDIO_RECORDING', title, body,
            difficulty: 'MEDIUM', points: 1, prepSeconds: 10, speakSeconds: 60,
            tags, domain: 'Sales', audioAssetId: asset.id,
          },
        })
        listenCreated++
        continue
      }
      const tagsChanged = JSON.stringify(question.tags ?? []) !== JSON.stringify(tags)
      if (question.title !== title || question.body !== body || question.audioAssetId !== asset.id || question.domain !== 'Sales' || tagsChanged) {
        await prisma.question.update({
          where: { id: question.id },
          data: { title, body, audioAssetId: asset.id, domain: 'Sales', tags },
        })
        listenUpdated++
      }
    }
  }
  console.log(`Listen & Answer: ${listenCreated} created, ${listenUpdated} updated (across ${SALES_CALL_PASSAGES.length} passages).`)

  // ── Section 3 questions: Sales Objection Handling (JAM-style, create-or-update) ──
  let jamCreated = 0, jamUpdated = 0
  for (let i = 0; i < OBJECTION_PROMPTS.length; i++) {
    const title = `Outbound JAM Q${i + 1}`
    const body = OBJECTION_PROMPTS[i]
    const tags = ['speaking', SALES_TAG]
    const existing = await prisma.question.findFirst({ where: { bankId: bank.id, title } })
    if (!existing) {
      await prisma.question.create({
        data: { bankId: bank.id, type: 'AUDIO_RECORDING', title, body, difficulty: 'MEDIUM', points: 5, prepSeconds: 10, speakSeconds: 60, tags, domain: 'Sales' },
      })
      jamCreated++
      continue
    }
    const tagsChanged = JSON.stringify(existing.tags ?? []) !== JSON.stringify(tags)
    if (existing.body !== body || existing.domain !== 'Sales' || tagsChanged) {
      await prisma.question.update({ where: { id: existing.id }, data: { body, domain: 'Sales', tags } })
      jamUpdated++
    }
  }
  console.log(`Objection Handling: ${jamCreated} created, ${jamUpdated} updated.`)

  // ── Section 4 questions: Written Sales Follow-up (create-or-update) ────────
  let writtenCreated = 0, writtenUpdated = 0
  for (let i = 0; i < WRITTEN_SCENARIOS.length; i++) {
    const title = `Outbound Written Q${i + 1}`
    const body = WRITTEN_SCENARIOS[i]
    const tags = ['writing', SALES_TAG]
    const existing = await prisma.question.findFirst({ where: { bankId: bank.id, title } })
    if (!existing) {
      await prisma.question.create({
        data: { bankId: bank.id, type: 'ESSAY', title, body, difficulty: 'MEDIUM', points: 10, tags, domain: 'Sales' },
      })
      writtenCreated++
      continue
    }
    const tagsChanged = JSON.stringify(existing.tags ?? []) !== JSON.stringify(tags)
    if (existing.body !== body || existing.domain !== 'Sales' || tagsChanged) {
      await prisma.question.update({ where: { id: existing.id }, data: { body, domain: 'Sales', tags } })
      writtenUpdated++
    }
  }
  console.log(`Written Follow-up: ${writtenCreated} created, ${writtenUpdated} updated.`)

  // ── Test + sections ────────────────────────────────────────────────────────
  const englishQuestions = await prisma.question.findMany({ where: { bankId: bank.id, title: { startsWith: 'Outbound English Q' } }, orderBy: { createdAt: 'asc' }, select: { id: true } })
  const listenQuestions = await prisma.question.findMany({ where: { bankId: bank.id, title: { startsWith: 'Outbound Listen — ' } }, orderBy: { createdAt: 'asc' }, select: { id: true } })
  const jamQuestions = await prisma.question.findMany({ where: { bankId: bank.id, title: { startsWith: 'Outbound JAM Q' } }, orderBy: { createdAt: 'asc' }, select: { id: true } })
  const writtenQuestions = await prisma.question.findMany({ where: { bankId: bank.id, title: { startsWith: 'Outbound Written Q' } }, orderBy: { createdAt: 'asc' }, select: { id: true } })

  const instructions = `Outbound - Communication Assessment — 25 minutes. Section 1 (General English): a random 10 of ${englishQuestions.length} grammar questions, 7 minutes. Section 2 (Listen & Answer — Sales Calls): listen to one sales call (randomly chosen) and answer 5 questions about how you'd handle it, 6 minutes. Section 3 (Sales Objection Handling): respond to one randomly chosen prospect objection, 6 minutes. Section 4 (Written Sales Follow-up): write a follow-up email for one randomly chosen sales scenario, 6 minutes. Speak/write as you would with a real prospect — we assess rapport, discovery, objection handling, and closing orientation.`

  let test = await prisma.test.findFirst({ where: { title: testTitle, tenantId } })
  if (!test) {
    test = await prisma.test.create({
      data: {
        title: testTitle, domain: 'Sales', duration: 25,
        status: TestStatus.DRAFT, proctoring: true, enforceViolations: false, sebRequired: false,
        tenantId, createdById: admin.id, instructions,
      },
    })
    console.log(`created test "${testTitle}"`)
  } else {
    const secs = await prisma.testSection.findMany({ where: { testId: test.id } })
    for (const s of secs) await prisma.testQuestion.deleteMany({ where: { sectionId: s.id } })
    await prisma.testSection.deleteMany({ where: { testId: test.id } })
    await prisma.test.update({ where: { id: test.id }, data: { duration: 25, domain: 'Sales', instructions } })
    console.log(`rebuilt existing test "${testTitle}"`)
  }

  const englishSection = await prisma.testSection.create({
    data: { testId: test.id, title: 'General English', skill: 'READING', order: 0, timeLimit: 7 * 60, pickCount: 10,
      description: `10 questions (randomly drawn from a bank of ${englishQuestions.length}) covering grammar, tenses, and prepositions. 1 mark each.` },
  })
  await prisma.testQuestion.createMany({ data: englishQuestions.map((q, i) => ({ testId: test!.id, sectionId: englishSection.id, questionId: q.id, order: i, points: 1 })) })

  const listenSection = await prisma.testSection.create({
    data: { testId: test.id, title: 'Listen & Answer — Sales Calls', skill: 'LISTENING', order: 1, timeLimit: 6 * 60, pickCount: 5, pickGroupSize: 5,
      description: `Listen to one randomly chosen sales call (of ${SALES_CALL_PASSAGES.length}) and record a spoken response to each of 5 questions. Assessed on rapport, discovery, objection handling, and closing orientation, not accent.` },
  })
  await prisma.testQuestion.createMany({ data: listenQuestions.map((q, i) => ({ testId: test!.id, sectionId: listenSection.id, questionId: q.id, order: i, points: 1 })) })

  const jamSection = await prisma.testSection.create({
    data: { testId: test.id, title: 'Sales Objection Handling', skill: 'SPEAKING', order: 2, timeLimit: 6 * 60, pickCount: 1,
      description: `You'll get one randomly chosen prospect objection (of ${jamQuestions.length}). Think for a few seconds, then respond as you would on a real call.` },
  })
  await prisma.testQuestion.createMany({ data: jamQuestions.map((q, i) => ({ testId: test!.id, sectionId: jamSection.id, questionId: q.id, order: i, points: 5 })) })

  const writtenSection = await prisma.testSection.create({
    data: { testId: test.id, title: 'Written Sales Follow-up', skill: 'WRITING', order: 3, timeLimit: 6 * 60, pickCount: 1,
      description: `You'll get one randomly chosen sales scenario (of ${writtenQuestions.length}). Write a professional, persuasive follow-up email.` },
  })
  await prisma.testQuestion.createMany({ data: writtenQuestions.map((q, i) => ({ testId: test!.id, sectionId: writtenSection.id, questionId: q.id, order: i, points: 10 })) })

  console.log(`\n✅ "${testTitle}": General English 10/${englishQuestions.length} (7min) + Listen&Answer 5/${listenQuestions.length} (1 of ${SALES_CALL_PASSAGES.length} passages, 6min) + Objection Handling 1/${jamQuestions.length} (6min) + Written Follow-up 1/${writtenQuestions.length} (6min). 25 min total. Status DRAFT — publish it in the admin UI to use.`)
}

if (require.main === module) {
  main().catch(e => { console.error('❌ create-outbound-communication-assessment failed:', e); process.exit(1) }).finally(() => prisma.$disconnect())
}
