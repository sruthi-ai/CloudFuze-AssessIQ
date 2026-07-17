/**
 * Turn "Listen & Answer" from one fixed passage (same for every candidate) into
 * a pool of 5 passages, one picked at random per session — same idea as the
 * JAM section's pickCount:1 topic pool, generalized to whole 5-question groups
 * via TestSection.pickGroupSize (see sessions.ts /start pooling logic).
 *
 * Idempotent — safe to re-run:
 *  - The existing 5 "Listen & Answer Q1..Q5" questions are migrated from the
 *    old section-level audioAssetId onto their own per-question audioAssetId
 *    (only if not already set) — the frontend already prefers per-question
 *    audio, so this is a data move, not a behavior change for that passage.
 *  - Each new passage's AudioAsset is generated via OpenAI TTS only if an
 *    asset with that name doesn't already exist — a re-run after a billing
 *    failure resumes from wherever it stopped.
 *  - New questions are created only if missing (matched by title), and only
 *    missing TestQuestion links are added — existing rows/order untouched.
 *
 *   docker exec -w /app neutaraassessment-backend-1 npx tsx prisma/add-listening-passage-pool.ts
 *
 * Env overrides: TEST_TITLE (default "Freshers Assessment 1"),
 *                SECTION_TITLE (default "Listen & Answer").
 */
import { PrismaClient } from '@prisma/client'
import OpenAI from 'openai'
import { writeFile } from 'fs/promises'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { UPLOADS_DIR } from '../src/uploads'

const prisma = new PrismaClient()
mkdirSync(join(UPLOADS_DIR, 'audio-assets'), { recursive: true })

type PassageQ = { body: string }
type Passage = { name: string; script: string; questions: PassageQ[] }

