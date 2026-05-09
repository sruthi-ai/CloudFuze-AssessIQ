import { FastifyInstance } from 'fastify'
import { prisma } from '../db'
import { sendError, sendSuccess } from '../utils/errors'
import { requireRole } from '../middleware/authenticate'

export async function analyticsRoutes(server: FastifyInstance) {
  const canView = requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'RECRUITER', 'VIEWER')
  const adminOnly = requireRole('SUPER_ADMIN', 'COMPANY_ADMIN')

  // GET /api/analytics/overview — overall tenant stats
  server.get('/overview', { preHandler: canView }, async (request, reply) => {
    const tid = request.user.tenantId

    const [
      testsTotal, testsPublished,
      candidatesTotal,
      sessionsTotal, sessionsCompleted, sessionsFailed,
      avgScoreAgg,
    ] = await Promise.all([
      prisma.test.count({ where: { tenantId: tid } }),
      prisma.test.count({ where: { tenantId: tid, status: 'PUBLISHED' } }),
      prisma.candidate.count({ where: { tenantId: tid } }),
      prisma.session.count({ where: { test: { tenantId: tid } } }),
      prisma.session.count({ where: { test: { tenantId: tid }, status: { in: ['SUBMITTED', 'TIMED_OUT'] } } }),
      prisma.score.count({ where: { session: { test: { tenantId: tid } }, passed: false } }),
      prisma.score.aggregate({ where: { session: { test: { tenantId: tid } } }, _avg: { percentage: true } }),
    ])

    return sendSuccess(reply, {
      tests: { total: testsTotal, published: testsPublished },
      candidates: { total: candidatesTotal },
      sessions: {
        total: sessionsTotal,
        completed: sessionsCompleted,
        completionRate: sessionsTotal > 0 ? Math.round((sessionsCompleted / sessionsTotal) * 100) : 0,
      },
      scores: {
        avgPercentage: Math.round(avgScoreAgg._avg.percentage ?? 0),
        failCount: sessionsFailed,
        passRate: sessionsCompleted > 0 ? Math.round(((sessionsCompleted - sessionsFailed) / sessionsCompleted) * 100) : 0,
      },
    })
  })

  // GET /api/analytics/pass-rate-trend — weekly pass rate over last 12 weeks
  server.get('/pass-rate-trend', { preHandler: canView }, async (request, reply) => {
    const tid = request.user.tenantId
    const since = new Date(Date.now() - 84 * 24 * 60 * 60 * 1000) // 12 weeks

    const scores = await prisma.score.findMany({
      where: { session: { test: { tenantId: tid }, submittedAt: { gte: since } } },
      select: { percentage: true, passed: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })

    // Group by ISO week
    const weekMap = new Map<string, { pass: number; fail: number; total: number }>()
    for (const s of scores) {
      const week = getISOWeek(s.createdAt)
      const entry = weekMap.get(week) ?? { pass: 0, fail: 0, total: 0 }
      entry.total++
      if (s.passed === true) entry.pass++
      else if (s.passed === false) entry.fail++
      weekMap.set(week, entry)
    }

    const trend = [...weekMap.entries()].map(([week, v]) => ({
      week,
      passRate: v.total > 0 ? Math.round((v.pass / v.total) * 100) : 0,
      avgScore: 0,
      total: v.total,
    }))

    return sendSuccess(reply, trend)
  })

  // GET /api/analytics/tests/:testId — per-test analytics
  server.get('/tests/:testId', { preHandler: canView }, async (request, reply) => {
    const { testId } = request.params as { testId: string }

    const test = await prisma.test.findFirst({ where: { id: testId, tenantId: request.user.tenantId } })
    if (!test) return sendError(reply, 404, 'Test not found')

    const [sessions, scores, questionStats] = await Promise.all([
      prisma.session.findMany({
        where: { testId, status: { in: ['SUBMITTED', 'TIMED_OUT'] } },
        include: { score: true },
      }),
      prisma.score.findMany({ where: { session: { testId } } }),
      // Per-question answer stats
      prisma.answer.groupBy({
        by: ['questionId', 'gradingStatus'],
        where: { session: { testId } },
        _count: { id: true },
        _avg: { pointsEarned: true, timeSpent: true },
      }),
    ])

    const completed = sessions.filter(s => s.status === 'SUBMITTED').length
    const passed = scores.filter(s => s.passed === true).length
    const avgPct = scores.length > 0 ? scores.reduce((s, sc) => s + sc.percentage, 0) / scores.length : 0
    const avgTime = sessions
      .filter(s => s.startedAt && s.submittedAt)
      .reduce((s, sess) => s + (sess.submittedAt!.getTime() - sess.startedAt!.getTime()), 0)
      / Math.max(1, sessions.filter(s => s.startedAt && s.submittedAt).length)

    const scoreDistribution = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90].map(bucket => ({
      range: `${bucket}-${bucket + 9}%`,
      count: scores.filter(s => s.percentage >= bucket && s.percentage < bucket + 10).length,
    }))

    return sendSuccess(reply, {
      testId,
      title: test.title,
      totalSessions: sessions.length,
      completed,
      passed,
      passRate: completed > 0 ? Math.round((passed / completed) * 100) : 0,
      avgScore: Math.round(avgPct),
      avgTimeMinutes: Math.round(avgTime / 60000),
      scoreDistribution,
      questionStats,
    })
  })

  // GET /api/analytics/tests/:testId/export — CSV export of results
  server.get('/tests/:testId/export', { preHandler: canView }, async (request, reply) => {
    const { testId } = request.params as { testId: string }

    const test = await prisma.test.findFirst({ where: { id: testId, tenantId: request.user.tenantId } })
    if (!test) return sendError(reply, 404, 'Test not found')

    const sessions = await prisma.session.findMany({
      where: { testId, status: { in: ['SUBMITTED', 'TIMED_OUT'] } },
      include: {
        candidate: { select: { firstName: true, lastName: true, email: true } },
        score: true,
      },
      orderBy: { submittedAt: 'desc' },
    })

    const rows = [
      ['First Name', 'Last Name', 'Email', 'Status', 'Score %', 'Points Earned', 'Total Points', 'Passed', 'Percentile', 'Submitted At'].join(','),
      ...sessions.map(s => [
        s.candidate.firstName,
        s.candidate.lastName,
        s.candidate.email,
        s.status,
        s.score?.percentage?.toFixed(1) ?? '',
        s.score?.earnedPoints?.toFixed(1) ?? '',
        s.score?.totalPoints?.toFixed(1) ?? '',
        s.score?.passed ?? '',
        s.score?.percentile ?? '',
        s.submittedAt?.toISOString() ?? '',
      ].join(',')),
    ].join('\n')

    reply.header('Content-Type', 'text/csv')
    reply.header('Content-Disposition', `attachment; filename="${test.title.replace(/[^a-z0-9]/gi, '_')}_results.csv"`)
    return reply.send(rows)
  })

  // POST /api/analytics/webhooks — register an ATS webhook
  server.post('/webhooks', { preHandler: adminOnly }, async (request, reply) => {
    const { url, events, secret } = request.body as {
      url: string; events: string[]; secret?: string
    }
    if (!url || !events?.length) return sendError(reply, 400, 'url and events required')

    const tenant = await prisma.tenant.findUnique({
      where: { id: request.user.tenantId },
      select: { settings: true },
    })
    const existing = (tenant?.settings as any) ?? {}
    const webhooks = (existing.webhooks as any[]) ?? []
    const newWebhook = { id: Date.now().toString(), url, events, secret: secret ?? null, createdAt: new Date() }
    webhooks.push(newWebhook)

    await prisma.tenant.update({
      where: { id: request.user.tenantId },
      data: { settings: { ...existing, webhooks } },
    })

    return sendSuccess(reply, newWebhook, 201)
  })

  // GET /api/analytics/webhooks
  server.get('/webhooks', { preHandler: adminOnly }, async (request, reply) => {
    const tenant = await prisma.tenant.findUnique({
      where: { id: request.user.tenantId },
      select: { settings: true },
    })
    const settings = (tenant?.settings as any) ?? {}
    const webhooks = ((settings.webhooks as any[]) ?? []).map((w: any) => ({ ...w, secret: w.secret ? '••••••••' : null }))
    return sendSuccess(reply, webhooks)
  })
}

function getISOWeek(date: Date): string {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
}
