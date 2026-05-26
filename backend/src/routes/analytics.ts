import { FastifyInstance } from 'fastify'
import { prisma } from '../db'
import { sendError, sendSuccess } from '../utils/errors'
import { requireRole } from '../middleware/authenticate'

export async function analyticsRoutes(server: FastifyInstance) {
  const canView = requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'RECRUITER', 'VIEWER')
  const adminOnly = requireRole('SUPER_ADMIN', 'COMPANY_ADMIN')

  // GET /api/analytics/overview — overall tenant stats with optional dateRange
  server.get('/overview', { preHandler: canView }, async (request, reply) => {
    const tid = request.user.tenantId
    const { range } = request.query as { range?: string }
    const since = rangeToDate(range)
    const dateFilter = since ? { gte: since } : undefined

    const [
      testsTotal, testsPublished,
      candidatesTotal,
      sessionsTotal, sessionsCompleted, sessionsFailed,
      avgScoreAgg,
      invitationsPending,
      invitationsExpiringSoon,
    ] = await Promise.all([
      prisma.test.count({ where: { tenantId: tid } }),
      prisma.test.count({ where: { tenantId: tid, status: 'PUBLISHED' } }),
      prisma.candidate.count({ where: { tenantId: tid, ...(dateFilter ? { createdAt: dateFilter } : {}) } }),
      prisma.session.count({ where: { test: { tenantId: tid }, ...(dateFilter ? { createdAt: dateFilter } : {}) } }),
      prisma.session.count({ where: { test: { tenantId: tid }, status: { in: ['SUBMITTED', 'TIMED_OUT'] }, ...(dateFilter ? { createdAt: dateFilter } : {}) } }),
      prisma.score.count({ where: { session: { test: { tenantId: tid }, ...(dateFilter ? { createdAt: dateFilter } : {}) }, passed: false } }),
      prisma.score.aggregate({ where: { session: { test: { tenantId: tid }, ...(dateFilter ? { createdAt: dateFilter } : {}) } }, _avg: { percentage: true } }),
      prisma.invitation.count({ where: { test: { tenantId: tid }, status: 'PENDING' } }),
      // expiring in next 48h
      prisma.invitation.count({
        where: {
          test: { tenantId: tid },
          status: 'PENDING',
          expiresAt: { lte: new Date(Date.now() + 48 * 60 * 60 * 1000) },
        },
      }),
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
      invitations: {
        pending: invitationsPending,
        expiringSoon: invitationsExpiringSoon,
      },
    })
  })

  // GET /api/analytics/top-candidates — leaderboard, top 10 by avg score
  server.get('/top-candidates', { preHandler: canView }, async (request, reply) => {
    const tid = request.user.tenantId
    const { range } = request.query as { range?: string }
    const since = rangeToDate(range)

    const scores = await prisma.score.findMany({
      where: {
        session: {
          test: { tenantId: tid },
          ...(since ? { submittedAt: { gte: since } } : {}),
        },
      },
      select: {
        percentage: true,
        passed: true,
        session: {
          select: {
            candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
      },
      take: 5000, // cap: enough for any realistic leaderboard aggregation
    })

    // Aggregate per candidate
    const byCandidate = new Map<string, { id: string; name: string; email: string; scores: number[]; passed: number }>()
    for (const s of scores) {
      const c = s.session.candidate
      const key = c.id
      const entry = byCandidate.get(key) ?? { id: c.id, name: `${c.firstName} ${c.lastName}`, email: c.email, scores: [], passed: 0 }
      entry.scores.push(s.percentage)
      if (s.passed) entry.passed++
      byCandidate.set(key, entry)
    }

    const leaderboard = [...byCandidate.values()]
      .map(c => ({
        id: c.id,
        name: c.name,
        email: c.email,
        attempts: c.scores.length,
        avgScore: Math.round(c.scores.reduce((a, b) => a + b, 0) / c.scores.length),
        passed: c.passed,
      }))
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 10)

    return sendSuccess(reply, leaderboard)
  })

  // GET /api/analytics/pass-rate-trend — weekly pass rate over last 12 weeks
  server.get('/pass-rate-trend', { preHandler: canView }, async (request, reply) => {
    const tid = request.user.tenantId
    const since = new Date(Date.now() - 84 * 24 * 60 * 60 * 1000) // 12 weeks

    const scores = await prisma.score.findMany({
      where: { session: { test: { tenantId: tid }, submittedAt: { gte: since } } },
      select: { percentage: true, passed: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: 10000,
    })

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
      total: v.total,
    }))

    return sendSuccess(reply, trend)
  })

  // GET /api/analytics/tests/:testId — per-test analytics with question difficulty
  server.get('/tests/:testId', { preHandler: canView }, async (request, reply) => {
    const { testId } = request.params as { testId: string }

    const test = await prisma.test.findFirst({ where: { id: testId, tenantId: request.user.tenantId } })
    if (!test) return sendError(reply, 404, 'Test not found')

    const [sessions, scores, questionAnswers] = await Promise.all([
      prisma.session.findMany({
        where: { testId, status: { in: ['SUBMITTED', 'TIMED_OUT'] } },
        include: { score: true },
      }),
      prisma.score.findMany({ where: { session: { testId } } }),
      // All answers for this test with question info
      prisma.answer.findMany({
        where: { session: { testId, status: { in: ['SUBMITTED', 'TIMED_OUT'] } } },
        select: {
          questionId: true,
          gradingStatus: true,
          pointsEarned: true,
          timeSpent: true,
          question: {
            select: { id: true, title: true, type: true, points: true, difficulty: true },
          },
        },
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

    // Per-question difficulty analysis
    const qMap = new Map<string, {
      title: string; type: string; maxPoints: number; difficulty: string;
      attempts: number; totalEarned: number; totalTime: number; correct: number
    }>()
    for (const ans of questionAnswers) {
      const key = ans.questionId
      const entry = qMap.get(key) ?? {
        title: ans.question.title,
        type: ans.question.type,
        maxPoints: ans.question.points,
        difficulty: ans.question.difficulty,
        attempts: 0, totalEarned: 0, totalTime: 0, correct: 0,
      }
      entry.attempts++
      const earned = ans.pointsEarned ?? 0
      entry.totalEarned += earned
      entry.totalTime += ans.timeSpent ?? 0
      if (earned >= ans.question.points) entry.correct++
      qMap.set(key, entry)
    }
    const questionDifficulty = [...qMap.values()]
      .map(q => ({
        title: q.title.length > 60 ? q.title.slice(0, 57) + '…' : q.title,
        type: q.type,
        difficulty: q.difficulty,
        attempts: q.attempts,
        avgScore: q.attempts > 0 ? Math.round((q.totalEarned / (q.attempts * q.maxPoints)) * 100) : 0,
        correctRate: q.attempts > 0 ? Math.round((q.correct / q.attempts) * 100) : 0,
        avgTimeSecs: q.attempts > 0 ? Math.round(q.totalTime / q.attempts) : 0,
      }))
      .sort((a, b) => a.avgScore - b.avgScore) // hardest first

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
      questionDifficulty,
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

function rangeToDate(range?: string): Date | null {
  if (!range || range === 'all') return null
  const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : null
  if (!days) return null
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

function getISOWeek(date: Date): string {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
}
