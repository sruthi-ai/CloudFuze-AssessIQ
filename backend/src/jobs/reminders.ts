import cron from 'node-cron'
import { prisma } from '../db'
import { sendInvitationEmail } from '../utils/email'

// Runs every hour. Finds PENDING invitations expiring in the next 24h
// that haven't had a reminder sent yet, and emails each candidate once.
export function startReminderJob() {
  cron.schedule('0 * * * *', async () => {
    try {
      await sendExpiryReminders()
    } catch (err) {
      console.error('[reminders] job error:', err)
    }
  })
  console.log('[reminders] hourly expiry reminder job started')
}

async function sendExpiryReminders() {
  const now = new Date()
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  // Invitations expiring in the next 24h, still PENDING, no reminder sent yet
  const invitations = await prisma.invitation.findMany({
    where: {
      status: 'PENDING',
      expiresAt: { lte: in24h, gt: now },
      reminderSentAt: null,
    },
    include: {
      candidate: { select: { firstName: true, lastName: true, email: true } },
      test: {
        select: {
          title: true,
          tenant: { select: { name: true, settings: true } },
        },
      },
    },
  })

  if (invitations.length === 0) return

  console.log(`[reminders] sending ${invitations.length} expiry reminder(s)`)

  for (const inv of invitations) {
    try {
      const tenantSettings = inv.test.tenant.settings as Record<string, unknown> | null
      await sendInvitationEmail({
        to: inv.candidate.email,
        candidateName: `${inv.candidate.firstName} ${inv.candidate.lastName}`,
        testTitle: inv.test.title,
        companyName: inv.test.tenant.name,
        token: inv.token,
        expiresAt: inv.expiresAt,
        message: `Reminder: your assessment link expires in less than 24 hours. Please complete it before the deadline.`,
        tenantSettings: tenantSettings as any,
      })

      await prisma.invitation.update({
        where: { id: inv.id },
        data: { reminderSentAt: now },
      })

      console.log(`[reminders] sent reminder to ${inv.candidate.email} for test "${inv.test.title}"`)
    } catch (err) {
      console.error(`[reminders] failed for invitation ${inv.id}:`, err)
    }
  }
}
