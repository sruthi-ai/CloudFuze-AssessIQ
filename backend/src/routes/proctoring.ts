import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { sendError, sendSuccess } from '../utils/errors'
import { requireRole } from '../middleware/authenticate'

const SEVERITY_MAP: Record<string, 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'> = {
  TAB_SWITCH: 'HIGH',
  WINDOW_BLUR: 'MEDIUM',
  FULLSCREEN_EXIT: 'MEDIUM',
  COPY_PASTE: 'HIGH',
  RIGHT_CLICK: 'LOW',
  WEBCAM_BLOCKED: 'CRITICAL',
  MULTIPLE_FACES: 'CRITICAL',
  NO_FACE_DETECTED: 'HIGH',
  NOISE_DETECTED: 'LOW',
  SCREENSHOT_TAKEN: 'LOW',
  DEVTOOLS_OPEN: 'CRITICAL',
  PHONE_DETECTED: 'CRITICAL',
  CUSTOM: 'MEDIUM',
}

const eventSchema = z.object({
  token: z.string(),
  type: z.enum([
    'TAB_SWITCH', 'WINDOW_BLUR', 'FULLSCREEN_EXIT', 'COPY_PASTE', 'RIGHT_CLICK',
    'WEBCAM_BLOCKED', 'MULTIPLE_FACES', 'NO_FACE_DETECTED', 'NOISE_DETECTED',
    'SCREENSHOT_TAKEN', 'DEVTOOLS_OPEN', 'PHONE_DETECTED', 'CUSTOM',
  ]),
  description: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  occurredAt: z.string().datetime().optional(),
})

const bulkEventSchema = z.object({
  token: z.string(),
  events: z.array(eventSchema.omit({ token: true })),
})

export async function proctoringRoutes(server: FastifyInstance) {
  const canView = requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'RECRUITER', 'VIEWER')

  // POST /api/proctoring/:sessionId/event — record a single proctoring event (public, token-validated)
  server.post('/:sessionId/event', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const result = eventSchema.safeParse(request.body)
    if (!result.success) return sendError(reply, 400, 'Validation error', result.error.flatten())

    const { token, type, description, metadata, occurredAt } = result.data

    const session = await prisma.session.findFirst({
      where: { id: sessionId, invitation: { token } },
      select: { id: true, status: true, test: { select: { proctoring: true } } },
    })
    if (!session) return sendError(reply, 404, 'Session not found')
    if (!session.test.proctoring) return sendSuccess(reply, { skipped: true })

    const event = await prisma.proctoringEvent.create({
      data: {
        sessionId,
        type,
        severity: SEVERITY_MAP[type] ?? 'MEDIUM',
        description,
        metadata: (metadata ?? null) as any,
        occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
      },
    })

    return sendSuccess(reply, event, 201)
  })

  // POST /api/proctoring/:sessionId/events — batch record (flush on submit/interval)
  server.post('/:sessionId/events', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const result = bulkEventSchema.safeParse(request.body)
    if (!result.success) return sendError(reply, 400, 'Validation error', result.error.flatten())

    const { token, events } = result.data

    const session = await prisma.session.findFirst({
      where: { id: sessionId, invitation: { token } },
      select: { id: true, test: { select: { proctoring: true } } },
    })
    if (!session) return sendError(reply, 404, 'Session not found')
    if (!session.test.proctoring) return sendSuccess(reply, { skipped: true, count: 0 })

    const created = await prisma.$transaction(
      events.map(e =>
        prisma.proctoringEvent.create({
          data: {
            sessionId,
            type: e.type,
            severity: SEVERITY_MAP[e.type] ?? 'MEDIUM',
            description: e.description,
            metadata: (e.metadata ?? null) as any,
            occurredAt: e.occurredAt ? new Date(e.occurredAt) : new Date(),
          },
        })
      )
    )

    return sendSuccess(reply, { count: created.length }, 201)
  })

  // GET /api/proctoring/active — live monitor: all in-progress sessions for this tenant
  server.get('/active', { preHandler: canView }, async (request, reply) => {
    const sessions = await prisma.session.findMany({
      where: {
        status: 'IN_PROGRESS',
        test: { tenantId: request.user.tenantId },
      },
      include: {
        candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
        test: { select: { id: true, title: true } },
        proctoringEvents: {
          orderBy: { occurredAt: 'desc' },
          take: 5,
          select: { id: true, type: true, severity: true, occurredAt: true, description: true },
        },
        _count: { select: { proctoringEvents: true } },
      },
      orderBy: { startedAt: 'asc' },
    })

    const result = sessions.map(s => ({
      sessionId: s.id,
      startedAt: s.startedAt,
      timeoutAt: s.timeoutAt,
      candidate: s.candidate,
      test: s.test,
      recentEvents: s.proctoringEvents,
      totalEvents: s._count.proctoringEvents,
      riskScore: calculateRiskScore(s.proctoringEvents),
    }))

    return sendSuccess(reply, result)
  })

  // GET /api/proctoring/:sessionId/events — admin view of all events for a session
  server.get('/:sessionId/events', { preHandler: canView }, async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }

    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        test: { tenantId: request.user.tenantId },
      },
      include: {
        proctoringEvents: { orderBy: { occurredAt: 'asc' } },
        candidate: { select: { firstName: true, lastName: true, email: true } },
        test: { select: { title: true, proctoring: true } },
      },
    })
    if (!session) return sendError(reply, 404, 'Session not found')

    const events = session.proctoringEvents
    const summary = {
      total: events.length,
      critical: events.filter(e => e.severity === 'CRITICAL').length,
      high: events.filter(e => e.severity === 'HIGH').length,
      medium: events.filter(e => e.severity === 'MEDIUM').length,
      low: events.filter(e => e.severity === 'LOW').length,
      byType: events.reduce((acc, e) => {
        acc[e.type] = (acc[e.type] ?? 0) + 1
        return acc
      }, {} as Record<string, number>),
      riskScore: calculateRiskScore(events),
    }

    return sendSuccess(reply, { events, summary, candidate: session.candidate })
  })
}

function calculateRiskScore(events: { severity: string }[]): number {
  const weights = { CRITICAL: 30, HIGH: 15, MEDIUM: 5, LOW: 1 }
  const raw = events.reduce((sum, e) => sum + (weights[e.severity as keyof typeof weights] ?? 0), 0)
  return Math.min(100, raw)
}
