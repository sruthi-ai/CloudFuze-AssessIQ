import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { sendError, sendSuccess } from '../utils/errors'
import { requireRole } from '../middleware/authenticate'
import { sendViaGraph } from '../utils/email'

const settingsSchema = z.object({
  // Company profile
  name: z.string().min(1).optional(),
  logoUrl: z.string().url().optional().nullable(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),

  // Email settings stored in settings Json column
  emailProvider: z.enum(['resend', 'smtp', 'graph', 'none']).optional(),
  resendApiKey: z.string().optional().nullable(),
  smtpHost: z.string().optional().nullable(),
  smtpPort: z.number().int().min(1).max(65535).optional().nullable(),
  smtpUser: z.string().optional().nullable(),
  smtpPass: z.string().optional().nullable(),
  smtpFrom: z.string().optional().nullable(),
  smtpSecure: z.boolean().optional(),

  // Invite defaults
  defaultExpiryDays: z.number().int().min(1).max(90).optional(),

  // Integrations
  completionWebhookUrl: z.string().url().optional().nullable(),

  // Email template
  emailSubject: z.string().max(200).optional().nullable(),
  emailHeaderText: z.string().max(2000).optional().nullable(),
  emailFooterText: z.string().max(2000).optional().nullable(),
  emailBrandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  emailSignature: z.string().max(500).optional().nullable(),

  // SSO / SAML
  ssoEnabled: z.boolean().optional(),
  samlEntryPoint: z.string().url().optional().nullable(),
  samlIssuer: z.string().optional().nullable(),
  samlIdpCert: z.string().optional().nullable(),
  samlEmailAttr: z.string().optional().nullable(),
  samlFirstNameAttr: z.string().optional().nullable(),
  samlLastNameAttr: z.string().optional().nullable(),
  samlAutoProvision: z.boolean().optional(),
  samlDefaultRole: z.enum(['RECRUITER', 'VIEWER']).optional(),

  // Microsoft OIDC SSO (uses server AZURE_* env vars — no per-tenant credentials needed)
  microsoftSsoEnabled: z.boolean().optional(),
})

