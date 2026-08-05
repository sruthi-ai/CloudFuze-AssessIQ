/**
 * Create/rebuild "Migration Assessment (Freshers)": a fixed 40-question,
 * 40-minute knowledge test (client-supplied "Migration Training – Knowledge
 * Assessment" document) with 2 sections:
 *   - Migration Features & Behaviour: 25 questions, 25 minutes.
 *   - Migration Process, Setup & Validation: 15 questions, 15 minutes.
 *
 * Unlike the other Migration assessments, this pool has no process/
 * technical/flow categorization — it's a straight, client-authored 40-Q
 * exam, so each section uses a plain pickCount (defaults to its full pool,
 * i.e. no randomization out of the box) instead of a stratified draw.
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
 *   docker exec -w /app neutaraassessment-backend-1 npx tsx prisma/create-migration-assessment-freshers.ts
 *
 * Env overrides: TEST_TITLE (default "Migration Assessment (Freshers)"),
 *                APTITUDE_BANK_NAME (default "Freshers Assessment 1" — used only
 *                to resolve the tenant/admin, not as a question source),
 *                DURATION_MIN (default 40).
 */
import { PrismaClient, TestStatus } from '@prisma/client'
const prisma = new PrismaClient()

export const MIGRATION_FRESHERS_BANK_NAME = 'Migration Assessment (Freshers) Questions Bank'

