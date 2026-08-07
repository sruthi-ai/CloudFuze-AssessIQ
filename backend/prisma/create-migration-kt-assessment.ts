/**
 * Create/rebuild "Migration KT Knowledge Assessment": a fixed 40-question,
 * 40-minute knowledge test built from a Migration Team Knowledge Transfer
 * (KT) session recording/transcript, with 4 sections, 10 questions each:
 *   - File Conversion, Permissions & Naming Limits
 *   - Truncation Behavior & API Rate Limits
 *   - Environments & Connecting Clouds
 *   - Verification, Resync & Special Cloud Types
 *
 * Like the other client-document-derived assessments (Migration Assessment
 * (Freshers), Content Migration - Combination Set B), this pool has no
 * process/technical/flow categorization and no supplied answer key — each
 * section uses a plain pickCount (defaults to its full pool, i.e. no
 * randomization out of the box). The correct-answer letter was deliberately
 * balanced to exactly 10 A / 10 B / 10 C / 10 D across the 40 questions
 * (source material has no answer key to preserve a distribution from, so
 * this was set explicitly rather than left to chance).
 *
 * Both pickCount and each section's timeLimit (and the test's overall
 * duration) are editable directly from the admin Test Builder UI after
 * creation — this script just sets sensible starting defaults.
 *
 * Idempotent — safe to re-run: existing questions are UPDATED in place
 * (body/options diffed against this script, matched by title), not
 * skipped, so editing this script and re-running actually applies the
 * edit. The test's sections are cleanly rebuilt each run so pool sizes
 * stay in sync — this will reset any pickCount/timeLimit you changed via
 * the UI back to the script's defaults, so only re-run this if the
 * QUESTION CONTENT itself needs to change, not just to tweak timing/counts.
 *
 *   docker exec -w /app neutaraassessment-backend-1 npx tsx prisma/create-migration-kt-assessment.ts
 *
 * Env overrides: TEST_TITLE (default "Migration KT Knowledge Assessment"),
 *                APTITUDE_BANK_NAME (default "Freshers Assessment 1" — used only
 *                to resolve the tenant/admin, not as a question source),
 *                DURATION_MIN (default 40).
 */
import { PrismaClient, TestStatus } from '@prisma/client'
const prisma = new PrismaClient()

export const MIGRATION_KT_BANK_NAME = 'Migration KT Knowledge Assessment Questions Bank'

type Section = 'conversion-permissions' | 'truncation-limits' | 'environments-clouds' | 'verification-resync'
const SECTION_TITLES: Record<Section, string> = {
  'conversion-permissions': 'File Conversion, Permissions & Naming Limits',
  'truncation-limits': 'Truncation Behavior & API Rate Limits',
  'environments-clouds': 'Environments & Connecting Clouds',
  'verification-resync': 'Verification, Resync & Special Cloud Types',
}
const SECTION_ORDER: Section[] = ['conversion-permissions', 'truncation-limits', 'environments-clouds', 'verification-resync']

