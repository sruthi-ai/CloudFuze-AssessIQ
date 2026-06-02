import { Resend } from 'resend'
import nodemailer from 'nodemailer'

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

async function sendViaSmtp(params: {
  to: string
  subject: string
  html: string
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPass: string
  smtpFrom: string
  smtpSecure: boolean
}) {
  const transporter = nodemailer.createTransport({
    host: params.smtpHost,
    port: params.smtpPort,
    secure: params.smtpSecure,
    auth: { user: params.smtpUser, pass: params.smtpPass },
  })
  await transporter.sendMail({
    from: params.smtpFrom || params.smtpUser,
    to: params.to,
    subject: params.subject,
    html: params.html,
  })
}

type TenantEmailSettings = {
  emailProvider?: string
  smtpHost?: string
  smtpPort?: number
  smtpUser?: string
  smtpPass?: string
  smtpFrom?: string
  smtpSecure?: boolean
  resendApiKey?: string
  // Custom template fields
  emailSubject?: string | null
  emailHeaderText?: string | null
  emailFooterText?: string | null
  emailBrandColor?: string | null
  emailSignature?: string | null
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '')
}

function buildInvitationHtml(params: {
  candidateName: string; testTitle: string; companyName: string
  url: string; expiry: string; pin?: string | null; message?: string; settings?: TenantEmailSettings
}): string {
  const s = params.settings
  const color = s?.emailBrandColor ?? '#6366f1'
  const vars = { candidateName: params.candidateName, testTitle: params.testTitle, companyName: params.companyName }

  const headerHtml = s?.emailHeaderText
    ? `<p>${interpolate(s.emailHeaderText, vars)}</p>`
    : `<p>Hi ${params.candidateName},</p>
       <p><strong>${params.companyName}</strong> has invited you to complete the following assessment:</p>
       <h3 style="color:#1f2937;">${params.testTitle}</h3>`

  const footerHtml = s?.emailFooterText
    ? `<p style="color:#6b7280;font-size:13px;">${interpolate(s.emailFooterText, vars)}</p>`
    : `<p style="color:#6b7280;font-size:13px;">If you didn't expect this, you can ignore this email.</p>`

  const signatureHtml = s?.emailSignature
    ? `<p style="color:#6b7280;font-size:12px;border-top:1px solid #e5e7eb;margin-top:24px;padding-top:12px;">${s.emailSignature}</p>`
    : ''

  const pinHtml = params.pin ? `
    <div style="margin:20px 0;padding:16px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;">
      <p style="margin:0 0 8px;font-size:13px;color:#5b21b6;font-weight:600;">🔒 Secure Browser PIN</p>
      <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">If this assessment requires the AssessIQ Secure Browser, open the app and enter this PIN:</p>
      <p style="margin:0;font-size:28px;font-weight:700;letter-spacing:6px;color:#1f2937;font-family:monospace;">${params.pin}</p>
    </div>` : ''

  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
      <div style="background:${color};padding:20px 24px;border-radius:8px 8px 0 0;">
        <h2 style="color:#fff;margin:0;font-size:20px;">You've been invited to take an assessment</h2>
      </div>
      <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
        ${headerHtml}
        ${params.message ? `<p style="background:#f3f4f6;padding:12px;border-radius:6px;">${params.message}</p>` : ''}
        <p>This link expires on <strong>${params.expiry}</strong>.</p>
        <a href="${params.url}" style="display:inline-block;background:${color};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;margin:16px 0;">
          Start Assessment
        </a>
        ${pinHtml}
        ${footerHtml}
        ${signatureHtml}
      </div>
    </div>
  `
}

export async function sendInvitationEmail(params: {
  to: string
  candidateName: string
  testTitle: string
  companyName: string
  token: string
  pin?: string | null
  expiresAt: Date
  message?: string
  tenantSettings?: TenantEmailSettings
}) {
  const url = `${FRONTEND_URL}/take/${params.token}`
  const expiry = params.expiresAt.toLocaleDateString('en-US', { dateStyle: 'long' })

  const html = buildInvitationHtml({
    candidateName: params.candidateName,
    testTitle: params.testTitle,
    companyName: params.companyName,
    url, expiry,
    pin: params.pin,
    message: params.message,
    settings: params.tenantSettings,
  })

  const vars = { candidateName: params.candidateName, testTitle: params.testTitle, companyName: params.companyName }
  const subject = params.tenantSettings?.emailSubject
    ? interpolate(params.tenantSettings.emailSubject, vars)
    : `You're invited: ${params.testTitle} — ${params.companyName}`

  const s = params.tenantSettings

  // Tenant-configured email takes priority over server env vars.
  // If the admin set up SMTP/Resend/Graph in the UI, use it — env vars are fallbacks
  // for tenants that haven't configured anything yet.

  // 1. Tenant SMTP (configured in admin Settings)
  if (s?.emailProvider === 'smtp' && s.smtpHost && s.smtpUser && s.smtpPass) {
    await sendViaSmtp({
      to: params.to,
      subject,
      html,
      smtpHost: s.smtpHost,
      smtpPort: s.smtpPort ?? 587,
      smtpUser: s.smtpUser,
      smtpPass: s.smtpPass,
      smtpFrom: s.smtpFrom || s.smtpUser,
      smtpSecure: s.smtpSecure ?? false,
    })
    return
  }

  // 2. Tenant Resend key (configured in admin Settings)
  if (s?.emailProvider === 'resend' && s.resendApiKey) {
    const resend = new Resend(s.resendApiKey)
    const { error } = await resend.emails.send({
      from: s.smtpFrom || FROM_EMAIL,
      to: params.to,
      subject,
      html,
    })
    if (error) throw new Error(`Resend error: ${error.message}`)
    return
  }

  // 3. Tenant Microsoft Graph (admin selected "Microsoft Graph" in Settings and saved a From address)
  // Azure app credentials (AZURE_TENANT_ID/CLIENT_ID/SECRET) must be set as server env vars.
  if (s?.emailProvider === 'graph') {
    const from = s.smtpFrom || FROM_EMAIL
    await sendViaGraph({ from, to: params.to, subject, html })
    return
  }

  // 4. Azure Graph (server env var fallback — no tenant provider set)
  if (process.env.AZURE_TENANT_ID && process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET) {
    await sendViaGraph({ from: FROM_EMAIL, to: params.to, subject, html })
    return
  }

  // 5. Resend (server env var fallback)
  if (process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error } = await resend.emails.send({ from: FROM_EMAIL, to: params.to, subject, html })
    if (error) throw new Error(`Resend error: ${error.message}`)
    return
  }

  throw new Error('No email provider configured — configure SMTP/Resend/Graph in Settings or set RESEND_API_KEY')
}

