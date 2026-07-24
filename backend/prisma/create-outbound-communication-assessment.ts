/**
 * Create/rebuild "Outbound - Communication Assessment":
 *   30 minutes, 4 sections — General English (10/15 MCQ), Listen & Answer —
 *   Customer Calls (1 of 5 random passages, 5 questions each), Customer
 *   Objection Handling / JAM-style (1 of 15 prompts), and a Written Customer
 *   Response (1 of 8 scenarios).
 *
 * Unlike the platform's other speaking/writing sections, the customer-facing
 * questions here are tagged CUSTOMER_SERVICE_TAG so aiGrading.ts scores them
 * on empathy/tone, professionalism, clarity, and resolution-orientation —
 * i.e. how the response would actually land with a customer — instead of the
 * default communication-ability-only (fluency/grammar) or IELTS-writing
 * rubric used everywhere else. See backend/src/services/aiGrading.ts.
 *
 * Idempotent — safe to re-run: questions/audio are only created if missing
 * (matched by title/name), and the test's sections are cleanly rebuilt each
 * run so pool sizes/timing always match this script, without regenerating
 * audio or duplicating questions that already exist.
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
// Tags a question for the customer-service AI rubric (see aiGrading.ts) instead
// of the platform's default communication-ability-only / IELTS-writing rubric.
export const CUSTOMER_SERVICE_TAG = 'customer-service-rubric'

// ── Section 1: General English (grammar/prepositions) ──────────────────────
const GENERAL_ENGLISH_QUESTIONS: { body: string; options: string[]; correct: number }[] = [
  { body: 'She _____ to the store every Sunday morning.', options: ['go', 'goes', 'going', 'gone'], correct: 1 },
  { body: 'By the time we arrived, the meeting _____ already started.', options: ['has', 'have', 'had', 'was'], correct: 2 },
  { body: "I'm looking forward _____ you next week.", options: ['to see', 'see', 'to seeing', 'seeing'], correct: 2 },
  { body: 'He has been working here _____ 2019.', options: ['for', 'since', 'from', 'at'], correct: 1 },
  { body: 'The report _____ by the manager before it is sent out.', options: ['reviews', 'review', 'reviewed', 'is reviewed'], correct: 3 },
  { body: 'Could you please explain _____ this happened?', options: ['that', 'why', 'what', 'which'], correct: 1 },
  { body: 'They _____ finished the project by Friday.', options: ['will', 'have', 'will have', 'had'], correct: 2 },
  { body: "I'm not interested _____ that offer.", options: ['on', 'at', 'in', 'for'], correct: 2 },
  { body: 'If I _____ known earlier, I would have told you.', options: ['have', 'had', 'has', 'would'], correct: 1 },
  { body: 'She is responsible _____ managing the team.', options: ['to', 'of', 'for', 'with'], correct: 2 },
  { body: 'The customer complained _____ the delayed delivery.', options: ['for', 'on', 'about', 'at'], correct: 2 },
  { body: 'We need to look _____ this issue immediately.', options: ['at', 'into', 'for', 'on'], correct: 1 },
  { body: 'He apologized _____ the inconvenience caused.', options: ['about', 'for', 'of', 'with'], correct: 1 },
  { body: 'I would appreciate it if you _____ respond soon.', options: ['can', 'would', 'could', 'should'], correct: 2 },
  { body: 'The issue has _____ resolved successfully.', options: ['being', 'be', 'been', 'were'], correct: 2 },
]

// ── Section 2: Listen & Answer — Customer Calls (5 passages × 5 questions) ──
type CustomerCallPassage = { name: string; script: string }
const CUSTOMER_CALL_PASSAGES: CustomerCallPassage[] = [
  {
    name: 'Outbound Listening — Late Delivery',
    script: "Hi, I'm calling about my order. It was supposed to arrive three days ago and I still don't have it. I checked the tracking and it just says \"in transit\" with no updates. I needed this for my sister's birthday, which was yesterday, so it's already too late for that. I've already spent twenty minutes on hold before getting through to you. I just want to know what's going on and what you're going to do about it.",
  },
  {
    name: 'Outbound Listening — Billing Discrepancy',
    script: "I'm looking at my statement and I've been charged twice for the same subscription this month. I only signed up for one plan, not two. This is the second time this has happened, and last time I had to call in and wait almost a week for a refund. I work hard for my money and I don't appreciate being charged for something I didn't agree to. I need this sorted out today, not next week.",
  },
  {
    name: 'Outbound Listening — Product Not Working',
    script: "I bought this device about two weeks ago and it stopped turning on yesterday. I've tried charging it overnight, resetting it, everything the website says to try, and nothing works. I even watched a video tutorial. I'm not very technical, so this has been really frustrating for me. I paid a lot of money for this, and I don't understand why it just stopped working so soon.",
  },
  {
    name: 'Outbound Listening — Cancellation Request',
    script: "I'd like to cancel my subscription. I've been a customer for almost two years, but honestly the service has gotten slower and more expensive, and I just don't feel like I'm getting my money's worth anymore. I've thought about this for a while, it's not a spur of the moment thing. I know you're going to try to offer me a discount to stay, but I'd rather you just process the cancellation.",
  },
  {
    name: 'Outbound Listening — Repeated Unresolved Issue',
    script: "This is the third time I'm calling about the same problem. Every time, someone tells me it's been fixed, and every time I check, it hasn't. I've already explained this twice today alone. At this point I don't really trust that anything is actually being done on your end. I'm not trying to be difficult, I just need someone to actually take ownership of this instead of passing me along again.",
  },
]
// Same 5-question progression applies to whichever passage is randomly picked.
const CUSTOMER_CALL_QUESTIONS = [
  'How would you first respond to this customer to acknowledge their frustration before addressing the issue?',
  'What would you ask the customer to make sure you fully understand the situation before offering a solution?',
  "How would you explain to the customer what you're going to do to resolve this?",
  "The customer remains frustrated and says this isn't good enough. How do you respond?",
  'How would you close the call so the customer feels heard and reassured?',
]

// ── Section 3: Customer Objection Handling (JAM-style, pick 1 of N) ────────
const OBJECTION_PROMPTS: string[] = [
  "A customer says: \"Why should I pay a cancellation fee when I was never told about it?\" Respond as you would on a call.",
  "A customer says: \"Your competitor offers this for half the price, why should I stay with you?\" Respond as you would on a call.",
  "A customer says: \"I've already explained this to two other agents, why do I have to repeat myself again?\" Respond as you would on a call.",
  "A customer says: \"This is unacceptable, I want a full refund right now.\" Respond as you would on a call.",
  "A customer says: \"I don't believe you, the last person told me the same thing and nothing happened.\" Respond as you would on a call.",
  "A customer says: \"I've been on hold for 40 minutes, this is ridiculous.\" Respond as you would on a call.",
  "A customer says: \"Can I just speak to your manager instead?\" Respond as you would on a call.",
  "A customer says: \"I never agreed to this extra charge.\" Respond as you would on a call.",
  "A customer says: \"Your product broke after just one week, this is clearly low quality.\" Respond as you would on a call.",
  "A customer says: \"I'm going to leave a bad review if this isn't fixed today.\" Respond as you would on a call.",
  "A customer says: \"Why does it take so long to get a simple answer from your company?\" Respond as you would on a call.",
  "A customer says: \"I only called to cancel, I don't want to hear about any offers.\" Respond as you would on a call.",
  "A customer says: \"You people never call back when you say you will.\" Respond as you would on a call.",
  "A customer says: \"I want this resolved without being transferred to another department.\" Respond as you would on a call.",
  "A customer says: \"I'm not angry, I'm just really disappointed.\" Respond as you would on a call.",
]

// ── Section 4: Written Customer Response (pick 1 of N, ESSAY) ──────────────
const WRITTEN_SCENARIOS: string[] = [
  "A customer emails: \"I ordered a replacement part three weeks ago and it still hasn't arrived. I've called twice and been told it's 'on its way' both times. I'm starting to think I'll never get this. Please tell me what's actually happening.\" Write a professional, empathetic email reply addressing their concern and next steps.",
  "A customer emails: \"I was charged for a service I cancelled last month. I have the cancellation confirmation email as proof. Please refund this immediately.\" Write a professional, empathetic email reply.",
  "A customer emails: \"Your support chat disconnected on me twice today while I was trying to explain my issue with my account being locked. I need access back today for work.\" Write a professional, empathetic email reply.",
  "A customer emails: \"I was told my issue was resolved last week, but the same error is happening again today. I'm frustrated because I already spent an hour on this.\" Write a professional, empathetic email reply.",
  "A customer emails: \"I want to cancel my subscription. I've been a loyal customer for two years but the recent price increase is too much for me right now.\" Write a professional, empathetic email reply, including a next step.",
  "A customer emails: \"The item I received doesn't match the description on your website at all. I feel misled.\" Write a professional, empathetic email reply.",
  "A customer emails: \"I've asked for a manager to call me back twice this week and no one has. This is unacceptable for a paying customer.\" Write a professional, empathetic email reply.",
  "A customer emails: \"I don't understand this bill at all, it has three charges I don't recognize.\" Write a professional, empathetic email reply.",
]

async function generateAudio(client: OpenAI, script: string): Promise<string> {
  const speech = await client.audio.speech.create({
    model: 'gpt-4o-mini-tts',
    voice: 'alloy',
    input: script,
    instructions: 'Speak as a real customer calling a support line — natural, slightly frustrated but not shouting, American English accent, conversational pace suitable for a listening comprehension exercise.',
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
    bank = await prisma.questionBank.create({ data: { name: OUTBOUND_BANK_NAME, tenantId, description: 'Outbound/customer-facing communication assessment — grammar, customer-call listening, objection handling, written customer response.' } })
  }

  // ── Section 1 questions: General English ──────────────────────────────────
  for (let i = 0; i < GENERAL_ENGLISH_QUESTIONS.length; i++) {
    const title = `Outbound English Q${i + 1}`
    if (await prisma.question.findFirst({ where: { bankId: bank.id, title } })) continue
    const q = GENERAL_ENGLISH_QUESTIONS[i]
    await prisma.question.create({
      data: {
        bankId: bank.id, type: 'MCQ_SINGLE', title, body: q.body,
        difficulty: 'MEDIUM', points: 1, domain: 'General English',
        options: { create: q.options.map((text, idx) => ({ text, isCorrect: idx === q.correct, order: idx })) },
      },
    })
  }

  // ── Section 2 questions + audio: Listen & Answer — Customer Calls ─────────
  const apiKey = process.env.OPENAI_API_KEY
  let client: OpenAI | null = null

  for (const passage of CUSTOMER_CALL_PASSAGES) {
    let asset = await prisma.audioAsset.findFirst({ where: { name: passage.name, tenantId } })
    if (!asset) {
      if (!apiKey) throw new Error('OPENAI_API_KEY is not configured — cannot generate customer-call audio.')
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
    } else {
      console.log(`Audio asset "${passage.name}" already exists — skipping generation.`)
    }

    for (let i = 0; i < CUSTOMER_CALL_QUESTIONS.length; i++) {
      const title = `${passage.name.replace('Outbound Listening — ', 'Outbound Listen — ')} Q${i + 1}`
      let question = await prisma.question.findFirst({ where: { bankId: bank.id, title } })
      if (!question) {
        await prisma.question.create({
          data: {
            bankId: bank.id, type: 'AUDIO_RECORDING', title, body: CUSTOMER_CALL_QUESTIONS[i],
            difficulty: 'MEDIUM', points: 1, prepSeconds: 10, speakSeconds: 60,
            tags: ['listening', CUSTOMER_SERVICE_TAG], domain: 'Customer Service', audioAssetId: asset.id,
          },
        })
      } else if (!question.audioAssetId) {
        await prisma.question.update({ where: { id: question.id }, data: { audioAssetId: asset.id } })
      }
    }
  }

  // ── Section 3 questions: Customer Objection Handling (JAM-style) ─────────
  for (let i = 0; i < OBJECTION_PROMPTS.length; i++) {
    const title = `Outbound JAM Q${i + 1}`
    if (await prisma.question.findFirst({ where: { bankId: bank.id, title } })) continue
    await prisma.question.create({
      data: {
        bankId: bank.id, type: 'AUDIO_RECORDING', title, body: OBJECTION_PROMPTS[i],
        difficulty: 'MEDIUM', points: 5, prepSeconds: 10, speakSeconds: 60,
        tags: ['speaking', CUSTOMER_SERVICE_TAG], domain: 'Customer Service',
      },
    })
  }

  // ── Section 4 questions: Written Customer Response ────────────────────────
  for (let i = 0; i < WRITTEN_SCENARIOS.length; i++) {
    const title = `Outbound Written Q${i + 1}`
    if (await prisma.question.findFirst({ where: { bankId: bank.id, title } })) continue
    await prisma.question.create({
      data: {
        bankId: bank.id, type: 'ESSAY', title, body: WRITTEN_SCENARIOS[i],
        difficulty: 'MEDIUM', points: 10,
        tags: ['writing', CUSTOMER_SERVICE_TAG], domain: 'Customer Service',
      },
    })
  }

  // ── Test + sections ────────────────────────────────────────────────────────
  const englishQuestions = await prisma.question.findMany({ where: { bankId: bank.id, title: { startsWith: 'Outbound English Q' } }, orderBy: { createdAt: 'asc' }, select: { id: true } })
  const listenQuestions = await prisma.question.findMany({ where: { bankId: bank.id, title: { startsWith: 'Outbound Listen — ' } }, orderBy: { createdAt: 'asc' }, select: { id: true } })
  const jamQuestions = await prisma.question.findMany({ where: { bankId: bank.id, title: { startsWith: 'Outbound JAM Q' } }, orderBy: { createdAt: 'asc' }, select: { id: true } })
  const writtenQuestions = await prisma.question.findMany({ where: { bankId: bank.id, title: { startsWith: 'Outbound Written Q' } }, orderBy: { createdAt: 'asc' }, select: { id: true } })

  const instructions = `Outbound - Communication Assessment — 30 minutes. Section 1 (General English): a random 10 of ${englishQuestions.length} grammar questions, 10 minutes. Section 2 (Listen & Answer — Customer Calls): listen to one customer call (randomly chosen) and answer 5 questions about how you'd handle it, 5 minutes. Section 3 (Customer Objection Handling): respond to one randomly chosen customer objection, 5 minutes. Section 4 (Written Customer Response): reply to one randomly chosen customer email scenario, 10 minutes. Speak/write as you would with a real customer — we assess empathy, professionalism, clarity, and resolution-orientation.`

  let test = await prisma.test.findFirst({ where: { title: testTitle, tenantId } })
  if (!test) {
    test = await prisma.test.create({
      data: {
        title: testTitle, domain: 'Customer Service', duration: 30,
        status: TestStatus.DRAFT, proctoring: true, enforceViolations: false, sebRequired: false,
        tenantId, createdById: admin.id, instructions,
      },
    })
    console.log(`created test "${testTitle}"`)
  } else {
    const secs = await prisma.testSection.findMany({ where: { testId: test.id } })
    for (const s of secs) await prisma.testQuestion.deleteMany({ where: { sectionId: s.id } })
    await prisma.testSection.deleteMany({ where: { testId: test.id } })
    await prisma.test.update({ where: { id: test.id }, data: { duration: 30, instructions } })
    console.log(`rebuilt existing test "${testTitle}"`)
  }

  const englishSection = await prisma.testSection.create({
    data: { testId: test.id, title: 'General English', skill: 'READING', order: 0, timeLimit: 10 * 60, pickCount: 10,
      description: `10 questions (randomly drawn from a bank of ${englishQuestions.length}) covering grammar, tenses, and prepositions. 1 mark each.` },
  })
  await prisma.testQuestion.createMany({ data: englishQuestions.map((q, i) => ({ testId: test!.id, sectionId: englishSection.id, questionId: q.id, order: i, points: 1 })) })

  const listenSection = await prisma.testSection.create({
    data: { testId: test.id, title: 'Listen & Answer — Customer Calls', skill: 'LISTENING', order: 1, timeLimit: 5 * 60, pickCount: 5, pickGroupSize: 5,
      description: `Listen to one randomly chosen customer call (of ${CUSTOMER_CALL_PASSAGES.length}) and record a spoken response to each of 5 questions. Assessed on empathy, professionalism, clarity, and resolution-orientation, not accent.` },
  })
  await prisma.testQuestion.createMany({ data: listenQuestions.map((q, i) => ({ testId: test!.id, sectionId: listenSection.id, questionId: q.id, order: i, points: 1 })) })

  const jamSection = await prisma.testSection.create({
    data: { testId: test.id, title: 'Customer Objection Handling', skill: 'SPEAKING', order: 2, timeLimit: 5 * 60, pickCount: 1,
      description: `You'll get one randomly chosen customer objection (of ${jamQuestions.length}). Think for a few seconds, then respond as you would on a real call.` },
  })
  await prisma.testQuestion.createMany({ data: jamQuestions.map((q, i) => ({ testId: test!.id, sectionId: jamSection.id, questionId: q.id, order: i, points: 5 })) })

  const writtenSection = await prisma.testSection.create({
    data: { testId: test.id, title: 'Written Customer Response', skill: 'WRITING', order: 3, timeLimit: 10 * 60, pickCount: 1,
      description: `You'll get one randomly chosen customer email scenario (of ${writtenQuestions.length}). Write a professional, empathetic reply.` },
  })
  await prisma.testQuestion.createMany({ data: writtenQuestions.map((q, i) => ({ testId: test!.id, sectionId: writtenSection.id, questionId: q.id, order: i, points: 10 })) })

  console.log(`\n✅ "${testTitle}": General English 10/${englishQuestions.length} + Listen&Answer 5/${listenQuestions.length} (1 of ${CUSTOMER_CALL_PASSAGES.length} passages) + Objection Handling 1/${jamQuestions.length} + Written Response 1/${writtenQuestions.length}. 30 min total. Status DRAFT — publish it in the admin UI to use.`)
}

if (require.main === module) {
  main().catch(e => { console.error('❌ create-outbound-communication-assessment failed:', e); process.exit(1) }).finally(() => prisma.$disconnect())
}
