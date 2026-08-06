/**
 * Create/rebuild "Content Migration - Combination Knowledge Assessment (Set
 * B)": a fixed 50-question, 50-minute knowledge test (client-supplied
 * "Content Migration - Combination Knowledge Assessment (Set B)" document)
 * with 5 sections, 10 questions each:
 *   - Egnyte to OneDrive
 *   - Box to Microsoft (OneDrive & SharePoint)
 *   - ShareFile to OneDrive
 *   - ShareFile to SharePoint
 *   - Egnyte to SharePoint
 *
 * Like Migration Assessment (Freshers), this pool has no process/technical/
 * flow categorization — it's a straight, client-authored 50-Q exam, so each
 * section uses a plain pickCount (defaults to its full pool, i.e. no
 * randomization out of the box) instead of a stratified draw.
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
 *   docker exec -w /app neutaraassessment-backend-1 npx tsx prisma/create-content-migration-combination-set-b.ts
 *
 * Env overrides: TEST_TITLE (default "Content Migration - Combination Knowledge Assessment (Set B)"),
 *                APTITUDE_BANK_NAME (default "Freshers Assessment 1" — used only
 *                to resolve the tenant/admin, not as a question source),
 *                DURATION_MIN (default 50).
 */
import { PrismaClient, TestStatus } from '@prisma/client'
const prisma = new PrismaClient()

export const CONTENT_MIGRATION_SET_B_BANK_NAME = 'Content Migration Combination Set B Questions Bank'

type Section = 'egnyte-onedrive' | 'box-to-microsoft' | 'sharefile-onedrive' | 'sharefile-sharepoint' | 'egnyte-sharepoint'
const SECTION_TITLES: Record<Section, string> = {
  'egnyte-onedrive': 'Egnyte to OneDrive',
  'box-to-microsoft': 'Box to Microsoft (OneDrive & SharePoint)',
  'sharefile-onedrive': 'ShareFile to OneDrive',
  'sharefile-sharepoint': 'ShareFile to SharePoint',
  'egnyte-sharepoint': 'Egnyte to SharePoint',
}
const SECTION_ORDER: Section[] = ['egnyte-onedrive', 'box-to-microsoft', 'sharefile-onedrive', 'sharefile-sharepoint', 'egnyte-sharepoint']

