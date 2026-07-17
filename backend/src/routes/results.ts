import { FastifyInstance } from 'fastify'
import { createReadStream, existsSync } from 'fs'
import { extname, join } from 'path'
import { prisma } from '../db'
import { sendError, sendSuccess } from '../utils/errors'
import { requireRole } from '../middleware/authenticate'
import { aiGradeSession } from '../services/aiGrading'
import { computeSkillBands } from '../services/scoring'
import { UPLOADS_DIR } from '../uploads'
import { logAudit } from '../utils/audit'

const MEDIA_MIME: Record<string, string> = {
  '.webm': 'audio/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.txt': 'text/plain',
}

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
      isPractice: false,
    }
    if (query.testId) where.testId = query.testId
    if (query.status) where.status = query.status

    const [sessions, total] = await Promise.all([
      prisma.session.findMany({
        where,
        include: {
          candidate: { select: { id: true, firstName: true, lastName: true, email: true, organization: true } },
          test: { select: { id: true, title: true, passingScore: true, enforceViolations: true } },
          score: true,
          _count: { select: { proctoringEvents: true } },
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
    const skillBands = computeSkillBands(session as any)
    return sendSuccess(reply, { ...session, skillBands })
  })

  // DELETE /api/results/:sessionId — remove a session and reset the invitation
  server.delete('/:sessionId', {
    preHandler: requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'RECRUITER'),
  }, async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const session = await prisma.session.findFirst({
      where: { id: sessionId, test: { tenantId: request.user.tenantId } },
      include: { invitation: true, candidate: { select: { email: true } }, test: { select: { title: true } } },
    })
    if (!session) return sendError(reply, 404, 'Session not found')

    await prisma.session.delete({ where: { id: sessionId } })

    // Reset invitation so candidate can be re-invited if needed
    await prisma.invitation.update({
      where: { id: session.invitationId },
      data: { status: 'CANCELLED' },
    })

    logAudit({
      tenantId: request.user.tenantId, userId: request.user.sub, action: 'RESULT_DELETED',
      entityType: 'session', entityId: sessionId,
      metadata: { candidateEmail: session.candidate.email, testTitle: session.test.title, status: session.status },
    })

    return sendSuccess(reply, { deleted: true })
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

    logAudit({
      tenantId: request.user.tenantId, userId: request.user.sub, action: 'GRADE_OVERRIDDEN',
      entityType: 'answer', entityId: answerId,
      metadata: { sessionId, previousPoints: answer.pointsEarned, newPoints: updated.pointsEarned, previousStatus: answer.gradingStatus },
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

  // GET /api/results/:sessionId/answers/:answerId/media — serve a candidate's file/audio answer (admin)
  server.get('/:sessionId/answers/:answerId/media', { preHandler: canView }, async (request, reply) => {
    const { sessionId, answerId } = request.params as { sessionId: string; answerId: string }

    const session = await prisma.session.findFirst({
      where: { id: sessionId, test: { tenantId: request.user.tenantId } },
    })
    if (!session) return sendError(reply, 404, 'Session not found')

    const answer = await prisma.answer.findFirst({ where: { id: answerId, sessionId } })
    if (!answer) return sendError(reply, 404, 'Answer not found')

    const mediaUrl = answer.audioUrl ?? answer.fileUrl
    if (!mediaUrl) return sendError(reply, 404, 'No media on this answer')

    const relativePath = mediaUrl.replace(/^\/uploads\//, '')
    const filePath = join(UPLOADS_DIR, relativePath)
    if (!existsSync(filePath)) return sendError(reply, 404, 'File missing from disk')

    const mime = MEDIA_MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
    return reply.type(mime).send(createReadStream(filePath))
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

    logAudit({
      tenantId: request.user.tenantId, userId: request.user.sub, action: 'AI_GRADE_TRIGGERED',
      entityType: 'session', entityId: sessionId,
      metadata: { graded: result.graded, skipped: result.skipped, failed: result.failed, errors: result.errors },
    })

    const failedNote = result.failed > 0 ? `, ${result.failed} failed (left pending for retry)` : ''
    return sendSuccess(reply, { message: `AI graded ${result.graded} answers, skipped ${result.skipped}${failedNote}`, ...result })
  })

  // POST /api/results/ai-grade-all — grade pending sessions in the tenant.
  // Body { sessionIds?: string[] }: if provided, grade ONLY those (still
  // tenant-scoped for safety); otherwise grade every pending session.
  server.post('/ai-grade-all', {
    preHandler: requireRole('SUPER_ADMIN', 'COMPANY_ADMIN'),
  }, async (request, reply) => {
    const body = (request.body ?? {}) as { sessionIds?: string[] }
    const requested = Array.isArray(body.sessionIds) ? body.sessionIds.filter(x => typeof x === 'string') : null

    const sessions = await prisma.session.findMany({
      where: {
        test: { tenantId: request.user.tenantId },   // tenant isolation — ignores IDs from other tenants
        status: { in: ['SUBMITTED', 'TIMED_OUT'] },
        answers: { some: { gradingStatus: 'PENDING' } },
        ...(requested ? { id: { in: requested } } : {}),
      },
      select: { id: true },
    })

    let totalGraded = 0
    let totalFailed = 0
    let totalSkipped = 0
    const errorCounts = new Map<string, number>()
    for (const s of sessions) {
      const r = await aiGradeSession(s.id)
      totalGraded += r.graded
      totalFailed += r.failed
      totalSkipped += r.skipped
      for (const e of r.errors) errorCounts.set(e, (errorCounts.get(e) ?? 0) + 1)
    }
    // Distinct failure reasons, most common first — this is what actually answers
    // "why did grading fail", surfaced to the UI instead of requiring server logs.
    const topErrors = [...errorCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([msg, count]) => (count > 1 ? `${msg} (×${count})` : msg))

    logAudit({
      tenantId: request.user.tenantId, userId: request.user.sub,
      action: requested ? 'AI_GRADE_SELECTED_TRIGGERED' : 'AI_GRADE_ALL_TRIGGERED',
      entityType: 'tenant', entityId: request.user.tenantId,
      metadata: { requested: requested?.length ?? 'all', sessionsProcessed: sessions.length, answersGraded: totalGraded, answersFailed: totalFailed, answersSkipped: totalSkipped, topErrors },
    })

    // If nothing graded AND audio/text answers were skipped, no key (tenant UI
    // key or server env) is configured at all.
    const tenant = await prisma.tenant.findUnique({ where: { id: request.user.tenantId }, select: { settings: true } })
    const hasAnyKey = !!((tenant?.settings as Record<string, unknown> | null)?.openaiApiKey) || !!process.env.OPENAI_API_KEY
    const openAiMissing = totalGraded === 0 && totalSkipped > 0 && !hasAnyKey
    return sendSuccess(reply, {
      sessionsProcessed: sessions.length, answersGraded: totalGraded, answersFailed: totalFailed, answersSkipped: totalSkipped,
      topErrors,
      warning: openAiMissing ? 'No OpenAI key configured (Settings → AI Grading, or server env) — spoken/written answers cannot be graded.' : undefined,
    })
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