export const MIGRATION_KT_QUESTIONS: { body: string; options: string[]; correct: number; section: Section }[] = [
  // ── Section 1: File Conversion, Permissions & Naming Limits (10) ────────
  { section: 'conversion-permissions', body: 'When migrating from Google Workspace to Microsoft, what happens to Google-native files like Docs, Sheets, and Slides?', options: ['They are converted to the matching Microsoft Office format (Word, Excel, PowerPoint)', 'They stay in their original Google format', 'They are converted into PDF files', "They are deleted since Microsoft can't open them"], correct: 0 },
  { section: 'conversion-permissions', body: 'Which of these Google-only items are NOT migrated at all, since Microsoft has no equivalent for them?', options: ['Google Docs and Sheets', 'Google Sites, Forms, and Jamboard', 'Google Slides', 'Google Drive folders'], correct: 1 },
  { section: 'conversion-permissions', body: 'In the Google-to-Microsoft permission mapping, a Google user who could only view and read a file (Viewer) receives which access level at the destination?', options: ['Edit', 'Full control', 'Read', 'Contribute'], correct: 2 },
  { section: 'conversion-permissions', body: "A Google 'Commenter' role maps to which Microsoft access level?", options: ['Read', 'Owner', 'Edit', 'Contribute'], correct: 3 },
  { section: 'conversion-permissions', body: "A Google 'Editor' role maps to which Microsoft access level?", options: ['Edit', 'Contribute', 'Read', 'Full control only'], correct: 0 },
  { section: 'conversion-permissions', body: "A Google 'Manager/Organizer,' the highest Google Drive permission level, maps to which Microsoft access level?", options: ['Edit only', 'Owner, with full control', 'Contribute', 'Read-only'], correct: 1 },
  { section: 'conversion-permissions', body: 'For a Google-to-Microsoft migration, what is the maximum file PATH length Microsoft supports?', options: ['About 100 characters', 'About 260 characters', 'About 400 characters', 'There is no fixed limit'], correct: 2 },
  { section: 'conversion-permissions', body: "If a file's path exceeds that supported limit, what does the migration tool do?", options: ['Skips the file completely, migrating nothing', 'Fails the entire migration job for that user', 'Renames the file with a random new name', 'Automatically trims/truncates the path down toward roughly 350 characters'], correct: 3 },
  { section: 'conversion-permissions', body: "If an individual FILE NAME (not the whole path) exceeds 100 characters, about how many characters is it truncated to?", options: ['97', '50', '75', "It isn't truncated — only paths are"], correct: 0 },
  { section: 'conversion-permissions', body: "Special characters that Microsoft doesn't support in file or folder names are:", options: ['Left unchanged', 'Replaced with a hyphen or underscore', 'Deleted entirely', 'Replaced with random numbers'], correct: 1 },

  // ── Section 2: Truncation Behavior & API Rate Limits (10) ───────────────
  { section: 'truncation-limits', body: 'When a deeply nested folder chain (say, 10 levels) exceeds the path limit, what does the tool generally do to the folder structure?', options: ['It keeps all 10 levels exactly as they are', 'It deletes the innermost folders', 'It merges/truncates the structure down to fewer folder levels', 'It converts every folder into a single flat file'], correct: 2 },
  { section: 'truncation-limits', body: "When a file's original path was truncated, how would you actually locate that file at the destination?", options: ['The entire original nested path is recreated exactly as it was', 'You would need to manually search the whole destination drive', 'The file is emailed to the admin separately', 'Via a generated CSV report and a link/redirect to where the file actually landed'], correct: 3 },
  { section: 'truncation-limits', body: "A client's shared link for a migrated file should point to:", options: ['The destination location only — never back to the source', 'Either the source or destination, whichever loads faster', 'The original source location, so nothing is lost', 'A generic support page, not the file itself'], correct: 0 },
  { section: 'truncation-limits', body: 'In Google Workspace, what is the migration volume limit per user, per day?', options: ['100GB', '750GB', '1TB', 'There is no daily limit'], correct: 1 },
  { section: 'truncation-limits', body: 'What is the maximum size for a single file in Google Drive?', options: ['500GB', '1TB', '5TB', '10TB'], correct: 2 },
  { section: 'truncation-limits', body: "When a user's Google migration hits its daily API limit, what error is returned?", options: ['404 — Not Found', '500 — Internal Server Error', '401 — Unauthorized', '403 — User Rate Limit Exceeded'], correct: 3 },
  { section: 'truncation-limits', body: "After a user hits Google's daily rate limit, how long must you generally wait before that user's migration can resume?", options: ['About 24 hours, when the quota refreshes', 'About 1 hour', 'It never resumes automatically', 'About 1 week'], correct: 0 },
  { section: 'truncation-limits', body: "When Microsoft/SharePoint's request limit is hit, what error is returned?", options: ['403 — Forbidden', '429 — Too Many Requests', '500 — Internal Server Error', '404 — Not Found'], correct: 1 },
  { section: 'truncation-limits', body: 'How does retrying after a Microsoft rate-limit error typically compare to retrying after a Google one?', options: ["They're identical — both require a fixed 24-hour wait", 'Microsoft requires waiting a full week', "Microsoft is more adaptive — often just a few hours' wait, not a fixed 24-hour cycle", 'Microsoft never allows a retry at all'], correct: 2 },
  { section: 'truncation-limits', body: "How does CloudFuze's tool generally handle these transient rate-limit/conflict errors?", options: ['It requires the admin to manually retry every single failed item', 'It cancels the whole migration job immediately', 'It ignores the error and marks the item as complete anyway', "It automatically retries in cycles, and offers a manual retry option in the UI if that still doesn't resolve it"], correct: 3 },

  // ── Section 3: Environments & Connecting Clouds (10) ─────────────────────
  { section: 'environments-clouds', body: "'On-premises' refers to data that is:", options: ["Stored on the customer's own physical/hardware servers at their own location", 'Hosted entirely by a third-party cloud provider', 'Always encrypted end-to-end', 'Only accessible through a VPN'], correct: 0 },
  { section: 'environments-clouds', body: 'Compared to on-premises, cloud storage is:', options: ['Always slower to access', "Hosted by the cloud provider, not physically located at the customer's site", 'Only available to government organizations', 'The exact same thing, just a different name'], correct: 1 },
  { section: 'environments-clouds', body: "A 'hybrid' setup generally means:", options: ['Everything is moved to the cloud with nothing kept locally', 'Two different cloud providers used for the same data', 'A mix — e.g., sensitive users (like executives) kept on-premises for security, while other users move to the cloud to reduce cost', 'A temporary state that always ends in full cloud migration'], correct: 2 },
  { section: 'environments-clouds', body: 'When adding a Microsoft cloud (OneDrive/SharePoint) for migration, what can you do directly, without any extra app install?', options: ['Nothing — Microsoft always requires an app install first', 'Only a Site Admin, never a Global Admin, can add it', 'You must contact Microsoft support to add it', 'Enter the Global Admin credentials directly to add the cloud'], correct: 3 },
  { section: 'environments-clouds', body: "When adding a Google cloud (My Drive/Shared Drive), what extra step is required that Microsoft doesn't need?", options: ['Installing the migration app via the Google Workspace Marketplace and granting admin consent', 'Nothing extra — the process is identical', "Manually creating every user's account first", 'Paying an additional Google licensing fee'], correct: 0 },
  { section: 'environments-clouds', body: "What does 'domain-wide delegation' allow, in the context of Google Workspace migration?", options: ['Each individual user must separately grant access before anything can be read', "A service account can securely access files, permissions, and directory data across the WHOLE domain, on behalf of users, without needing each user's individual consent", 'It only applies to a single, specific file', 'It replaces the need for a super admin entirely'], correct: 1 },
  { section: 'environments-clouds', body: 'Why might different Google scopes need to be configured depending on the migration?', options: ['Scopes are identical no matter what is being migrated', 'Scopes only matter for Microsoft migrations, not Google', 'Content/Drive, Gmail, and Chat migrations each need their own specific set of scopes', 'Scopes are set automatically with no admin input ever needed'], correct: 2 },
  { section: 'environments-clouds', body: "What is the 'discovery' phase, and when does it happen?", options: ['It is the final report sent after migration completes', 'It only applies to permission mapping, not files', 'It happens before any cloud is even added', 'Scanning/finding what data exists to migrate (e.g., files per user), done after the cloud is connected and before migration planning starts'], correct: 3 },
  { section: 'environments-clouds', body: 'Which of these is a prerequisite for adding a Microsoft cloud for migration?', options: ['Global Admin access, with directory read/write and full control of site collections', 'A personal Microsoft consumer account', 'A Google super admin account', 'No admin access is needed at all'], correct: 0 },
  { section: 'environments-clouds', body: "In some organizations, why might a newly added cloud stay in a 'spinning'/pending state even after entering Global Admin credentials?", options: ['It always takes exactly 24 hours regardless of anything else', 'Some organizations require a second global admin to separately approve the connection', 'The cloud was added to the wrong tenant entirely', 'This state means the migration has already failed'], correct: 1 },

  // ── Section 4: Verification, Resync & Special Cloud Types (10) ─────────
  { section: 'verification-resync', body: "On the Manage Clouds dashboard, if not all users show as 'added successfully,' what's a likely, often-harmless reason?", options: ['The tool is fundamentally broken', 'The admin entered the wrong password', "Those users may simply be not provisioned, deactivated, or suspended — fine if they're outside the actual migration scope", 'The destination account ran out of storage'], correct: 2 },
  { section: 'verification-resync', body: 'After adding a cloud, what should you check about the Access Token?', options: ['It should always be left blank', 'It only matters for Microsoft, never for Google', "It should match the user's password exactly", 'It must be generated (non-null); if it is null, the cloud needs to be re-added'], correct: 3 },
  { section: 'verification-resync', body: "After adding a cloud, what does a populated 'Error Description' field usually indicate for a user?", options: ['An issue such as the user not having logged in, or not being licensed', 'That user connected successfully with no issues', 'That the migration is 100% complete for that user', 'A billing problem unrelated to migration'], correct: 0 },
  { section: 'verification-resync', body: 'For SharePoint, Shared Drive, and Dropbox, what is the expected Root Folder ID convention?', options: ['A random alphanumeric string', "A forward slash ('/')", "The number zero ('0')", "The user's email address"], correct: 1 },
  { section: 'verification-resync', body: 'For Box, what is the expected Root Folder ID convention?', options: ["A forward slash ('/')", 'A random alphanumeric string', "Zero ('0')", "The tenant's domain name"], correct: 2 },
  { section: 'verification-resync', body: "For OneDrive, the Root Folder ID should be a random alphanumeric string. If it instead shows as a forward slash ('/'), what does that most likely mean?", options: ['The cloud was added to the wrong tenant', 'The migration for that user is already complete', 'The user has too many files to migrate', "That user hasn't logged into their OneDrive account at least once yet"], correct: 3 },
  { section: 'verification-resync', body: "What does 'resyncing' a cloud connection do?", options: ['Refreshes the connection to pick up new users or updates made in the source', 'Permanently deletes the connection', 'Instantly completes the migration', "Downgrades the user's access level"], correct: 0 },
  { section: 'verification-resync', body: 'Why should resyncing generally be avoided during an active migration, or after a one-time migration is fully completed?', options: ['It has no real effect either way', 'It can disrupt the consistent structure delta migration depends on, risking conflicts — and typically needs manager approval first', 'It is only a cosmetic dashboard refresh with no risk', 'It automatically cancels all completed batches'], correct: 1 },
  { section: 'verification-resync', body: 'When adding OneDrive/SharePoint for migration, which type of account should be used?', options: ['A personal/consumer Microsoft account', 'Either type works identically', 'A Business account, not personal', 'A trial account only'], correct: 2 },
  { section: 'verification-resync', body: 'What is true about GCC / GCC High Microsoft environments?', options: ['They are identical to commercial tenants in every way', 'They only apply to Google Workspace, not Microsoft', 'They have no restrictions at all, unlike commercial tenants', "They are used by government/defense-related organizations, typically use a '.us' domain, and have added restrictions such as email attachments over 3GB not migrating"], correct: 3 },
]