export async function settingsRoutes(server: FastifyInstance) {
  const adminOnly = requireRole('SUPER_ADMIN', 'COMPANY_ADMIN')
  const canView = requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'RECRUITER', 'VIEWER')

  // GET /api/settings
  server.get('/', { preHandler: canView }, async (request, reply) => {
    const tenant = await prisma.tenant.findUnique({
      where: { id: request.user.tenantId },
      select: { id: true, name: true, slug: true, logoUrl: true, primaryColor: true, plan: true, settings: true, createdAt: true },
    })
    if (!tenant) return sendError(reply, 404, 'Tenant not found')

    const settings = (tenant.settings as Record<string, unknown>) ?? {}

    return sendSuccess(reply, {
      name: tenant.name,
      slug: tenant.slug,
      logoUrl: tenant.logoUrl,
      primaryColor: tenant.primaryColor,
      plan: tenant.plan,
      createdAt: tenant.createdAt,
      emailProvider: (settings.emailProvider as string) ?? 'none',
      smtpHost: (settings.smtpHost as string) ?? null,
      smtpPort: (settings.smtpPort as number) ?? null,
      smtpUser: (settings.smtpUser as string) ?? null,
      smtpFrom: (settings.smtpFrom as string) ?? null,
      smtpSecure: (settings.smtpSecure as boolean) ?? true,
      defaultExpiryDays: (settings.defaultExpiryDays as number) ?? 7,
      // Never send sensitive keys back — just indicate if set
      resendApiKeySet: !!(settings.resendApiKey),
      smtpPassSet: !!(settings.smtpPass),
      completionWebhookUrl: (settings.completionWebhookUrl as string) ?? null,
      // Email template
      emailSubject: (settings.emailSubject as string) ?? null,
      emailHeaderText: (settings.emailHeaderText as string) ?? null,
      emailFooterText: (settings.emailFooterText as string) ?? null,
      emailBrandColor: (settings.emailBrandColor as string) ?? null,
      emailSignature: (settings.emailSignature as string) ?? null,
      // SSO / SAML
      ssoEnabled: (settings.ssoEnabled as boolean) ?? false,
      samlEntryPoint: (settings.samlEntryPoint as string) ?? null,
      samlIssuer: (settings.samlIssuer as string) ?? null,
      samlIdpCertSet: !!(settings.samlIdpCert),
      samlEmailAttr: (settings.samlEmailAttr as string) ?? null,
      samlFirstNameAttr: (settings.samlFirstNameAttr as string) ?? null,
      samlLastNameAttr: (settings.samlLastNameAttr as string) ?? null,
      samlAutoProvision: (settings.samlAutoProvision as boolean) ?? false,
      samlDefaultRole: (settings.samlDefaultRole as string) ?? 'VIEWER',
      // Microsoft OIDC
      microsoftSsoEnabled: (settings.microsoftSsoEnabled as boolean) ?? false,
      microsoftSsoAvailable: !!(process.env.AZURE_TENANT_ID && process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET),
    })
  })

  // PATCH /api/settings
  server.patch('/', { preHandler: adminOnly }, async (request, reply) => {
    const result = settingsSchema.safeParse(request.body)
    if (!result.success) return sendError(reply, 400, 'Validation error', result.error.flatten())

    const { name, logoUrl, primaryColor, ...emailSettings } = result.data

    const tenant = await prisma.tenant.findUnique({
      where: { id: request.user.tenantId },
      select: { settings: true },
    })
    if (!tenant) return sendError(reply, 404, 'Tenant not found')

    const existingSettings = (tenant.settings as Record<string, unknown>) ?? {}

    const updatedSettings = {
      ...existingSettings,
      ...Object.fromEntries(
        Object.entries(emailSettings).filter(([, v]) => v !== undefined)
      ),
    }

    const updatedTenant = await prisma.tenant.update({
      where: { id: request.user.tenantId },
      data: {
        ...(name !== undefined && { name }),
        ...(logoUrl !== undefined && { logoUrl }),
        ...(primaryColor !== undefined && { primaryColor }),
        settings: updatedSettings as any,
      },
      select: { id: true, name: true, slug: true, logoUrl: true, primaryColor: true, plan: true, settings: true },
    })

    const settings = (updatedTenant.settings as Record<string, unknown>) ?? {}

    return sendSuccess(reply, {
      name: updatedTenant.name,
      slug: updatedTenant.slug,
      logoUrl: updatedTenant.logoUrl,
      primaryColor: updatedTenant.primaryColor,
      plan: updatedTenant.plan,
      emailProvider: (settings.emailProvider as string) ?? 'none',
      smtpHost: (settings.smtpHost as string) ?? null,
      smtpPort: (settings.smtpPort as number) ?? null,
      smtpUser: (settings.smtpUser as string) ?? null,
      smtpFrom: (settings.smtpFrom as string) ?? null,
      smtpSecure: (settings.smtpSecure as boolean) ?? true,
      defaultExpiryDays: (settings.defaultExpiryDays as number) ?? 7,
      resendApiKeySet: !!(settings.resendApiKey),
      smtpPassSet: !!(settings.smtpPass),
      completionWebhookUrl: (settings.completionWebhookUrl as string) ?? null,
      emailSubject: (settings.emailSubject as string) ?? null,
      emailHeaderText: (settings.emailHeaderText as string) ?? null,
      emailFooterText: (settings.emailFooterText as string) ?? null,
      emailBrandColor: (settings.emailBrandColor as string) ?? null,
      emailSignature: (settings.emailSignature as string) ?? null,
    })
  })

  // POST /api/settings/test-email — send a test email using current config
  server.post('/test-email', { preHandler: adminOnly }, async (request, reply) => {
    const { email } = request.body as { email?: string }
    const recipient = email || request.user.email

    const tenant = await prisma.tenant.findUnique({
      where: { id: request.user.tenantId },
      select: { name: true, settings: true },
    })
    if (!tenant) return sendError(reply, 404, 'Tenant not found')

    const settings = (tenant.settings as Record<string, unknown>) ?? {}
    const provider = (settings.emailProvider as string) ?? 'none'

    if (provider === 'none') {
      return sendError(reply, 400, 'No email provider configured. Set up Resend or SMTP first.')
    }

    try {
      if (provider === 'resend') {
        const { Resend } = await import('resend')
        const apiKey = (settings.resendApiKey as string) || process.env.RESEND_API_KEY
        if (!apiKey) return sendError(reply, 400, 'Resend API key not configured')
        const resend = new Resend(apiKey)
        await resend.emails.send({
          from: (settings.smtpFrom as string) || 'NeutaraAssessments <noreply@neutaraassessment.cftools.live>',
          to: recipient,
          subject: `Test email from ${tenant.name} NeutaraAssessments`,
          html: `<p>This is a test email from <strong>${tenant.name}</strong> via NeutaraAssessments. Your email configuration is working correctly.</p>`,
        })
      } else if (provider === 'smtp') {
        const nodemailer = await import('nodemailer')
        const transporter = nodemailer.createTransport({
          host: settings.smtpHost as string,
          port: (settings.smtpPort as number) ?? 587,
          secure: (settings.smtpSecure as boolean) ?? false,
          auth: { user: settings.smtpUser as string, pass: settings.smtpPass as string },
        })
        await transporter.sendMail({
          from: (settings.smtpFrom as string) || settings.smtpUser as string,
          to: recipient,
          subject: `Test email from ${tenant.name} NeutaraAssessments`,
          html: `<p>This is a test email from <strong>${tenant.name}</strong> via NeutaraAssessments. Your SMTP configuration is working correctly.</p>`,
        })
      } else if (provider === 'graph') {
        const fromEmail = (settings.smtpFrom as string) || process.env.FROM_EMAIL
        if (!fromEmail) return sendError(reply, 400, 'From address not configured')
        await sendViaGraph({
          from: fromEmail,
          to: recipient,
          subject: `Test email from ${tenant.name} NeutaraAssessments`,
          html: `<p>This is a test email from <strong>${tenant.name}</strong> via NeutaraAssessments. Your Microsoft Graph email configuration is working correctly.</p>`,
        })
      }

      return sendSuccess(reply, { message: `Test email sent to ${recipient}` })
    } catch (err: any) {
      return sendError(reply, 500, `Failed to send test email: ${err.message}`)
    }
  })
}
