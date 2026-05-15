import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { sendError, sendSuccess } from '../utils/errors'
import { requireRole } from '../middleware/authenticate'
import { sendInvitationEmail } from '../utils/email'

const createCandidateSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).default('Candidate'),
  lastName: z.string().default(''),
  phone: z.string().optional(),
  organization: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
})

const inviteSchema = z.object({
  testId: z.string(),
  candidates: z.array(z.object({
    email: z.string().email(),
    firstName: z.string().default('Candidate'),
    lastName: z.string().default(''),
    organization: z.string().optional(),
  })),
  expiresInDays: z.number().int().min(1).max(90).default(7),
  message: z.string().optional(),
})

const invitationInclude = {
  include: { test: { select: { id: true, title: true } } },
  orderBy: { createdAt: 'desc' as const },
}

export async function candidateRoutes(server: FastifyInstance) {
  const canEdit = requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'RECRUITER')
  const canView = requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'RECRUITER', 'VIEWER')

  // GET /api/candidates
  server.get('/', { preHandler: canView }, async (request, reply) => {
    const query = request.query as { search?: string; page?: string; limit?: string }
    const page = parseInt(query.page || '1')
    const limit = parseInt(query.limit || '20')
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = { tenantId: request.user.tenantId }
    if (query.search) {
      where.OR = [
        { email: { contains: query.search, mode: 'insensitive' } },
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
      ]
    }

    const [candidates, total] = await Promise.all([
      prisma.candidate.findMany({
        where,
        include: {
          _count: { select: { invitations: true, sessions: true } },
          invitations: invitationInclude,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.candidate.count({ where }),
    ])

    return sendSuccess(reply, { candidates, total, page, limit, pages: Math.ceil(total / limit) })
  })

  // GET /api/candidates/:id
  server.get('/:id', { preHandler: canView }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const candidate = await prisma.candidate.findFirst({
      where: { id, tenantId: request.user.tenantId },
      include: {
        invitations: {
          include: { test: { select: { id: true, title: true } } },
          orderBy: { createdAt: 'desc' },
        },
        sessions: {
          include: { test: { select: { id: true, title: true } }, score: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    })
    if (!candidate) return sendError(reply, 404, 'Candidate not found')
    return sendSuccess(reply, candidate)
  })

  // POST /api/candidates
  server.post('/', { preHandler: canEdit }, async (request, reply) => {
    const result = createCandidateSchema.safeParse(request.body)
    if (!result.success) return sendError(reply, 400, 'Validation error', result.error.flatten())

    const existing = await prisma.candidate.findUnique({
      where: { email_tenantId: { email: result.data.email, tenantId: request.user.tenantId } },
    })
    if (existing) return sendSuccess(reply, existing)

    const candidate = await prisma.candidate.create({
      data: { ...result.data, tenantId: request.user.tenantId, metadata: (result.data.metadata ?? null) as any },
    })
    return sendSuccess(reply, candidate, 201)
  })

  // DELETE /api/candidates/:id
  server.delete('/:id', { preHandler: canEdit }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const candidate = await prisma.candidate.findFirst({
      where: { id, tenantId: request.user.tenantId },
    })
    if (!candidate) return sendError(reply, 404, 'Candidate not found')
    await prisma.candidate.delete({ where: { id } })
    return sendSuccess(reply, { deleted: true })
  })

  // PATCH /api/candidates/:id — toggle suspend/activate
  server.patch('/:id', { preHandler: canEdit }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as { isActive?: boolean }
    const candidate = await prisma.candidate.findFirst({
      where: { id, tenantId: request.user.tenantId },
    })
    if (!candidate) return sendError(reply, 404, 'Candidate not found')
    const updated = await prisma.candidate.update({
      where: { id },
      data: { isActive: body.isActive ?? !candidate.isActive },
    })
    return sendSuccess(reply, updated)
  })

  // POST /api/candidates/invite — bulk invite
  server.post('/invite', { preHandler: canEdit }, async (request, reply) => {
    const result = inviteSchema.safeParse(request.body)
    if (!result.success) return sendError(reply, 400, 'Validation error', result.error.flatten())

    const { testId, candidates, expiresInDays, message } = result.data

    const test = await prisma.test.findFirst({
      where: { id: testId, tenantId: request.user.tenantId, status: 'PUBLISHED' },
      include: { tenant: true },
    })
    if (!test) return sendError(reply, 404, 'Test not found or not published')

    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    const results = await Promise.allSettled(
      candidates.map(async c => {
        let candidate = await prisma.candidate.findUnique({
          where: { email_tenantId: { email: c.email, tenantId: request.user.tenantId } },
        })
        if (!candidate) {
          candidate = await prisma.candidate.create({
            data: { ...c, tenantId: request.user.tenantId },
          })
        } else if (c.organization && !candidate.organization) {
          candidate = await prisma.candidate.update({
            where: { id: candidate.id },
            data: { organization: c.organization },
          })
        }

        const existing = await prisma.invitation.findUnique({
          where: { testId_candidateId: { testId, candidateId: candidate.id } },
        })
        if (existing && !['EXPIRED', 'CANCELLED'].includes(existing.status)) {
          return { email: c.email, status: 'skipped', reason: 'Already invited' }
        }

        const invitation = await prisma.invitation.create({
          data: { testId, candidateId: candidate.id, sentById: request.user.sub, expiresAt, message, sentAt: new Date(), status: 'SENT' },
        })

        await sendInvitationEmail({
          to: c.email,
          candidateName: `${c.firstName} ${c.lastName}`,
          testTitle: test.title,
          companyName: test.tenant.name,
          token: invitation.token,
          expiresAt,
          message,
          tenantSettings: (test.tenant.settings ?? undefined) as any,
        })

        return { email: c.email, status: 'invited', invitationId: invitation.id, token: invitation.token }
      })
    )

    const summary = results.map((r, i) =>
      r.status === 'fulfilled' ? r.value : { email: candidates[i].email, status: 'error', reason: String(r.reason) }
    )

    return sendSuccess(reply, { summary })
  })

  // POST /api/candidates/invitations/:invitationId/resend
  server.post('/invitations/:invitationId/resend', { preHandler: canEdit }, async (request, reply) => {
    const { invitationId } = request.params as { invitationId: string }
    const invitation = await prisma.invitation.findFirst({
      where: { id: invitationId },
      include: { candidate: true, test: { include: { tenant: true } } },
    })
    if (!invitation) return sendError(reply, 404, 'Invitation not found')
    if (invitation.test.tenantId !== request.user.tenantId) return sendError(reply, 403, 'Forbidden')

    await prisma.invitation.update({
      where: { id: invitationId },
      data: { sentAt: new Date(), status: 'SENT' },
    })

    await sendInvitationEmail({
      to: invitation.candidate.email,
      candidateName: `${invitation.candidate.firstName} ${invitation.candidate.lastName}`,
      testTitle: invitation.test.title,
      companyName: invitation.test.tenant.name,
      token: invitation.token,
      expiresAt: invitation.expiresAt,
      message: invitation.message ?? undefined,
      tenantSettings: (invitation.test.tenant.settings ?? undefined) as any,
    })

    return sendSuccess(reply, { resent: true })
  })

  // DELETE /api/candidates/invitations/:invitationId — cancel invitation
  server.delete('/invitations/:invitationId', { preHandler: canEdit }, async (request, reply) => {
    const { invitationId } = request.params as { invitationId: string }
    const invitation = await prisma.invitation.findFirst({
      where: { id: invitationId },
      include: { test: true },
    })
    if (!invitation) return sendError(reply, 404, 'Invitation not found')
    if (invitation.test.tenantId !== request.user.tenantId) return sendError(reply, 403, 'Forbidden')

    await prisma.invitation.update({
      where: { id: invitationId },
      data: { status: 'CANCELLED' },
    })

    return sendSuccess(reply, { cancelled: true })
  })

  // GET /api/candidates/invitations/:testId — all invitations for a test
  server.get('/invitations/:testId', { preHandler: canView }, async (request, reply) => {
    const { testId } = request.params as { testId: string }
    const test = await prisma.test.findFirst({ where: { id: testId, tenantId: request.user.tenantId } })
    if (!test) return sendError(reply, 404, 'Test not found')

    const invitations = await prisma.invitation.findMany({
      where: { testId },
      include: {
        candidate: true,
        session: { include: { score: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return sendSuccess(reply, invitations)
  })
}
