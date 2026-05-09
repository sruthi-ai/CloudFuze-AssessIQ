import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const FROM = process.env.FROM_EMAIL || 'noreply@assessiq.com'
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

export async function sendInvitationEmail(params: {
  to: string
  candidateName: string
  testTitle: string
  companyName: string
  token: string
  expiresAt: Date
  message?: string
}) {
  const url = `${FRONTEND_URL}/take/${params.token}`
  const expiry = params.expiresAt.toLocaleDateString('en-US', { dateStyle: 'long' })

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #6366f1;">You've been invited to take an assessment</h2>
      <p>Hi ${params.candidateName},</p>
      <p><strong>${params.companyName}</strong> has invited you to complete the following assessment:</p>
      <h3 style="color: #1f2937;">${params.testTitle}</h3>
      ${params.message ? `<p style="background:#f3f4f6;padding:12px;border-radius:6px;">${params.message}</p>` : ''}
      <p>This link expires on <strong>${expiry}</strong>.</p>
      <a href="${url}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;margin:16px 0;">
        Start Assessment
      </a>
      <p style="color:#6b7280;font-size:13px;">If you didn't expect this, you can ignore this email.</p>
    </div>
  `

  if (!resend) {
    console.log(`[EMAIL] Would send invite to ${params.to}: ${url}`)
    return
  }

  await resend.emails.send({
    from: FROM,
    to: params.to,
    subject: `You're invited: ${params.testTitle} — ${params.companyName}`,
    html,
  })
}