export async function main() {
  const testTitle = process.env.TEST_TITLE || 'Migration KT Knowledge Assessment'
  const aptitudeBankName = process.env.APTITUDE_BANK_NAME || 'Freshers Assessment 1'
  const durationMin = Number(process.env.DURATION_MIN) || 40

  const aptiBank = await prisma.questionBank.findFirst({ where: { name: aptitudeBankName } })
  if (!aptiBank) throw new Error(`Bank "${aptitudeBankName}" not found — needed to resolve tenant/admin.`)
  const tenantId = aptiBank.tenantId

  const admin = await prisma.user.findFirst({
    where: { tenantId, role: { in: ['SUPER_ADMIN', 'COMPANY_ADMIN'] } },
    orderBy: { createdAt: 'asc' },
  })
  if (!admin) throw new Error('No admin user found for the tenant.')

  let bank = await prisma.questionBank.findFirst({ where: { name: MIGRATION_KT_BANK_NAME, tenantId } })
  if (!bank) {
    bank = await prisma.questionBank.create({ data: { name: MIGRATION_KT_BANK_NAME, tenantId, description: 'Migration KT Knowledge Assessment, built from a Migration Team KT session transcript: file conversion/permissions, path/name truncation, API rate limits, cloud environments, and cloud verification/resync.' } })
  }

  let created = 0
  let updated = 0
  for (let i = 0; i < MIGRATION_KT_QUESTIONS.length; i++) {
    const title = `Migration KT Q${i + 1}`
    const q = MIGRATION_KT_QUESTIONS[i]
    const optionsData = q.options.map((text, idx) => ({ text, isCorrect: idx === q.correct, order: idx }))
    const existing = await prisma.question.findFirst({ where: { bankId: bank.id, title }, include: { options: { orderBy: { order: 'asc' } } } })

    if (!existing) {
      await prisma.question.create({
        data: {
          bankId: bank.id, type: 'MCQ_SINGLE', title, body: q.body,
          difficulty: 'MEDIUM', points: 1, domain: 'Migration Engineering', tags: [q.section],
          options: { create: optionsData },
        },
      })
      created++
      continue
    }

    const optionsChanged = existing.options.length !== optionsData.length
      || existing.options.some((o, idx) => o.text !== optionsData[idx]?.text || o.isCorrect !== optionsData[idx]?.isCorrect)
    const tagsChanged = JSON.stringify(existing.tags ?? []) !== JSON.stringify([q.section])
    if (existing.body !== q.body || optionsChanged || tagsChanged) {
      if (optionsChanged) await prisma.questionOption.deleteMany({ where: { questionId: existing.id } })
      await prisma.question.update({
        where: { id: existing.id },
        data: { body: q.body, tags: [q.section], options: optionsChanged ? { create: optionsData } : undefined },
      })
      updated++
    }
  }
  console.log(`Migration KT bank: ${created} created, ${updated} updated, ${MIGRATION_KT_QUESTIONS.length - created - updated} unchanged.`)

  const expectedTitles = MIGRATION_KT_QUESTIONS.map((_, i) => `Migration KT Q${i + 1}`)
  const questionsByTitle = new Map(
    (await prisma.question.findMany({ where: { bankId: bank.id, title: { in: expectedTitles } }, select: { id: true, title: true, tags: true } }))
      .map(q => [q.title, q])
  )
  const orderedQuestions = expectedTitles.map(t => questionsByTitle.get(t)!).filter(Boolean)

  const instructions = `Migration KT Knowledge Assessment — ${durationMin} minutes, 40 questions across 4 sections.

${SECTION_ORDER.map(sec => `• ${SECTION_TITLES[sec]} — ${orderedQuestions.filter(q => (q.tags as string[])?.includes(sec)).length} questions`).join('\n')}

1 mark each. Choose the best option.`

  let test = await prisma.test.findFirst({ where: { title: testTitle, tenantId } })
  if (!test) {
    test = await prisma.test.create({
      data: {
        title: testTitle, domain: 'Migration Engineering', duration: durationMin,
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

  let sectionSummaryParts: string[] = []
  for (let i = 0; i < SECTION_ORDER.length; i++) {
    const sec = SECTION_ORDER[i]
    const secQuestions = orderedQuestions.filter(q => (q.tags as string[])?.includes(sec))
    const section = await prisma.testSection.create({
      data: {
        testId: test.id, title: SECTION_TITLES[sec], skill: 'GENERAL', order: i,
        timeLimit: secQuestions.length * 60, pickCount: secQuestions.length,
        description: `${secQuestions.length} questions (of a bank of ${secQuestions.length}) — pickCount and time limit are editable from the Test Builder UI. 1 mark each.`,
      },
    })
    await prisma.testQuestion.createMany({
      data: secQuestions.map((q, idx) => ({ testId: test!.id, sectionId: section.id, questionId: q.id, order: idx, points: 1 })),
    })
    sectionSummaryParts.push(`${SECTION_TITLES[sec]} ${secQuestions.length}/${secQuestions.length}`)
  }

  console.log(`\n✅ "${testTitle}": ${sectionSummaryParts.join(' + ')}. ${durationMin} min total, 40 marks. Status DRAFT — publish it in the admin UI to use.\n   Adjust pickCount / time per section, or overall duration, any time from Admin > Tests > this test.`)
}

if (require.main === module) {
  main().catch(e => { console.error('❌ create-migration-kt-assessment failed:', e); process.exit(1) }).finally(() => prisma.$disconnect())
}