export const CONTENT_MIGRATION_SET_B_QUESTIONS: { body: string; options: string[]; correct: number; section: Section }[] = [
  // ── Section 1: Egnyte to OneDrive (10) ───────────────────────────────────
  { section: 'egnyte-onedrive', body: 'Which of these is NOT part of the Egnyte to OneDrive feature set?', options: ['Shared links migration', 'Long folder-path handling', 'Inner file permissions', 'Special character handling'], correct: 2 },
  { section: 'egnyte-onedrive', body: 'In Egnyte to OneDrive, created and modified dates are kept by which feature?', options: ['Metadata', 'Delta migration', 'Embedded links', 'Shared links'], correct: 0 },
  { section: 'egnyte-onedrive', body: 'In Egnyte to OneDrive, hyperlinks pointing to other files are:', options: ['Deleted before the transfer runs', 'Turned into plain URL text', 'Emailed to the file owner', 'Rebuilt into the destination format'], correct: 3 },
  { section: 'egnyte-onedrive', body: 'Which pair of features BOTH appear in Egnyte to OneDrive?', options: ['Metadata and inner file permissions', 'Metadata and structure preservation', 'Group permissions and external shares', 'Inline comments and shared links'], correct: 1 },
  { section: 'egnyte-onedrive', body: 'Incremental changes made during the first pass are moved by the:', options: ['Metadata step', 'One-time step', 'Delta step', 'Embedded-links step'], correct: 2 },
  { section: 'egnyte-onedrive', body: 'The very first full transfer of data is called the:', options: ['One-time migration', 'Delta migration', 'Selective migration', 'Pilot migration'], correct: 0 },
  { section: 'egnyte-onedrive', body: 'Which feature is in Egnyte to OneDrive but NOT in Egnyte to SharePoint?', options: ['Inner file permissions', 'Long folder-path handling', 'External shares', 'Inline comments'], correct: 1 },
  { section: 'egnyte-onedrive', body: 'Which feature is in Egnyte to SharePoint but NOT in Egnyte to OneDrive?', options: ['Long folder-path handling', 'Special character handling', 'Embedded links', 'Suppressing email notifications'], correct: 3 },
  { section: 'egnyte-onedrive', body: 'Which statement about Egnyte to OneDrive is correct?', options: ['It has no dedicated permissions feature', 'It converts documents into PDFs', 'It migrates chat message history', 'It creates SharePoint sites for clients'], correct: 0 },
  { section: 'egnyte-onedrive', body: 'Egnyte to OneDrive does NOT include which of these?', options: ['Delta migration', 'Metadata', 'External shares', 'Embedded links'], correct: 2 },

  // ── Section 2: Box to Microsoft (OneDrive & SharePoint) (10) ────────────
  { section: 'box-to-microsoft', body: 'In Box Notes migration, tags attached to a note are:', options: ['Kept and remain fully searchable', 'Not migrated to the destination', 'Turned into plain text labels', 'Converted into folder names'], correct: 1 },
  { section: 'box-to-microsoft', body: 'Shared links created inside Box Notes are:', options: ['Migrated with their permissions', 'Migrated but set to view-only', 'Backed up to the owner', 'Dropped during the migration'], correct: 3 },
  { section: 'box-to-microsoft', body: 'A Box Note mention or annotation arrives at the destination as:', options: ['Plain text, not a mention tag', 'A clickable, linked mention', 'A comment on the document', 'A banner at the top'], correct: 0 },
  { section: 'box-to-microsoft', body: 'Files added via the direct media-upload option in a Box Note are:', options: ['Migrated with positions kept', 'Migrated as small thumbnails', 'Skipped and not migrated', 'Migrated only when small'], correct: 2 },
  { section: 'box-to-microsoft', body: "Files added through the 'insert link preview' option are:", options: ['Kept as a live preview', 'Left out of the migration', 'Kept as a static image', 'Kept as link text only'], correct: 1 },
  { section: 'box-to-microsoft', body: 'Font sizes and text colours from the source Box Notes are:', options: ['Kept exactly as in the source', 'Changed to bold black text', 'Kept for headings only', 'Lost, becoming uniform and default'], correct: 3 },
  { section: 'box-to-microsoft', body: 'Checklists, numbered lists, and bulleted lists all migrate as:', options: ['The exact list type used', 'Plain paragraphs with no list', 'A numbered list, losing structure', 'Checklists only, dropping the rest'], correct: 2 },
  { section: 'box-to-microsoft', body: 'Strikethrough text in a Box Note migrates as:', options: ['Plain text, losing the strikethrough', 'Text keeping the strikethrough line', 'A removed, deleted line', 'Text highlighted in colour'], correct: 0 },
  { section: 'box-to-microsoft', body: 'Table content from Box Notes reaches Microsoft Docs:', options: ['Cleanly, with formatting intact', 'As a set of bulleted lists', 'With only the first row kept', 'Broken, distorted, and hard to read'], correct: 3 },
  { section: 'box-to-microsoft', body: 'Which Box Note element does not migrate in any form at all?', options: ['Strikethrough-formatted text', 'Directly uploaded media files', 'Annotations and mentions', 'Numbered list items'], correct: 1 },

  // ── Section 3: ShareFile to OneDrive (10) ────────────────────────────────
  { section: 'sharefile-onedrive', body: 'Group Permissions in ShareFile to OneDrive transfers:', options: ['Groups, members, and access control', "Only single-user file rights", "Only the folder owner's rights", 'Group names without any members'], correct: 0 },
  { section: 'sharefile-onedrive', body: "Password-protected links ('Anyone with the password') are:", options: ['Moved with the same password', 'Moved with a blank password', 'Not supported at the destination', 'Moved, then reset by the user'], correct: 2 },
  { section: 'sharefile-onedrive', body: 'Password links cannot move to Microsoft because:', options: ['Microsoft blocks all shared links', 'The password cannot be exported', 'The links exceed the path limit', 'Clients always ask to drop them'], correct: 1 },
  { section: 'sharefile-onedrive', body: 'Which permission feature is the standout of ShareFile to OneDrive?', options: ['Root folder permissions', 'Sub-folder permissions', 'External shares', 'Group permissions'], correct: 3 },
  { section: 'sharefile-onedrive', body: 'The Versions feature in ShareFile to OneDrive migrates:', options: ['All versions of each file', 'Only the latest version', 'Only the first version', 'The last five versions only'], correct: 0 },
  { section: 'sharefile-onedrive', body: 'Which of the following is supported in ShareFile to OneDrive?', options: ['Password-protected share links', 'Converting files into PDFs', 'Migrating user groups', 'Migrating deleted files'], correct: 2 },
  { section: 'sharefile-onedrive', body: 'Folder and sub-folder permissions in this combination are:', options: ['Reset to the default state', 'Migrated for the root only', 'Replaced by admin rights', 'Kept with their access levels'], correct: 3 },
  { section: 'sharefile-onedrive', body: 'One ShareFile to OneDrive set is notable for listing:', options: ['A password-link limitation', 'A set of Box Note issues', 'Message-history migration', 'SharePoint-site creation'], correct: 0 },
  { section: 'sharefile-onedrive', body: 'In ShareFile to OneDrive, created/modified dates are handled by:', options: ['The group-permissions feature', 'The metadata feature', 'The shared-links feature', 'The versions feature'], correct: 1 },
  { section: 'sharefile-onedrive', body: 'Which of these does ShareFile to OneDrive NOT do?', options: ['Preserve the folder structure', 'Replace unsupported characters', 'Keep password-protected links', 'Migrate external shares'], correct: 2 },

  // ── Section 4: ShareFile to SharePoint (10) ──────────────────────────────
  { section: 'sharefile-sharepoint', body: 'Inline file comments in ShareFile to SharePoint are:', options: ['Placed onto each file', 'Discarded after migration', 'Turned into shared links', 'Saved to a CSV file'], correct: 3 },
  { section: 'sharefile-sharepoint', body: 'With Selective Versions set to five, this combination moves:', options: ['The first five versions', 'The last five versions', 'Only version number five', 'Every version except five'], correct: 1 },
  { section: 'sharefile-sharepoint', body: 'Group Permissions for this combination preserve:', options: ["Only the top folder's owner", 'Only external-user access', 'Groups, members, and structure', 'Group names without members'], correct: 2 },
  { section: 'sharefile-sharepoint', body: 'Version History in ShareFile to SharePoint migrates:', options: ['All versions of each file', 'Only the current version', "Only last week's versions", 'No versions, just the file'], correct: 0 },
  { section: 'sharefile-sharepoint', body: 'Which file permissions does this combination keep with access levels?', options: ['Shared-link permissions only', 'External-share permissions only', 'No file-level permissions', 'Root and inner file permissions'], correct: 3 },
  { section: 'sharefile-sharepoint', body: 'In ShareFile to SharePoint, embedded links inside files are:', options: ['Removed during the transfer', 'Rebuilt into the destination format', 'Turned into plain text', 'Kept only for websites'], correct: 1 },
  { section: 'sharefile-sharepoint', body: 'Delta migration in this combination refers to:', options: ['Incremental changes during one-time', 'The first full data copy', 'Only permission changes', 'A full re-run from zero'], correct: 0 },
  { section: 'sharefile-sharepoint', body: 'Which feature lets ShareFile to SharePoint move whole user groups?', options: ['External shares', 'Root file permissions', 'Group permissions', 'Shared links'], correct: 2 },
  { section: 'sharefile-sharepoint', body: 'Shared links in ShareFile to SharePoint are migrated by:', options: ['Keeping internal links only', 'Setting all to editor access', 'Dropping them with alerts', 'Moving all and keeping their type'], correct: 3 },
  { section: 'sharefile-sharepoint', body: 'Which comment behaviour is true for ShareFile to SharePoint?', options: ['Comments are not migrated at all', 'Comments are saved to a CSV', 'Comments become file version notes', 'Comments turn into shared links'], correct: 1 },

  // ── Section 5: Egnyte to SharePoint (10) ─────────────────────────────────
  { section: 'egnyte-sharepoint', body: 'How many permission features does Egnyte to SharePoint include?', options: ['Two', 'Three', 'Five', 'One'], correct: 2 },
  { section: 'egnyte-sharepoint', body: 'Which of these is a permission type in Egnyte to SharePoint?', options: ['Inner file permissions', 'Print-only permissions', 'Time-limited permissions', 'Download-count permissions'], correct: 0 },
  { section: 'egnyte-sharepoint', body: 'Inline file comments in Egnyte to SharePoint are:', options: ['Kept in the source only', 'Split into separate files', 'Merged into the text', 'Saved to a CSV file'], correct: 3 },
  { section: 'egnyte-sharepoint', body: 'External Shares in Egnyte to SharePoint means sharing with:', options: ['Members of the same team', 'People outside the organization', 'Nobody; sharing is off', 'The destination admin only'], correct: 1 },
  { section: 'egnyte-sharepoint', body: 'Which feature is in Egnyte to SharePoint but NOT Egnyte to OneDrive?', options: ['Inline file comments', 'Long folder-path handling', 'Special character handling', 'Embedded links'], correct: 0 },
  { section: 'egnyte-sharepoint', body: 'The versions feature in Egnyte to SharePoint is based on:', options: ['Migrating all first versions', 'Migrating one version only', 'Selecting certain versions to migrate', 'Migrating no versions at all'], correct: 2 },
  { section: 'egnyte-sharepoint', body: 'Root file permissions in this combination apply to:', options: ['Folders only, never files', 'Files in sub-folders only', 'The owner alone, no others', 'Root-level files, with access levels'], correct: 3 },
  { section: 'egnyte-sharepoint', body: 'The Suppressing Email Notification feature prevents:', options: ['Any migration from starting', 'Users from logging in', 'Collaboration emails from the destination', 'Files from being shared'], correct: 2 },
  { section: 'egnyte-sharepoint', body: 'Which of these is NOT a feature of Egnyte to SharePoint?', options: ['Embedded links', 'Selective versions', 'External shares', 'Inline comments'], correct: 0 },
  { section: 'egnyte-sharepoint', body: 'In Egnyte to SharePoint, migrated inline comments are stored:', options: ["In each file's properties", 'In a CSV file', 'In the version history', 'In a PDF report'], correct: 1 },
]

