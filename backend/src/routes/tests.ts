import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import crypto from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../db'
import { sendError, sendSuccess } from '../utils/errors'
import { authenticate, requireRole } from '../middleware/authenticate'
import { logAudit } from '../utils/audit'

const createTestSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  instructions: z.string().optional(),
  domain: z.string().optional(),
  duration: z.number().int().min(1),
  passingScore: z.number().min(0).max(100).optional(),
  shuffleQuestions: z.boolean().optional(),
  shuffleOptions: z.boolean().optional(),
  showResults: z.boolean().optional(),
  allowedAttempts: z.number().int().min(1).optional(),
  proctoring: z.boolean().optional(),
  roomScanEnabled: z.boolean().optional(),
  roomScanIntervalMins: z.number().int().min(5).max(120).optional(),
  requireIdVerification: z.boolean().optional(),
  allowedIPs: z.array(z.string()).optional().nullable(),
  negativeMarking: z.number().min(0).max(1).optional().nullable(),
  openAt: z.string().datetime().optional().nullable(),
  closeAt: z.string().datetime().optional().nullable(),
})

const addQuestionSchema = z.object({
  questionId: z.string(),
  sectionId: z.string().optional(),
  order: z.number().int().optional(),
  points: z.number().optional(),
})

const createSectionSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  order: z.number().int().optional(),
  timeLimit: z.number().int().optional(),
  pickCount: z.number().int().min(1).optional().nullable(),
})

