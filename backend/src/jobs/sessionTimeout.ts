import cron from 'node-cron'
import { prisma } from '../db'
import { scoreSession } from '../services/scoring'

// Runs every 5 minutes. Finds IN_PROGRESS sessions whose timeoutAt has passed
// and auto-submits them as TIMED_OUT, then scores any answers already submitted.
export function startSessionTimeoutJob() {
  cron.schedule('*/5 * * * *', async () => {
    try {
      await timeoutExpiredSessions()
    } catch (err) {
      console.error('[sessionTimeout] job error:', err)
    }
  })
  console.log('[sessionTimeout] 5-minute expiry enforcement job started')
}

async function timeoutExpiredSessions() {
  const now = new Date()

  const expired = await prisma.session.findMany({
    where: {
      status: 'IN_PROGRESS',
      timeoutAt: { lt: now },
    },
    select: { id: true, invitationId: true },
  })

  if (expired.length === 0) return
  console.log(`[sessionTimeout] timing out ${expired.length} expired session(s)`)

  for (const { id, invitationId } of expired) {
    try {
      await prisma.session.update({
        where: { id },
        data: { status: 'TIMED_OUT', submittedAt: now },
      })
      if (invitationId) {
        await prisma.invitation.update({ where: { id: invitationId }, data: { status: 'COMPLETED' } })
      }
      await scoreSession(id)
      console.log(`[sessionTimeout] timed out session ${id}`)
    } catch (err) {
      console.error(`[sessionTimeout] failed for session ${id}:`, err)
    }
  }
}