export async function main() {
  const testTitle = process.env.TEST_TITLE || 'Content Migration - Combination Knowledge Assessment (Set B)'
  const aptitudeBankName = process.env.APTITUDE_BANK_NAME || 'Freshers Assessment 1'
  const durationMin = Number(process.env.DURATION_MIN) || 50

  const aptiBank = await prisma.questionBank.findFirst({ where: { name: aptitudeBankName } })
  if (!aptiBank) throw new Error(`Bank "${aptitudeBankName}" not found — needed to resolve tenant/admin.`)
  const tenantId = aptiBank.tenantId

  const admin = await prisma.user.findFirst({
    where: { tenantId, role: { in: ['SUPER_ADMIN', 'COMPANY_ADMIN'] } },
    orderBy: { createdAt: 'asc' },
  })
  if (!admin) throw new Error('No admin user found for the tenant.')

  let bank = await prisma.questionBank.findFirst({ where: { name: CONTENT_MIGRATION_SET_B_BANK_NAME, tenantId } })
  if (!bank) {
    bank = await prisma.questionBank.create({ data: { name: CONTENT_MIGRATION_SET_B_BANK_NAME, tenantId, description: 'Content Migration - Combination Knowledge Assessment (Set B), client-supplied 50-question fixed exam across 5 cloud-combination sections (Egnyte/Box/ShareFile to OneDrive/SharePoint).' } })
  }

  let created = 0
  let updated = 0
  for (let i = 0; i < CONTENT_MIGRATION_SET_B_QUESTIONS.length; i++) {
    const title = `Content Migration Set B Q${i + 1}`
    const q = CONTENT_MIGRATION_SET_B_QUESTIONS[i]
    const optionsData = q.options.map((text, idx) => ({ text, isCorrect: idx === q.correct, order: idx }))
    const existing = await prisma.question.findFirst({ where: { bankId: bank.id, title }, include: { options: { orderBy: { order: 'asc' } } } })

    if (!existing) {
      await prisma.question.create({
        data: {
          bankId: bank.id, type: 'MCQ_SINGLE', title, body: q.body,
          difficulty: 'MEDIUM', points: 1, domain: 'Content Migration Combinations', tags: [q.section],
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
  console.log(`Content Migration Set B bank: ${created} created, ${updated} updated, ${CONTENT_MIGRATION_SET_B_QUESTIONS.length - created - updated} unchanged.`)

  const expectedTitles = CONTENT_MIGRATION_SET_B_QUESTIONS.map((_, i) => `Content Migration Set B Q${i + 1}`)
  const questionsByTitle = new Map(
    (await prisma.question.findMany({ where: { bankId: bank.id, title: { in: expectedTitles } }, select: { id: true, title: true, tags: true } }))
      .map(q => [q.title, q])
  )
  const orderedQuestions = expectedTitles.map(t => questionsByTitle.get(t)!).filter(Boolean)

  const sectionSummary = SECTION_ORDER.map(sec => `${SECTION_TITLES[sec]} ${orderedQuestions.filter(q => (q.tags as string[])?.includes(sec)).length}`).join(', ')
  const instructions = `Content Migration - Combination Knowledge Assessment (Set B) — ${durationMin} minutes, 50 questions across 5 sections.

${SECTION_ORDER.map(sec => `• ${SECTION_TITLES[sec]} — ${orderedQuestions.filter(q => (q.tags as string[])?.includes(sec)).length} questions`).join('\n')}

1 mark each. Choose the best option.`

  let test = await prisma.test.findFirst({ where: { title: testTitle, tenantId } })
  if (!test) {
    test = await prisma.test.create({
      data: {
        title: testTitle, domain: 'Content Migration Combinations', duration: durationMin,
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
  }

  console.log(`\n✅ "${testTitle}": ${sectionSummary}. ${durationMin} min total, 50 marks. Status DRAFT — publish it in the admin UI to use.\n   Adjust pickCount / time per section, or overall duration, any time from Admin > Tests > this test.`)
}

if (require.main === module) {
  main().catch(e => { console.error('❌ create-content-migration-combination-set-b failed:', e); process.exit(1) }).finally(() => prisma.$disconnect())
}
