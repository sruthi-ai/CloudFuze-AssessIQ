/**
 * Delete candidate ATTEMPT data (sessions + their answers/scores/proctoring) for a
 * test, so a botched batch can be re-run clean. Does NOT touch the test, its
 * questions, config, or any other data — safe for the product.
 *
 * Dry-run (default) just shows what would be deleted:
 *   docker exec -w /app neutaraassessment-backend-1 npx tsx prisma/purge-attempts.ts
 *
 * To actually delete, and reset invitations so the same candidates can retake:
 *   docker exec -e PURGE_CONFIRM=YES -w /app neutaraassessment-backend-1 npx tsx prisma/purge-attempts.ts
 *
 * Optional: -e TEST_TITLE="Freshers Assessment 1" (default), -e DELETE_INVITES=YES
 * (also remove the invitations instead of resetting them).
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const title = process.env.TEST_TITLE || 'Freshers Assessment 1'
  const confirm = process.env.PURGE_CONFIRM === 'YES'
  const deleteInvites = process.env.DELETE_INVITES === 'YES'

  const test = await prisma.test.findFirst({ where: { title }, orderBy: { createdAt: 'asc' } })
  if (!test) throw new Error(`Test "${title}" not found.`)

  const sessions = await prisma.session.count({ where: { testId: test.id } })
  const invites = await prisma.invitation.count({ where: { testId: test.id } })
  console.log(`Test: "${title}"  →  sessions: ${sessions}, invitations: ${invites}`)

  if (!confirm) {
    console.log('\nDRY RUN — nothing deleted. Re-run with PURGE_CONFIRM=YES to delete the sessions above')
    console.log('(answers/scores/proctoring cascade with them). The test, questions and config are untouched.')
    return
  }

  // Deleting sessions cascades to answers, scores, proctoring events, snapshots, recordings.
  const del = await prisma.session.deleteMany({ where: { testId: test.id } })
  console.log(`✔ deleted ${del.count} sessions (+ cascaded answers/scores/proctoring)`)

  if (deleteInvites) {
    const inv = await prisma.invitation.deleteMany({ where: { testId: test.id } })
    console.log(`✔ deleted ${inv.count} invitations`)
  } else {
    const reset = await prisma.invitation.updateMany({ where: { testId: test.id }, data: { status: 'SENT', openedAt: null } })
    console.log(`✔ reset ${reset.count} invitations to SENT (candidates can retake the existing link)`)
  }

  console.log('✅ Attempt data cleared. Test/questions/config intact.')
  console.log('Note: uploaded media files (recordings/snapshots) on disk are orphaned but harmless; clear the uploads/ volume separately if you want the disk space back.')
}

main().catch(e => { console.error('❌ Purge failed:', e); process.exit(1) }).finally(() => prisma.$disconnect())