const NEW_PASSAGES: Passage[] = [
  {
    name: 'Listening — Flash Sale Crash (US)',
    script: "Priya joined TechNova Retail three months ago as a junior support engineer. During her first big project, the company was preparing for its biggest flash sale of the year, expecting triple the usual website traffic in just six hours. The whole team was nervous about the servers holding up. Her team lead, Arjun, assigned each engineer a different system to monitor and set up a group chat for instant updates every fifteen minutes once the sale went live. Priya was watching the checkout page. An hour before launch, she noticed it loading unusually slowly on mobile devices during a test run. She reported it immediately instead of assuming someone else would catch it. The team traced it to a caching setting and fixed it with twenty minutes to spare. When the sale began, the site handled the record traffic smoothly, and TechNova posted its highest single-day sales ever. Priya learned that noticing small warning signs early, and speaking up quickly, can prevent a much bigger problem later. Her manager thanked her personally for catching it in time.",
    questions: [
      { body: "In your own words, describe the challenge TechNova's team faced before the flash sale. Explain in 2-3 sentences." },
      { body: 'How did the team lead, Arjun, organize the team to prepare for the sale? Explain his approach.' },
      { body: 'What problem did Priya discover, and what did she do about it? Describe what happened.' },
      { body: 'The sale went smoothly and set a new record. In your opinion, what helped the team succeed? Give your reasons.' },
      { body: 'What lesson did Priya learn from this experience? Do you agree with it? Explain why or why not.' },
    ],
  },
  {
    name: 'Listening — The Missing Shipment (US)',
    script: "Rohan had just joined Skyline Logistics as a dispatch coordinator when he faced his first real challenge. A major client was launching a new product at a public event, and their display units had to arrive at the venue within two days. Two days before the event, the tracking system showed the shipment missing from its expected route. Rohan's supervisor, Meera, quickly split the search between the three nearest regional hubs and asked each team to report back every hour with an update. Rohan was assigned to cross-check the tracking numbers against the warehouse logs. While comparing serial numbers, he discovered that the boxes had been mislabeled and sent to the wrong hub, just one city away from where they were meant to go. He alerted Meera immediately, and the shipment was redirected that same evening. It reached the venue with hours to spare before the event began. Rohan learned that carefully checking details, even when everyone is under pressure, can solve a problem others might miss. Meera later told him his attention to detail had saved the account.",
    questions: [
      { body: "In your own words, describe the challenge Skyline Logistics faced with the client's shipment. Explain in 2-3 sentences." },
      { body: 'How did the supervisor, Meera, organize the search for the missing shipment? Explain her approach.' },
      { body: 'What problem did Rohan discover, and what did he do about it? Describe what happened.' },
      { body: 'The shipment reached the venue with hours to spare. In your opinion, what helped the team succeed? Give your reasons.' },
      { body: 'What lesson did Rohan learn from this experience? Do you agree with it? Explain why or why not.' },
    ],
  },
  {
    name: 'Listening — The Viral Mistake (US)',
    script: "Fatima was a social media intern at BrightWave Media when a scheduled promotional post accidentally went out with the wrong discount code, offering customers seventy percent off instead of the intended twenty percent. Within an hour, thousands of people had seen it and many were trying to redeem it. Her manager, Carlos, gathered the small team and stayed calm instead of assigning blame. He decided they would honor a fair, reduced version of the offer and personally reply to as many customer comments as possible within the day. While reviewing the campaign files, Fatima discovered the error had come from an old template left over from a previous sale, not a mistake by anyone on the current team. Knowing the real cause helped Carlos explain the situation honestly to customers and leadership instead of guessing. The company's quick, transparent response actually earned praise online, with several customers saying they trusted the brand more afterward. Fatima learned that admitting a mistake clearly and acting fast can sometimes build more trust than if nothing had gone wrong at all.",
    questions: [
      { body: "In your own words, describe what went wrong with BrightWave Media's promotional post. Explain in 2-3 sentences." },
      { body: 'How did the manager, Carlos, respond to the situation with the team? Explain his approach.' },
      { body: 'What did Fatima discover about the error, and how did that help? Describe what happened.' },
      { body: 'The company earned positive attention despite the mistake. In your opinion, what helped them succeed? Give your reasons.' },
      { body: 'What lesson did Fatima learn from this experience? Do you agree with it? Explain why or why not.' },
    ],
  },
  {
    name: 'Listening — The Hackathon Pivot (US)',
    script: "Aditi and her three teammates were preparing for Nimbus Startups' twenty-four-hour internal hackathon, where employees pitch new ideas to leadership. Their plan was to build a scheduling assistant, something they had been researching for weeks. Late the night before the event, they discovered a competitor had already launched a nearly identical product that same month. Their team lead, Devika, told everyone not to panic and gave the group thirty minutes to think of alternatives instead of giving up. During the discussion, Aditi remembered a colleague complaining earlier that week about manually tracking small team expenses on paper. She suggested they build a simple expense-tracking tool instead. The team agreed, split the work between coding, design, and preparing the demo, and rebuilt a working prototype overnight. The next morning, their pivoted idea won the \"most practical\" award and was chosen for further development by the company. Aditi learned that staying flexible and paying attention to everyday problems around her could turn a setback into their best idea yet.",
    questions: [
      { body: 'In your own words, describe the challenge Aditi’s team faced the night before the hackathon. Explain in 2-3 sentences.' },
      { body: 'How did the team lead, Devika, help the team handle the setback? Explain her approach.' },
      { body: 'What idea did Aditi suggest instead, and where did it come from? Describe what happened.' },
      { body: "Their pivoted idea won an award. In your opinion, what helped the team succeed? Give your reasons." },
      { body: 'What lesson did Aditi learn from this experience? Do you agree with it? Explain why or why not.' },
    ],
  },
]

async function generateAudio(client: OpenAI, name: string, script: string): Promise<string> {
  const speech = await client.audio.speech.create({
    model: 'gpt-4o-mini-tts',
    voice: 'alloy',
    input: script,
    instructions: 'Speak with an American English accent, at a natural, clear pace suitable for a listening comprehension exam.',
    response_format: 'mp3',
  }, { timeout: 30_000 })
  const buffer = Buffer.from(await speech.arrayBuffer())
  const filename = `${randomUUID()}.mp3`
  await writeFile(join(UPLOADS_DIR, 'audio-assets', filename), buffer)
  return `/uploads/audio-assets/${filename}`
}