export async function testRoutes(server: FastifyInstance) {
  const canEdit = requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'RECRUITER')
  const canView = requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'RECRUITER', 'VIEWER')

  // GET /api/tests
  server.get('/', { preHandler: canView }, async (request, reply) => {
    const query = request.query as { status?: string; domain?: string; page?: string; limit?: string }
    const page = parseInt(query.page || '1')
    const limit = parseInt(query.limit || '20')
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = { tenantId: request.user.tenantId }
    if (query.status) where.status = query.status
    if (query.domain) where.domain = query.domain

    const [tests, total] = await Promise.all([
      prisma.test.findMany({
        where,
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { sections: true, invitations: true, sessions: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.test.count({ where }),
    ])

    return sendSuccess(reply, { tests, total, page, limit, pages: Math.ceil(total / limit) })
  })

  // GET /api/tests/:id
  server.get('/:id', { preHandler: canView }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const test = await prisma.test.findFirst({
      where: { id, tenantId: request.user.tenantId },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        sections: {
          include: {
            testQuestions: {
              include: { question: { include: { options: true } } },
              orderBy: { order: 'asc' },
            },
          },
          orderBy: { order: 'asc' },
        },
      },
    })
    if (!test) return sendError(reply, 404, 'Test not found')
    return sendSuccess(reply, test)
  })

  // POST /api/tests
  server.post('/', { preHandler: canEdit }, async (request, reply) => {
    const result = createTestSchema.safeParse(request.body)
    if (!result.success) return sendError(reply, 400, 'Validation error', result.error.flatten())

    const { allowedIPs, ...restData } = result.data
    const test = await prisma.test.create({
      data: {
        ...restData,
        ...(allowedIPs !== undefined && { allowedIPs: (allowedIPs ?? undefined) as Prisma.InputJsonValue | undefined }),
        tenantId: request.user.tenantId,
        createdById: request.user.sub,
        sections: {
          create: { title: 'Section 1', order: 0 },
        },
      },
      include: { sections: true },
    })
    return sendSuccess(reply, test, 201)
  })

  // PATCH /api/tests/:id
  server.patch('/:id', { preHandler: canEdit }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const result = createTestSchema.partial().safeParse(request.body)
    if (!result.success) return sendError(reply, 400, 'Validation error', result.error.flatten())

    const test = await prisma.test.findFirst({ where: { id, tenantId: request.user.tenantId } })
    if (!test) return sendError(reply, 404, 'Test not found')

    const { allowedIPs, ...restData } = result.data
    const updated = await prisma.test.update({
      where: { id },
      data: {
        ...restData,
        ...(allowedIPs !== undefined && { allowedIPs: (allowedIPs ?? undefined) as Prisma.InputJsonValue | undefined }),
      },
    })
    return sendSuccess(reply, updated)
  })

  // PATCH /api/tests/:id/status
  server.patch('/:id/status', { preHandler: canEdit }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { status } = request.body as { status: string }
    if (!['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(status)) {
      return sendError(reply, 400, 'Invalid status')
    }

    const test = await prisma.test.findFirst({ where: { id, tenantId: request.user.tenantId } })
    if (!test) return sendError(reply, 404, 'Test not found')

    const updated = await prisma.test.update({ where: { id }, data: { status: status as any } })
    logAudit({ tenantId: request.user.tenantId, userId: request.user.sub, action: `TEST_${status}`, entityType: 'test', entityId: id, metadata: { title: test.title } })
    return sendSuccess(reply, updated)
  })

  // POST /api/tests/:id/duplicate
  server.post('/:id/duplicate', { preHandler: canEdit }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const original = await prisma.test.findFirst({
      where: { id, tenantId: request.user.tenantId },
      include: {
        sections: {
          include: { testQuestions: { orderBy: { order: 'asc' } } },
          orderBy: { order: 'asc' },
        },
      },
    })
    if (!original) return sendError(reply, 404, 'Test not found')

    const copy = await prisma.$transaction(async (tx) => {
      const newTest = await tx.test.create({
        data: {
          title: `${original.title} (Copy)`,
          description: original.description,
          instructions: original.instructions,
          domain: original.domain,
          duration: original.duration,
          passingScore: original.passingScore,
          shuffleQuestions: original.shuffleQuestions,
          shuffleOptions: original.shuffleOptions,
          showResults: original.showResults,
          allowedAttempts: original.allowedAttempts,
          negativeMarking: original.negativeMarking ?? undefined,
          proctoring: original.proctoring,
          roomScanEnabled: original.roomScanEnabled,
          roomScanIntervalMins: original.roomScanIntervalMins,
          requireIdVerification: original.requireIdVerification,
          allowedIPs: original.allowedIPs as any ?? undefined,
          status: 'DRAFT',
          tenantId: request.user.tenantId,
          createdById: request.user.sub,
        },
      })

      for (const s of original.sections) {
        await tx.testSection.create({
          data: {
            title: s.title,
            description: s.description,
            order: s.order,
            timeLimit: s.timeLimit,
            pickCount: s.pickCount ?? undefined,
            testId: newTest.id,
            testQuestions: {
              create: s.testQuestions.map(tq => ({
                questionId: tq.questionId,
                testId: newTest.id,
                order: tq.order,
                points: tq.points ?? undefined,
                isRequired: tq.isRequired,
              })),
            },
          },
        })
      }

      return newTest
    })
    return sendSuccess(reply, copy, 201)
  })

  // DELETE /api/tests/:id
  server.delete('/:id', { preHandler: requireRole('SUPER_ADMIN', 'COMPANY_ADMIN') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const test = await prisma.test.findFirst({ where: { id, tenantId: request.user.tenantId } })
    if (!test) return sendError(reply, 404, 'Test not found')

    await prisma.test.delete({ where: { id } })
    logAudit({ tenantId: request.user.tenantId, userId: request.user.sub, action: 'TEST_DELETED', entityType: 'test', entityId: id, metadata: { title: test.title } })
    return sendSuccess(reply, { message: 'Test deleted' })
  })

  // POST /api/tests/:id/practice — enable practice mode, generate token
  server.post('/:id/practice', { preHandler: canEdit }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const test = await prisma.test.findFirst({ where: { id, tenantId: request.user.tenantId } })
    if (!test) return sendError(reply, 404, 'Test not found')

    const practiceToken = test.practiceToken ?? crypto.randomUUID().replace(/-/g, '')
    const updated = await prisma.test.update({
      where: { id },
      data: { practiceEnabled: true, practiceToken },
    })
    return sendSuccess(reply, { practiceToken: updated.practiceToken })
  })

  // DELETE /api/tests/:id/practice — disable practice mode
  server.delete('/:id/practice', { preHandler: canEdit }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const test = await prisma.test.findFirst({ where: { id, tenantId: request.user.tenantId } })
    if (!test) return sendError(reply, 404, 'Test not found')

    await prisma.test.update({ where: { id }, data: { practiceEnabled: false, practiceToken: null } })
    return sendSuccess(reply, { message: 'Practice mode disabled' })
  })

  // ── Sections ──────────────────────────────────────────────────────────────

  // POST /api/tests/:id/sections
  server.post('/:id/sections', { preHandler: canEdit }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const result = createSectionSchema.safeParse(request.body)
    if (!result.success) return sendError(reply, 400, 'Validation error', result.error.flatten())

    const test = await prisma.test.findFirst({ where: { id, tenantId: request.user.tenantId } })
    if (!test) return sendError(reply, 404, 'Test not found')

    const section = await prisma.testSection.create({ data: { ...result.data, testId: id } })
    return sendSuccess(reply, section, 201)
  })

  // PATCH /api/tests/:id/sections/:sectionId
  server.patch('/:id/sections/:sectionId', { preHandler: canEdit }, async (request, reply) => {
    const { id, sectionId } = request.params as { id: string; sectionId: string }
    const result = createSectionSchema.partial().safeParse(request.body)
    if (!result.success) return sendError(reply, 400, 'Validation error', result.error.flatten())

    const section = await prisma.testSection.findFirst({ where: { id: sectionId, testId: id } })
    if (!section) return sendError(reply, 404, 'Section not found')

    const updated = await prisma.testSection.update({ where: { id: sectionId }, data: result.data })
    return sendSuccess(reply, updated)
  })

  // DELETE /api/tests/:id/sections/:sectionId
  server.delete('/:id/sections/:sectionId', { preHandler: canEdit }, async (request, reply) => {
    const { id, sectionId } = request.params as { id: string; sectionId: string }
    const section = await prisma.testSection.findFirst({ where: { id: sectionId, testId: id } })
    if (!section) return sendError(reply, 404, 'Section not found')

    await prisma.testSection.delete({ where: { id: sectionId } })
    return sendSuccess(reply, { message: 'Section deleted' })
  })

  // ── Test Questions ─────────────────────────────────────────────────────────

  // POST /api/tests/:id/questions
  server.post('/:id/questions', { preHandler: canEdit }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const result = addQuestionSchema.safeParse(request.body)
    if (!result.success) return sendError(reply, 400, 'Validation error', result.error.flatten())

    const test = await prisma.test.findFirst({ where: { id, tenantId: request.user.tenantId } })
    if (!test) return sendError(reply, 404, 'Test not found')

    const existing = await prisma.testQuestion.findUnique({
      where: { testId_questionId: { testId: id, questionId: result.data.questionId } },
    })
    if (existing) return sendError(reply, 409, 'Question already added to this test')

    const count = await prisma.testQuestion.count({ where: { testId: id } })
    const tq = await prisma.testQuestion.create({
      data: { testId: id, order: result.data.order ?? count, ...result.data },
      include: { question: { include: { options: true } } },
    })
    return sendSuccess(reply, tq, 201)
  })

  // DELETE /api/tests/:id/questions/:tqId
  server.delete('/:id/questions/:tqId', { preHandler: canEdit }, async (request, reply) => {
    const { id, tqId } = request.params as { id: string; tqId: string }
    const tq = await prisma.testQuestion.findFirst({ where: { id: tqId, testId: id } })
    if (!tq) return sendError(reply, 404, 'Question not found in test')

    await prisma.testQuestion.delete({ where: { id: tqId } })
    return sendSuccess(reply, { message: 'Question removed' })
  })

  // PATCH /api/tests/:id/questions/reorder — bulk reorder
  server.patch('/:id/questions/reorder', { preHandler: canEdit }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { order } = request.body as { order: Array<{ id: string; order: number }> }

    const test = await prisma.test.findFirst({ where: { id, tenantId: request.user.tenantId } })
    if (!test) return sendError(reply, 404, 'Test not found')

    await prisma.$transaction(order.map(({ id: tqId, order: o }) =>
      prisma.testQuestion.update({ where: { id: tqId }, data: { order: o } })
    ))
    return sendSuccess(reply, { message: 'Reordered' })
  })

  // GET /api/tests/:id/stats
  server.get('/:id/stats', { preHandler: canView }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const test = await prisma.test.findFirst({ where: { id, tenantId: request.user.tenantId } })
    if (!test) return sendError(reply, 404, 'Test not found')

    const [inviteCount, sessionCount, completedCount, scores] = await Promise.all([
      prisma.invitation.count({ where: { testId: id } }),
      prisma.session.count({ where: { testId: id } }),
      prisma.session.count({ where: { testId: id, status: 'SUBMITTED' } }),
      prisma.score.findMany({
        where: { session: { testId: id } },
        select: { percentage: true, passed: true },
      }),
    ])

    const avgScore = scores.length ? scores.reduce((a, s) => a + s.percentage, 0) / scores.length : null
    const passRate = scores.length ? scores.filter(s => s.passed).length / scores.length * 100 : null

    return sendSuccess(reply, { inviteCount, sessionCount, completedCount, avgScore, passRate })
  })
}
