import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { sendError, sendSuccess } from '../utils/errors'
import { requireRole } from '../middleware/authenticate'
import { sendInvitationEmail } from '../utils/email'
import { logAudit } from '../utils/audit'

// Unambiguous chars (no 0/O, 1/I/L)
const PIN_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function generatePin(): string {
  return Array.from({ length: 8 }, () => PIN_CHARS[Math.floor(Math.random() * PIN_CHARS.length)]).join('')
}
async function uniquePin(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const pin = generatePin()
    const exists = await prisma.invitation.findUnique({ where: { pin } })
    if (!exists) return pin
  }
  throw new Error('Could not generate unique PIN')
}

const createCandidateSchema = z.object({
  email: z.string().email().transform(v => v.toLowerCase()),
  firstName: z.string().min(1).default('Candidate'),
  lastName: z.string().default(''),
  phone: z.string().optional(),
  organization: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
})

const inviteSchema = z.object({
  testId: z.string(),
  candidates: z.array(z.object({
    email: z.string().email().transform(v => v.toLowerCase()),
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
          include: {
            test: { select: { id: true, title: true, allowedAttempts: true } },
            session: { include: { score: true, _count: { select: { proctoringEvents: true } } } },
          },
          orderBy: { createdAt: 'desc' },
        },
        sessions: {
          include: {
            test: { select: { id: true, title: true } },
            score: true,
            _count: { select: { proctoringEvents: true } },
          },
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
    logAudit({ tenantId: request.user.tenantId, userId: request.user.sub, action: 'CANDIDATE_DELETED', entityType: 'candidate', entityId: id, metadata: { email: candidate.email, name: `${candidate.firstName} ${candidate.lastName}` } })
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
    logAudit({ tenantId: request.user.tenantId, userId: request.user.sub, action: updated.isActive ? 'CANDIDATE_ACTIVATED' : 'CANDIDATE_SUSPENDED', entityType: 'candidate', entityId: id, metadata: { email: candidate.email } })
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

        const pin = await uniquePin()
        const invitation = await prisma.invitation.create({
          data: { testId, candidateId: candidate.id, sentById: request.user.sub, expiresAt, message, sentAt: new Date(), status: 'SENT', pin },
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

        logAudit({ tenantId: request.user.tenantId, userId: request.user.sub, action: 'INVITATION_SENT', entityType: 'invitation', entityId: invitation.id, metadata: { candidateEmail: c.email, testTitle: test.title, testId } })
        return { email: c.email, status: 'invited', invitationId: invitation.id, token: invitation.token, pin: invitation.pin }
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
    const body = request.body as { expiresInDays?: number }
    const invitation = await prisma.invitation.findFirst({
      where: { id: invitationId },
      include: { candidate: true, test: { include: { tenant: true } } },
    })
    if (!invitation) return sendError(reply, 404, 'Invitation not found')
    if (invitation.test.tenantId !== request.user.tenantId) return sendError(reply, 403, 'Forbidden')

    // Extend expiry from now (default 7 days) so the resent link is always fresh
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + (body.expiresInDays ?? 7))

    await prisma.invitation.update({
      where: { id: invitationId },
      data: { sentAt: new Date(), status: 'SENT', expiresAt },
    })

    try {
      await sendInvitationEmail({
        to: invitation.candidate.email,
        candidateName: `${invitation.candidate.firstName} ${invitation.candidate.lastName}`,
        testTitle: invitation.test.title,
        companyName: invitation.test.tenant.name,
        token: invitation.token,
        expiresAt,
        message: invitation.message ?? undefined,
        tenantSettings: (invitation.test.tenant.settings ?? undefined) as any,
      })
    } catch (err) {
      console.error('[RESEND] Email send failed:', err)
      return sendError(reply, 502, `Invitation updated but email delivery failed: ${(err as Error).message}`)
    }

    logAudit({ tenantId: request.user.tenantId, userId: request.user.sub, action: 'INVITATION_RESENT', entityType: 'invitation', entityId: invitationId, metadata: { candidateEmail: invitation.candidate.email, testTitle: invitation.test.title } })
    return sendSuccess(reply, { resent: true })
  })

  // POST /api/candidates/invitations/:invitationId/retake — save history, reset, re-send
  server.post('/invitations/:invitationId/retake', { preHandler: canEdit }, async (request, reply) => {
    const MAX_ATTEMPTS = 3
    const { invitationId } = request.params as { invitationId: string }
    const body = request.body as { expiresInDays?: number }
    const invitation = await prisma.invitation.findFirst({
      where: { id: invitationId },
      include: {
        candidate: true,
        test: { include: { tenant: true } },
        session: { include: { score: true } },
      },
    })
    if (!invitation) return sendError(reply, 404, 'Invitation not found')
    if (invitation.test.tenantId !== request.user.tenantId) return sendError(reply, 403, 'Forbidden')
    if (invitation.attemptNumber >= MAX_ATTEMPTS) {
      return sendError(reply, 409, `Maximum ${MAX_ATTEMPTS} attempts reached for this candidate`)
    }

    // Archive the current attempt's score before deleting the session
    type AttemptRecord = { attemptNumber: number; score: number; percentage: number; passed: boolean | null; submittedAt: string | null }
    const previous = (invitation.previousAttempts ?? []) as AttemptRecord[]
    if (invitation.session?.score) {
      previous.push({
        attemptNumber: invitation.attemptNumber,
        score: invitation.session.score.earnedPoints,
        percentage: invitation.session.score.percentage,
        passed: invitation.session.score.passed,
        submittedAt: invitation.session.submittedAt?.toISOString() ?? null,
      })
    } else if (invitation.session) {
      previous.push({
        attemptNumber: invitation.attemptNumber,
        score: 0,
        percentage: 0,
        passed: null,
        submittedAt: invitation.session.submittedAt?.toISOString() ?? null,
      })
    }

    // Delete the session (cascades: answers, score, proctoring events, snapshots)
    if (invitation.session) {
      await prisma.session.delete({ where: { id: invitation.session.id } })
    }

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + (body.expiresInDays ?? 7))
    const nextAttempt = invitation.attemptNumber + 1

    await prisma.invitation.update({
      where: { id: invitationId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        expiresAt,
        attemptNumber: nextAttempt,
        previousAttempts: previous as any,
      },
    })

    await sendInvitationEmail({
      to: invitation.candidate.email,
      candidateName: `${invitation.candidate.firstName} ${invitation.candidate.lastName}`,
      testTitle: invitation.test.title,
      companyName: invitation.test.tenant.name,
      token: invitation.token,
      expiresAt,
      message: invitation.message ?? undefined,
      tenantSettings: (invitation.test.tenant.settings ?? undefined) as any,
    })

    logAudit({ tenantId: request.user.tenantId, userId: request.user.sub, action: 'RETAKE_GRANTED', entityType: 'invitation', entityId: invitationId, metadata: { candidateEmail: invitation.candidate.email, testTitle: invitation.test.title, attemptNumber: nextAttempt } })
    return sendSuccess(reply, { retakeScheduled: true, attemptNumber: nextAttempt, attemptsRemaining: MAX_ATTEMPTS - nextAttempt })
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
    logAudit({ tenantId: request.user.tenantId, userId: request.user.sub, action: 'INVITATION_CANCELLED', entityType: 'invitation', entityId: invitationId, metadata: { testTitle: invitation.test.title } })
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