type Section = 'features' | 'process'
export const MIGRATION_FRESHERS_QUESTIONS: { body: string; options: string[]; correct: number; section: Section }[] = [
  // ── Section 1: Migration Features & Behaviour (25) ──────────────────────
  { section: 'features', body: 'Which of the following is one of the three main types of migration?', options: ['Content', 'Hardware', 'License', 'Firmware'], correct: 0 },
  { section: 'features', body: 'One Time Migration refers to:', options: ['Migration of incremental changes after go-live', 'A migration performed only on weekends', 'The initial data migration from source to destination', 'A trial migration done for one or two users'], correct: 2 },
  { section: 'features', body: 'Delta Migration means:', options: ['The very first full data transfer', 'Migration of incremental changes made in the source during the one-time migration', 'Deleting duplicate files at the destination', 'Migrating only selected file versions'], correct: 1 },
  { section: 'features', body: 'The data migration of files and folders (with structure) mainly preserves:', options: ['The colours and labels of folders', 'Email notifications for shared files', 'Only the newest version of each file', 'The accuracy and integrity of the data structure'], correct: 3 },
  { section: 'features', body: 'When permissions (root folder, root file, sub-folder, inner file) are migrated, what is preserved along with them?', options: ['Access levels', 'File thumbnails', 'Download counts', 'Storage quotas'], correct: 0 },
  { section: 'features', body: 'The External Shares feature handles permissions for:', options: ['Files kept only at the root level', 'Files shared internally between sub-folders', 'Files that have no sharing at all', 'Files/folders shared with people outside the organization'], correct: 3 },
  { section: 'features', body: 'When an "Anyone with the link (viewing/editing)" link is migrated, it becomes:', options: ['Restricted (Viewer/Editor)', 'Private (Owner only)', 'Anyone with the link (Viewer/Editor)', 'Sync Orbit (Viewer/Editor)'], correct: 2 },
  { section: 'features', body: 'When a "Team members" shared link is migrated, it becomes:', options: ['Anyone with the link (Viewer/Editor)', 'Sync Orbit (Viewer/Editor)', 'Team members (Viewer/Editor)', 'Public (Viewer/Editor)'], correct: 1 },
  { section: 'features', body: 'After shared links are migrated, what is produced at the destination?', options: ['An email alert to each collaborator', 'A CSV file listing source path, destination path, and the shared links', 'A deletion of the original links', 'A backup copy of every shared file'], correct: 1 },
  { section: 'features', body: 'The Metadata feature maintains:', options: ['The access levels of each shared user', 'The version history of each file', 'The comments added to each file', 'The original timestamps such as creation and modification dates and times'], correct: 3 },
  { section: 'features', body: 'Special characters that the destination cloud does not support are:', options: ['Replaced with underscores (_) or hyphens (-)', 'Left unchanged', 'Deleted from the file name completely', 'Replaced with random numbers'], correct: 0 },
  { section: 'features', body: 'The suppressing email notifications feature is designed to:', options: ['Send a summary email once migration finishes', 'Forward all notifications to the admin', 'Prevent email notifications generated for collaborations on files/folders', 'Turn off the destination mailbox'], correct: 2 },
  { section: 'features', body: 'If the destination cloud has a long folder-path limitation, the system:', options: ['Skips those files entirely', 'Automatically adjusts the destination path to fit the limitation', 'Splits the file into smaller pieces', 'Stops the migration until it is fixed manually'], correct: 1 },
  { section: 'features', body: 'The Embedded Links feature deals with links that:', options: ['Point to external websites only', 'Are shared with external users', 'Point to other files within the cloud', 'Exist inside email signatures'], correct: 2 },
  { section: 'features', body: 'With Selective Versions, if you choose five:', options: ['The last five versions are migrated', 'Only the first version is kept', 'All versions except five are migrated', 'The first five versions are migrated'], correct: 0 },
  { section: 'features', body: 'Dropbox Paper documents are migrated and converted into:', options: ['PDF files', 'Plain text files', 'Microsoft Word files', 'Google Docs (.gdoc) files'], correct: 3 },
  { section: 'features', body: 'During text-formatting migration, which element is NOT carried over?', options: ['Bold text', 'Headings (H1, H2)', 'Highlight colors', 'Links'], correct: 2 },
  { section: 'features', body: 'Which element is NOT properly migrated and appears as an unsupported element?', options: ['GIFs', 'Emojis', 'Bulleted lists', 'Inserted images'], correct: 0 },
  { section: 'features', body: 'How are section breaks handled during migration?', options: ['Converted into a page break', 'Turned into a horizontal line', 'Migrated as a new document', 'Not migrated; no separators appear at the destination'], correct: 3 },
  { section: 'features', body: 'When a code block is migrated:', options: ['Both the content and the formatting are fully preserved', 'The content migrates, but the code-block formatting is not fully preserved', 'The block is skipped entirely', 'It is converted into a table'], correct: 1 },
  { section: 'features', body: 'After migration, mentions appear as:', options: ['Proper mentions with valid links', 'Comments on the file', 'Plain text, not proper mentions', 'Removed completely'], correct: 2 },
  { section: 'features', body: 'What happens to comments after migration?', options: ['They are migrated and remain attached', 'They are not migrated to the destination', 'They are converted into mentions', 'They become separate documents'], correct: 1 },
  { section: 'features', body: 'For tables with richer/larger cell content, the maximum number of columns that migrate (aligning with Google Docs limits) is about:', options: ['26 columns', '120 columns', 'Unlimited', '62 columns'], correct: 3 },
  { section: 'features', body: 'An inserted timeline is migrated at the destination as:', options: ['A table', 'A chart', 'An image', 'A checklist'], correct: 0 },
  { section: 'features', body: 'A to-do list is migrated as:', options: ['A plain paragraph', 'A table of tasks', 'Separate individual files', 'A checklist with checkbox states and text preserved'], correct: 3 },

  // ── Section 2: Migration Process, Setup & Validation (15) ───────────────
  { section: 'process', body: 'For Google, which account is the top, highest-privileged account used for the migration?', options: ['Global Admin', 'Super Admin', 'Owner', 'Delegated Admin'], correct: 1 },
  { section: 'process', body: 'On the Microsoft side, the equivalent highest-privileged admin account is:', options: ['Root Admin', 'Global Admin', 'Super Admin', 'Tenant Owner'], correct: 1 },
  { section: 'process', body: 'A pilot migration is best described as:', options: ['The final migration of all remaining data', 'Migration of only the incremental changes', 'A test migration, usually for one or two users, that the client reviews', 'The removal of the server after completion'], correct: 2 },
  { section: 'process', body: 'Migrations are carried out primarily through:', options: ['APIs', 'Manual copy-paste', 'FTP file transfer', 'Physical drives'], correct: 0 },
  { section: 'process', body: 'In Google Workspace, the two drive types are:', options: ['OneDrive and SharePoint', 'Team Drive and Backup Drive', 'Personal Drive and Public Drive', 'My Drive and Shared Drive'], correct: 3 },
  { section: 'process', body: 'On the Microsoft side, the two storage areas are:', options: ['OneDrive and SharePoint', 'My Drive and Shared Drive', 'Google Drive and Gmail', 'Box and Dropbox'], correct: 0 },
  { section: 'process', body: "What is the correct practice regarding the client's cloud credentials?", options: ['Collect them by email and store them safely', 'Only the manager may request them', 'Never ask for them; the client enters their own credentials', 'Share them openly in the team group'], correct: 2 },
  { section: 'process', body: 'In the migration journey, which is the final phase — where the team helps the client resolve any missed files or permissions?', options: ['Post-migration support', 'Server onboarding', 'Pilot migration', 'Pre-migration validation'], correct: 0 },
  { section: 'process', body: 'The first step during onboarding is:', options: ['Delta migration', 'Server decommissioning', 'Permission mapping', 'The kickoff / first meeting with the client'], correct: 3 },
  { section: 'process', body: 'SOW stands for:', options: ['Source of Work', 'Scope of Work', 'Statement of Warranty', 'Standard Operating Workflow'], correct: 1 },
  { section: 'process', body: 'Mapping validation is mainly made up of which two checks?', options: ['Source path and destination path validation', 'Pilot and delta validation', 'User CSV and Permission CSV validation', 'File and folder structure validation'], correct: 2 },
  { section: 'process', body: 'Before migration, a destination user (especially on Microsoft) must:', options: ['Delete their old data', 'Be made a global admin', 'Log in to the account at least once', 'Create a shared drive'], correct: 2 },
  { section: 'process', body: 'In the CSV mapping file, the four columns are:', options: ['Source cloud, source path, destination cloud, destination path', 'Source email, source folder, destination email, destination folder', 'Source cloud, user name, destination cloud, file size', 'Source path, permission type, destination path, access level'], correct: 0 },
  { section: 'process', body: 'During the migration, resyncing the cloud is avoided because:', options: ['It speeds up the migration too much', 'It deletes the CSV file', 'It logs the user out permanently', 'It can cause conflicts if the client made changes'], correct: 3 },
  { section: 'process', body: 'Regarding user access, which statement is correct?', options: ['Users may access both source and destination at all times', 'Users can access the source during one-time migration, but must not access source or destination during delta', 'Users cannot access anything from the kickoff onward', 'Users can access only the destination during delta'], correct: 1 },
]

