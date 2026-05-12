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
          from: (settings.smtpFrom as string) || 'AssessIQ <noreply@assessiq.app>',
          to: recipient,
          subject: `Test email from ${tenant.name} AssessIQ`,
          html: `<p>This is a test email from <strong>${tenant.name}</strong> via AssessIQ. Your email configuration is working correctly.</p>`,
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
          subject: `Test email from ${tenant.name} AssessIQ`,
          html: `<p>This is a test email from <strong>${tenant.name}</strong> via AssessIQ. Your SMTP configuration is working correctly.</p>`,
        })
      } else if (provider === 'graph') {
        const fromEmail = (settings.smtpFrom as string) || process.env.FROM_EMAIL
        if (!fromEmail) return sendError(reply, 400, 'From address not configured')
        await sendViaGraph({
          from: fromEmail,
          to: recipient,
          subject: `Test email from ${tenant.name} AssessIQ`,
          html: `<p>This is a test email from <strong>${tenant.name}</strong> via AssessIQ. Your Microsoft Graph email configuration is working correctly.</p>`,
        })
      }

      return sendSuccess(reply, { message: `Test email sent to ${recipient}` })
    } catch (err: any) {
      return sendError(reply, 500, `Failed to send test email: ${err.message}`)
    }
  })
}
