import { Resend } from 'resend'

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@assessiq.com'

async function sendViaGraph(params: { from: string; to: string; subject: string; html: string }) {
  const tenantId = process.env.AZURE_TENANT_ID
  const clientId = process.env.AZURE_CLIENT_ID
  const clientSecret = process.env.AZURE_CLIENT_SECRET
  if (!tenantId || !clientId || !clientSecret) throw new Error('Azure credentials not configured')

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
      }),
    }
  )
  if (!tokenRes.ok) throw new Error(`Azure token error: ${await tokenRes.text()}`)
  const { access_token } = await tokenRes.json() as { access_token: string }

  const mailRes = await fetch(
    `https://graph.microsoft.com/v1.0/users/${params.from}/sendMail`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject: params.subject,
          body: { contentType: 'HTML', content: params.html },
          toRecipients: [{ emailAddress: { address: params.to } }],
        },
      }),
    }
  )
  if (!mailRes.ok && mailRes.status !== 202) {
    throw new Error(`Graph API send error: ${await mailRes.text()}`)
  }
}

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

  const subject = `You're invited: ${params.testTitle} — ${params.companyName}`

  if (process.env.AZURE_TENANT_ID && process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET) {
    await sendViaGraph({ from: FROM_EMAIL, to: params.to, subject, html })
    return
  }

  if (process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({ from: FROM_EMAIL, to: params.to, subject, html })
    return
  }

  console.log(`[EMAIL] Would send invite to ${params.to}: ${url}`)
}

export { sendViaGraph }