async function main() {
  const testTitle = process.env.TEST_TITLE || 'Freshers Assessment 1'
  const sectionTitle = process.env.SECTION_TITLE || 'Listen & Answer'

  const test = await prisma.test.findFirst({ where: { title: testTitle } })
  if (!test) throw new Error(`Test "${testTitle}" not found.`)

  const section = await prisma.testSection.findFirst({ where: { testId: test.id, title: sectionTitle } })
  if (!section) throw new Error(`Section "${sectionTitle}" not found on "${testTitle}".`)

  const existingLinks = await prisma.testQuestion.findMany({
    where: { sectionId: section.id },
    include: { question: true },
    orderBy: { order: 'asc' },
  })
  // Before this script's first run, the section still carries its original
  // section-level audioAssetId and must have exactly the 1 original passage's
  // 5 questions. After a first successful run that's been cleared to null, so
  // re-runs (idempotency) just need a clean multiple of 5, not exactly 5.
  const preMigration = !!section.audioAssetId
  if (preMigration && existingLinks.length !== 5) {
    throw new Error(`Expected exactly 5 existing questions in "${sectionTitle}" before migration, found ${existingLinks.length}. Aborting to avoid corrupting an unfamiliar layout.`)
  }
  if (!preMigration && (existingLinks.length === 0 || existingLinks.length % 5 !== 0)) {
    throw new Error(`Expected a multiple of 5 existing questions in "${sectionTitle}", found ${existingLinks.length}. Aborting to avoid corrupting an unfamiliar layout.`)
  }
  const bankId = existingLinks[0].question.bankId

  // ── Step 1: migrate the original passage's audio from section-level to per-question ──
  if (section.audioAssetId) {
    for (const link of existingLinks) {
      if (!link.question.audioAssetId) {
        await prisma.question.update({ where: { id: link.questionId }, data: { audioAssetId: section.audioAssetId } })
      }
    }
    await prisma.testSection.update({ where: { id: section.id }, data: { audioAssetId: null } })
    console.log('Migrated original passage audio from section-level to per-question (Passage 1).')
  } else {
    console.log('Passage 1 already migrated to per-question audio — skipping.')
  }

  // ── Step 2: create the 4 new passages (audio + 5 questions each), idempotently ──
  const apiKey = process.env.OPENAI_API_KEY
  let client: OpenAI | null = null
  let nextOrder = existingLinks.length

  for (const passage of NEW_PASSAGES) {
    let asset = await prisma.audioAsset.findFirst({ where: { name: passage.name, tenantId: test.tenantId } })
    if (!asset) {
      if (!apiKey) throw new Error('OPENAI_API_KEY is not configured — cannot generate passage audio.')
      if (!client) client = new OpenAI({ apiKey })
      console.log(`Generating audio for "${passage.name}"...`)
      const url = await generateAudio(client, passage.name, passage.script)
      asset = await prisma.audioAsset.create({
        data: {
          name: passage.name, url, sourceType: 'TTS_GENERATED', accent: 'American English', voice: 'alloy',
          transcript: passage.script, playLimit: 2, tenantId: test.tenantId,
        },
      })
      console.log(`  -> created audio asset ${asset.id}`)
    } else {
      console.log(`Audio asset "${passage.name}" already exists — skipping generation.`)
    }

    for (let i = 0; i < passage.questions.length; i++) {
      const title = `${passage.name.replace('Listening — ', 'Listen & Answer — ')} Q${i + 1}`
      let question = await prisma.question.findFirst({ where: { bankId, title } })
      if (!question) {
        question = await prisma.question.create({
          data: {
            bankId, type: 'AUDIO_RECORDING', title, body: passage.questions[i].body,
            difficulty: 'MEDIUM', points: 1, prepSeconds: 10, speakSeconds: 60,
            tags: ['listening'], audioAssetId: asset.id,
          },
        })
      } else if (!question.audioAssetId) {
        question = await prisma.question.update({ where: { id: question.id }, data: { audioAssetId: asset.id } })
      }

      const linked = await prisma.testQuestion.findFirst({ where: { sectionId: section.id, questionId: question.id } })
      if (!linked) {
        await prisma.testQuestion.create({
          data: { testId: test.id, sectionId: section.id, questionId: question.id, order: nextOrder, points: 1, isRequired: true },
        })
        nextOrder++
      }
    }
  }

  // ── Step 3: pool config — pick 1 whole 5-question passage at random per session ──
  await prisma.testSection.update({ where: { id: section.id }, data: { pickCount: 5, pickGroupSize: 5 } })

  const total = await prisma.testQuestion.count({ where: { sectionId: section.id } })
  console.log(`\n✅ "${sectionTitle}": ${total} questions across ${total / 5} passages. pickCount=5, pickGroupSize=5 — one passage's worth served at random per session.`)
}

main().catch(e => { console.error('❌ add-listening-passage-pool failed:', e); process.exit(1) }).finally(() => prisma.$disconnect())
