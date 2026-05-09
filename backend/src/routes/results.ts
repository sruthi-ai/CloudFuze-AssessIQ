import { FastifyInstance } from 'fastify'
import { prisma } from '../db'
import { sendError, sendSuccess } from '../utils/errors'
import { requireRole } from '../middleware/authenticate'
import { aiGradeSession } from '../services/aiGrading'

export async function resultRoutes(server: FastifyInstance) {
  const canView = requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'RECRUITER', 'VIEWER')

  // GET /api/results — all completed sessions for this tenant
  server.get('/', { preHandler: canView }, async (request, reply) => {
    const query = request.query as { testId?: string; page?: string; limit?: string; status?: string }
    const page = parseInt(query.page || '1')
    const limit = parseInt(query.limit || '20')
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {
      test: { tenantId: request.user.tenantId },
    }
    if (query.testId) where.testId = query.testId
    if (query.status) where.status = query.status

    const [sessions, total] = await Promise.all([
      prisma.session.findMany({
        where,
        include: {
          candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
          test: { select: { id: true, title: true, passingScore: true } },
          score: true,
        },
        orderBy: { submittedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.session.count({ where }),
    ])

    return sendSuccess(reply, { sessions, total, page, limit, pages: Math.ceil(total / limit) })
  })

  // GET /api/results/:sessionId — detailed result for one session
  server.get('/:sessionId', { preHandler: canView }, async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }

    const session = await prisma.session.findFirst({
      where: { id: sessionId, test: { tenantId: request.user.tenantId } },
      include: {
        candidate: true,
        test: {
          include: {
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
        },
        score: true,
        answers: {
          include: { question: { select: { id: true, title: true, type: true, points: true } } },
        },
      },
    })

    if (!session) return sendError(reply, 404, 'Session not found')
    return sendSuccess(reply, session)
  })

  // PATCH /api/results/:sessionId/answers/:answerId — human override grading
  server.patch('/:sessionId/answers/:answerId', {
    preHandler: requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'RECRUITER'),
  }, async (request, reply) => {
    const { sessionId, answerId } = request.params as { sessionId: string; answerId: string }
    const { pointsEarned, feedback } = request.body as { pointsEarned?: number; feedback?: string }

    const session = await prisma.session.findFirst({
      where: { id: sessionId, test: { tenantId: request.user.tenantId } },
      include: { test: { select: { passingScore: true } } },
    })
    if (!session) return sendError(reply, 404, 'Session not found')

    const answer = await prisma.answer.findFirst({ where: { id: answerId, sessionId } })
    if (!answer) return sendError(reply, 404, 'Answer not found')

    const updated = await prisma.answer.update({
      where: { id: answerId },
      data: {
        pointsEarned: pointsEarned ?? answer.pointsEarned,
        feedback,
        gradingStatus: 'HUMAN_GRADED',
        gradedAt: new Date(),
      },
    })

    // Recalculate total score
    const allAnswers = await prisma.answer.findMany({ where: { sessionId } })
    const earned = allAnswers.reduce((s, a) => s + (a.pointsEarned ?? 0), 0)
    const scoreRecord = await prisma.score.findUnique({ where: { sessionId } })
    if (scoreRecord) {
      const pct = scoreRecord.totalPoints > 0 ? (earned / scoreRecord.totalPoints) * 100 : 0
      await prisma.score.update({
        where: { sessionId },
        data: { earnedPoints: earned, percentage: pct, passed: session.test?.passingScore ? pct >= session.test.passingScore : null },
      })
    }

    return sendSuccess(reply, updated)
  })

  // POST /api/results/:sessionId/ai-grade — trigger AI grading for pending answers
  server.post('/:sessionId/ai-grade', {
    preHandler: requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'RECRUITER'),
  }, async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const session = await prisma.session.findFirst({
      where: { id: sessionId, test: { tenantId: request.user.tenantId } },
    })
    if (!session) return sendError(reply, 404, 'Session not found')
    if (session.status !== 'SUBMITTED' && session.status !== 'TIMED_OUT') {
      return sendError(reply, 400, 'Session must be submitted before grading')
    }

    const result = await aiGradeSession(sessionId)
    return sendSuccess(reply, { message: `AI graded ${result.graded} answers, skipped ${result.skipped}`, ...result })
  })

  // POST /api/results/ai-grade-all — grade all pending sessions in tenant
  server.post('/ai-grade-all', {
    preHandler: requireRole('SUPER_ADMIN', 'COMPANY_ADMIN'),
  }, async (request, reply) => {
    const sessions = await prisma.session.findMany({
      where: {
        test: { tenantId: request.user.tenantId },
        status: { in: ['SUBMITTED', 'TIMED_OUT'] },
        answers: { some: { gradingStatus: 'PENDING' } },
      },
      select: { id: true },
    })

    let totalGraded = 0
    for (const s of sessions) {
      const r = await aiGradeSession(s.id)
      totalGraded += r.graded
    }

    return sendSuccess(reply, { sessionsProcessed: sessions.length, answersGraded: totalGraded })
  })

  // GET /api/results/dashboard — summary stats for tenant
  server.get('/dashboard/stats', { preHandler: canView }, async (request, reply) => {
    const tenantId = request.user.tenantId

    const [testsTotal, testsPublished, candidatesTotal, sessionsTotal, sessionsCompleted, recentSessions] = await Promise.all([
      prisma.test.count({ where: { tenantId } }),
      prisma.test.count({ where: { tenantId, status: 'PUBLISHED' } }),
      prisma.candidate.count({ where: { tenantId } }),
      prisma.session.count({ where: { test: { tenantId } } }),
      prisma.session.count({ where: { test: { tenantId }, status: 'SUBMITTED' } }),
      prisma.session.findMany({
        where: { test: { tenantId }, status: { in: ['SUBMITTED', 'IN_PROGRESS'] } },
        include: {
          candidate: { select: { firstName: true, lastName: true, email: true } },
          test: { select: { title: true } },
          score: { select: { percentage: true, passed: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
    ])

    return sendSuccess(reply, {
      tests: { total: testsTotal, published: testsPublished },
      candidates: { total: candidatesTotal },
      sessions: { total: sessionsTotal, completed: sessionsCompleted },
      recentSessions,
    })
  })
}