export async function sendPasswordResetEmail(params: {
  to: string
  name: string
  token: string
  tenantSettings?: TenantEmailSettings
}) {
  const url = `${FRONTEND_URL}/reset-password?token=${params.token}`
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #6366f1;">Reset your password</h2>
      <p>Hi ${params.name},</p>
      <p>We received a request to reset your password. Click the button below to choose a new one.</p>
      <a href="${url}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;margin:16px 0;">
        Reset Password
      </a>
      <p>This link expires in <strong>1 hour</strong>. If you didn't request this, you can safely ignore this email.</p>
    </div>
  `
  const subject = 'Reset your NeutaraAssessments password'
  const s = params.tenantSettings
  if (s?.emailProvider === 'smtp' && s.smtpHost && s.smtpUser && s.smtpPass) {
    await sendViaSmtp({ to: params.to, subject, html, smtpHost: s.smtpHost, smtpPort: s.smtpPort ?? 587, smtpUser: s.smtpUser, smtpPass: s.smtpPass, smtpFrom: s.smtpFrom || s.smtpUser, smtpSecure: s.smtpSecure ?? false }); return
  }
  if (s?.emailProvider === 'resend' && s.resendApiKey) {
    const resend = new Resend(s.resendApiKey)
    const { error } = await resend.emails.send({ from: s.smtpFrom || FROM_EMAIL, to: params.to, subject, html })
    if (error) throw new Error(`Resend error: ${error.message}`)
    return
  }
  if (s?.emailProvider === 'graph') {
    await sendViaGraph({ from: s.smtpFrom || FROM_EMAIL, to: params.to, subject, html }); return
  }
  if (process.env.AZURE_TENANT_ID && process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET) {
    await sendViaGraph({ from: FROM_EMAIL, to: params.to, subject, html }); return
  }
  if (process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error } = await resend.emails.send({ from: FROM_EMAIL, to: params.to, subject, html })
    if (error) throw new Error(`Resend error: ${error.message}`)
    return
  }
  throw new Error('No email provider configured — set RESEND_API_KEY or configure SMTP/Graph in Settings')
}

export async function sendSubmissionNotification(params: {
  to: string
  recruiterName: string
  candidateName: string
  testTitle: string
  sessionId: string
  score?: { percentage: number; passed?: boolean | null } | null
  tenantSettings?: TenantEmailSettings
}) {
  const url = `${FRONTEND_URL}/admin/results/${params.sessionId}`
  const scoreHtml = params.score
    ? `<p>Score: <strong>${params.score.percentage.toFixed(1)}%</strong>${params.score.passed != null ? ` — <span style="color:${params.score.passed ? '#16a34a' : '#dc2626'}">${params.score.passed ? 'Passed' : 'Failed'}</span>` : ''}</p>`
    : '<p>Auto-grading in progress.</p>'

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #6366f1;">Assessment Submitted</h2>
      <p>Hi ${params.recruiterName},</p>
      <p><strong>${params.candidateName}</strong> has just submitted their assessment for <strong>${params.testTitle}</strong>.</p>
      ${scoreHtml}
      <a href="${url}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;margin:16px 0;">
        View Result
      </a>
    </div>
  `
  const subject = `${params.candidateName} submitted: ${params.testTitle}`
  const s = params.tenantSettings
  if (s?.emailProvider === 'smtp' && s.smtpHost && s.smtpUser && s.smtpPass) {
    await sendViaSmtp({ to: params.to, subject, html, smtpHost: s.smtpHost, smtpPort: s.smtpPort ?? 587, smtpUser: s.smtpUser, smtpPass: s.smtpPass, smtpFrom: s.smtpFrom || s.smtpUser, smtpSecure: s.smtpSecure ?? false }); return
  }
  if (s?.emailProvider === 'resend' && s.resendApiKey) {
    const resend = new Resend(s.resendApiKey)
    const { error } = await resend.emails.send({ from: s.smtpFrom || FROM_EMAIL, to: params.to, subject, html })
    if (error) console.warn(`[EMAIL] Resend error for submission notification: ${error.message}`)
    return
  }
  if (s?.emailProvider === 'graph') {
    try { await sendViaGraph({ from: s.smtpFrom || FROM_EMAIL, to: params.to, subject, html }) } catch (e: any) { console.warn(`[EMAIL] Graph error: ${e.message}`) }
    return
  }
  if (process.env.AZURE_TENANT_ID && process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET) {
    try { await sendViaGraph({ from: FROM_EMAIL, to: params.to, subject, html }) } catch (e: any) { console.warn(`[EMAIL] Graph error: ${e.message}`) }
    return
  }
  if (process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error } = await resend.emails.send({ from: FROM_EMAIL, to: params.to, subject, html })
    if (error) console.warn(`[EMAIL] Resend error for submission notification: ${error.message}`)
    return
  }
  // Submission notification is best-effort — log and continue if no provider
  console.warn(`[EMAIL] No provider configured — skipping submission notification to ${params.to}`)
}

export { sendViaGraph }