export async function main() {
  const testTitle = process.env.TEST_TITLE || 'Migration Assessment (Freshers)'
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

  let bank = await prisma.questionBank.findFirst({ where: { name: MIGRATION_FRESHERS_BANK_NAME, tenantId } })
  if (!bank) {
    bank = await prisma.questionBank.create({ data: { name: MIGRATION_FRESHERS_BANK_NAME, tenantId, description: 'Migration Training - Knowledge Assessment (client-supplied 40-question fixed exam): 25 Migration Features & Behaviour, 15 Migration Process/Setup/Validation.' } })
  }

  let created = 0
  let updated = 0
  for (let i = 0; i < MIGRATION_FRESHERS_QUESTIONS.length; i++) {
    const title = `Migration Freshers Q${i + 1}`
    const q = MIGRATION_FRESHERS_QUESTIONS[i]
    const optionsData = q.options.map((text, idx) => ({ text, isCorrect: idx === q.correct, order: idx }))
    const existing = await prisma.question.findFirst({ where: { bankId: bank.id, title }, include: { options: { orderBy: { order: 'asc' } } } })

    if (!existing) {
      await prisma.question.create({
        data: {
          bankId: bank.id, type: 'MCQ_SINGLE', title, body: q.body,
          difficulty: 'MEDIUM', points: 1, domain: 'Migration Training', tags: [q.section],
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
  console.log(`Migration Freshers bank: ${created} created, ${updated} updated, ${MIGRATION_FRESHERS_QUESTIONS.length - created - updated} unchanged.`)

  const expectedTitles = MIGRATION_FRESHERS_QUESTIONS.map((_, i) => `Migration Freshers Q${i + 1}`)
  const questionsByTitle = new Map(
    (await prisma.question.findMany({ where: { bankId: bank.id, title: { in: expectedTitles } }, select: { id: true, title: true, tags: true } }))
      .map(q => [q.title, q])
  )
  const orderedQuestions = expectedTitles.map(t => questionsByTitle.get(t)!).filter(Boolean)
  const featuresQuestions = orderedQuestions.filter(q => (q.tags as string[])?.includes('features'))
  const processQuestions = orderedQuestions.filter(q => (q.tags as string[])?.includes('process'))

  const instructions = `Migration Assessment (Freshers) — ${durationMin} minutes, 40 questions across 2 sections.

• Migration Features & Behaviour — ${featuresQuestions.length} questions
• Migration Process, Setup & Validation — ${processQuestions.length} questions

1 mark each. Choose the best option.`

  let test = await prisma.test.findFirst({ where: { title: testTitle, tenantId } })
  if (!test) {
    test = await prisma.test.create({
      data: {
        title: testTitle, domain: 'Migration Training', duration: durationMin,
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

  const featuresSection = await prisma.testSection.create({
    data: {
      testId: test.id, title: 'Migration Features & Behaviour', skill: 'GENERAL', order: 0,
      timeLimit: featuresQuestions.length * 60, pickCount: featuresQuestions.length,
      description: `${featuresQuestions.length} questions (of a bank of ${featuresQuestions.length}) — pickCount and time limit are editable from the Test Builder UI. 1 mark each.`,
    },
  })
  await prisma.testQuestion.createMany({
    data: featuresQuestions.map((q, i) => ({ testId: test!.id, sectionId: featuresSection.id, questionId: q.id, order: i, points: 1 })),
  })

  const processSection = await prisma.testSection.create({
    data: {
      testId: test.id, title: 'Migration Process, Setup & Validation', skill: 'GENERAL', order: 1,
      timeLimit: processQuestions.length * 60, pickCount: processQuestions.length,
      description: `${processQuestions.length} questions (of a bank of ${processQuestions.length}) — pickCount and time limit are editable from the Test Builder UI. 1 mark each.`,
    },
  })
  await prisma.testQuestion.createMany({
    data: processQuestions.map((q, i) => ({ testId: test!.id, sectionId: processSection.id, questionId: q.id, order: i, points: 1 })),
  })

  console.log(`\n✅ "${testTitle}": Migration Features & Behaviour ${featuresQuestions.length}/${featuresQuestions.length} + Migration Process, Setup & Validation ${processQuestions.length}/${processQuestions.length}. ${durationMin} min total, 40 marks. Status DRAFT — publish it in the admin UI to use.\n   Adjust pickCount / time per section, or overall duration, any time from Admin > Tests > this test.`)
}

if (require.main === module) {
  main().catch(e => { console.error('❌ create-migration-assessment-freshers failed:', e); process.exit(1) }).finally(() => prisma.$disconnect())
}
