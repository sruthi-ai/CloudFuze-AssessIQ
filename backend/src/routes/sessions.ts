import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { sendError, sendSuccess } from '../utils/errors'
import { scoreSession } from '../services/scoring'
import { sendSubmissionNotification } from '../utils/email'

function fisherYates<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function seededShuffle<T>(arr: T[], seed: string): T[] {
  const a = [...arr]
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0
  for (let i = a.length - 1; i > 0; i--) {
    h = (Math.imul(1664525, h) + 1013904223) | 0
    const j = Math.abs(h) % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const submitAnswerSchema = z.object({
  questionId: z.string(),
  responseText: z.string().optional(),
  selectedOptions: z.array(z.string()).optional(),
  numericValue: z.number().optional(),
  codeSubmission: z.string().optional(),
  language: z.string().optional(),
  timeSpent: z.number().int().optional(),
})

export async function sessionRoutes(server: FastifyInstance) {
  // GET /api/sessions/invite/:token — validate token, return test metadata
  server.get('/invite/:token', async (request, reply) => {
    const { token } = request.params as { token: string }

    const invitation = await prisma.invitation.findUnique({
      where: { token },
      include: {
        test: {
          include: {
            tenant: { select: { name: true, logoUrl: true, primaryColor: true } },
            sections: {
              include: {
                testQuestions: {
                  include: { question: { select: { id: true, type: true, title: true, body: true, timeLimit: true, points: true } } },
                  orderBy: { order: 'asc' },
                },
              },
              orderBy: { order: 'asc' },
            },
          },
        },
        candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    })

    if (!invitation) return sendError(reply, 404, 'Invitation not found')
    if (invitation.status === 'EXPIRED' || invitation.expiresAt < new Date()) {
      await prisma.invitation.update({ where: { id: invitation.id }, data: { status: 'EXPIRED' } })
      return sendError(reply, 410, 'This invitation has expired')
    }
    if (invitation.status === 'CANCELLED') return sendError(reply, 410, 'This invitation has been cancelled')
    if (invitation.status === 'COMPLETED') return sendError(reply, 409, 'You have already completed this assessment')

    // Mark opened
    if (invitation.status === 'SENT' || invitation.status === 'PENDING') {
      await prisma.invitation.update({ where: { id: invitation.id }, data: { status: 'OPENED', openedAt: new Date() } })
    }

    // Check if session already exists
    const existingSession = await prisma.session.findUnique({ where: { invitationId: invitation.id } })

    return sendSuccess(reply, {
      invitation: {
        id: invitation.id,
        token: invitation.token,
        expiresAt: invitation.expiresAt,
        status: invitation.status,
      },
      test: {
        id: invitation.test.id,
        title: invitation.test.title,
        description: invitation.test.description,
        instructions: invitation.test.instructions,
        duration: invitation.test.duration,
        proctoring: invitation.test.proctoring,
        roomScanEnabled: invitation.test.roomScanEnabled,
        roomScanIntervalMins: invitation.test.roomScanIntervalMins,
        questionCount: invitation.test.sections.reduce((a, s) => a + s.testQuestions.length, 0),
        sections: invitation.test.sections.map(s => ({
          id: s.id,
          title: s.title,
          questionCount: s.testQuestions.length,
        })),
        tenant: invitation.test.tenant,
      },
      candidate: invitation.candidate,
      existingSessionId: existingSession?.id ?? null,
      sessionStatus: existingSession?.status ?? null,
    })
  })

  // POST /api/sessions/start — start a session
  server.post('/start', async (request, reply) => {
    const { token, ipAddress, userAgent } = request.body as { token: string; ipAddress?: string; userAgent?: string }

    const invitation = await prisma.invitation.findUnique({
      where: { token },
      include: {
        test: {
          include: {
            sections: {
              include: { testQuestions: { orderBy: { order: 'asc' } } },
              orderBy: { order: 'asc' },
            },
          },
        },
      },
    })
    if (!invitation) return sendError(reply, 404, 'Invalid invitation')
    if (invitation.expiresAt < new Date()) return sendError(reply, 410, 'Invitation expired')
    if (invitation.status === 'COMPLETED') return sendError(reply, 409, 'Assessment already completed')

    // Return existing in-progress session
    const existing = await prisma.session.findUnique({ where: { invitationId: invitation.id } })
    if (existing && existing.status === 'IN_PROGRESS') {
      return sendSuccess(reply, { sessionId: existing.id, status: existing.status, startedAt: existing.startedAt, timeoutAt: existing.timeoutAt })
    }
    if (existing && existing.status === 'SUBMITTED') {
      return sendError(reply, 409, 'Assessment already submitted')
    }
    if (existing && existing.status === 'TIMED_OUT') {
      return sendError(reply, 409, 'Your session timed out — the assessment has been auto-submitted')
    }

    const timeoutAt = new Date(Date.now() + invitation.test.duration * 60 * 1000)

    // Generate per-session question order if shuffling is enabled
    let questionOrder: Record<string, string[]> | null = null
    if (invitation.test.shuffleQuestions) {
      questionOrder = {}
      for (const section of invitation.test.sections) {
        questionOrder[section.id] = fisherYates(section.testQuestions.map(tq => tq.questionId))
      }
    }

    const session = await prisma.session.create({
      data: {
        testId: invitation.testId,
        candidateId: invitation.candidateId,
        invitationId: invitation.id,
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        timeoutAt,
        ipAddress: ipAddress || request.ip,
        userAgent: userAgent || request.headers['user-agent'],
        ...(questionOrder ? { questionOrder } : {}),
      },
    })

    await prisma.invitation.update({ where: { id: invitation.id }, data: { status: 'STARTED' } })

    return sendSuccess(reply, { sessionId: session.id, status: session.status, startedAt: session.startedAt, timeoutAt })
  })

  // GET /api/sessions/:sessionId/questions — get full test questions for the session
  server.get('/:sessionId/questions', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const { token } = request.query as { token: string }

    const session = await prisma.session.findFirst({
      where: { id: sessionId, invitation: { token } },
      include: {
        test: {
          include: {
            sections: {
              include: {
                testQuestions: {
                  include: {
                    question: {
                      include: {
                        options: { select: { id: true, text: true, order: true } },
                        codeTestCases: {
                          where: { isHidden: false },
                          select: { id: true, description: true, input: true, expectedOutput: true, points: true, order: true },
                          orderBy: { order: 'asc' as const },
                        },
                      },
                    },
                  },
                  orderBy: { order: 'asc' },
                },
              },
              orderBy: { order: 'asc' },
            },
          },
        },
        answers: { select: { questionId: true, gradingStatus: true } },
      },
    })

    if (!session) return sendError(reply, 404, 'Session not found')
    if (session.status === 'SUBMITTED') return sendError(reply, 409, 'Assessment already submitted')
    if (session.timeoutAt && session.timeoutAt < new Date()) {
      // Auto-submit timed out session
      await autoSubmit(session.id)
      return sendError(reply, 410, 'Time has expired')
    }

    const answeredIds = new Set(session.answers.map(a => a.questionId))
    const questionOrder = session.questionOrder as Record<string, string[]> | null
    const shuffleOptions = session.test.shuffleOptions

    return sendSuccess(reply, {
      sections: session.test.sections.map(s => {
        let questions = s.testQuestions.map(tq => {
          const opts = shuffleOptions && tq.question.options.length > 1
            ? seededShuffle(tq.question.options, session.id + tq.question.id)
            : tq.question.options
          return {
            testQuestionId: tq.id,
            questionId: tq.question.id,
            order: tq.order,
            points: tq.points ?? tq.question.points,
            isRequired: tq.isRequired,
            answered: answeredIds.has(tq.question.id),
            question: {
              id: tq.question.id,
              type: tq.question.type,
              title: tq.question.title,
              body: tq.question.body,
              timeLimit: tq.question.timeLimit,
              options: opts,
              codeTestCases: (tq.question as any).codeTestCases ?? [],
            },
          }
        })

        // Apply stored question order if shuffled at session start
        if (questionOrder?.[s.id]) {
          const orderMap = new Map(questionOrder[s.id].map((id, idx) => [id, idx]))
          questions = questions.sort((a, b) => (orderMap.get(a.questionId) ?? 0) - (orderMap.get(b.questionId) ?? 0))
        }

        return { id: s.id, title: s.title, description: s.description, timeLimit: s.timeLimit, questions }
      }),
      timeRemaining: session.timeoutAt ? Math.max(0, Math.floor((session.timeoutAt.getTime() - Date.now()) / 1000)) : null,
    })
  })

  // POST /api/sessions/:sessionId/answers — save or update a single answer
  server.post('/:sessionId/answers', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const { token, ...answerData } = request.body as { token: string } & z.infer<typeof submitAnswerSchema>

    const result = submitAnswerSchema.safeParse(answerData)
    if (!result.success) return sendError(reply, 400, 'Validation error', result.error.flatten())

    const session = await prisma.session.findFirst({
      where: { id: sessionId, invitation: { token } },
    })
    if (!session) return sendError(reply, 404, 'Session not found')
    if (session.status !== 'IN_PROGRESS') return sendError(reply, 409, 'Session is not active')
    if (session.timeoutAt && session.timeoutAt < new Date()) {
      await autoSubmit(session.id)
      return sendError(reply, 410, 'Time has expired')
    }

    // Verify the submitted question belongs to this session's test
    const validQuestion = await prisma.testQuestion.findFirst({
      where: { testId: session.testId, questionId: result.data.questionId },
    })
    if (!validQuestion) return sendError(reply, 403, 'Question does not belong to this assessment')

    const answer = await prisma.answer.upsert({
      where: { sessionId_questionId: { sessionId, questionId: result.data.questionId } },
      create: { sessionId, ...result.data, selectedOptions: result.data.selectedOptions ?? [] },
      update: { ...result.data, selectedOptions: result.data.selectedOptions ?? [] },
    })

    return sendSuccess(reply, answer)
  })

  // POST /api/sessions/:sessionId/heartbeat — periodic liveness ping from candidate
  server.post('/:sessionId/heartbeat', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const { token } = request.body as { token: string }

    const session = await prisma.session.findFirst({
      where: { id: sessionId, invitation: { token }, status: 'IN_PROGRESS' },
      select: { id: true, timeoutAt: true },
    })
    if (!session) return sendError(reply, 404, 'Session not active')
    if (session.timeoutAt && session.timeoutAt < new Date()) {
      await autoSubmit(sessionId)
      return sendError(reply, 410, 'Time has expired')
    }

    await prisma.session.update({
      where: { id: sessionId },
      data: { lastHeartbeatAt: new Date() },
    })

    return sendSuccess(reply, {
      ok: true,
      timeRemaining: session.timeoutAt
        ? Math.max(0, Math.floor((session.timeoutAt.getTime() - Date.now()) / 1000))
        : null,
    })
  })

  // POST /api/sessions/:sessionId/submit — final submit
  server.post('/:sessionId/submit', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const { token } = request.body as { token: string }

    const session = await prisma.session.findFirst({
      where: { id: sessionId, invitation: { token } },
      include: { invitation: true },
    })
    if (!session) return sendError(reply, 404, 'Session not found')
    if (session.status === 'SUBMITTED') return sendError(reply, 409, 'Already submitted')
    if (session.status !== 'IN_PROGRESS') return sendError(reply, 409, 'Session is not active')

    await prisma.session.update({ where: { id: sessionId }, data: { status: 'SUBMITTED', submittedAt: new Date() } })
    await prisma.invitation.update({ where: { id: session.invitationId }, data: { status: 'COMPLETED' } })

    const score = await scoreSession(sessionId)

    // Notify recruiters/admins asynchronously (fire-and-forget)
    notifyRecruitersOnSubmission(sessionId, score).catch(() => {})
    fireCompletionWebhook(sessionId, score).catch(() => {})

    return sendSuccess(reply, {
      message: 'Assessment submitted successfully',
      score: score
        ? { percentage: score.percentage, passed: score.passed, totalPoints: score.totalPoints, earnedPoints: score.earnedPoints }
        : null,
    })
  })

  // GET /api/sessions/:sessionId/result — show result to candidate (if allowed)
  server.get('/:sessionId/result', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const { token } = request.query as { token: string }

    const session = await prisma.session.findFirst({
      where: { id: sessionId, invitation: { token } },
      include: {
        test: { select: { showResults: true, title: true, passingScore: true } },
        score: true,
      },
    })
    if (!session) return sendError(reply, 404, 'Session not found')
    if (session.status !== 'SUBMITTED') return sendError(reply, 400, 'Assessment not yet submitted')

    if (!session.test.showResults) {
      return sendSuccess(reply, {
        submitted: true,
        message: 'Your assessment has been submitted. Results will be shared by the recruiter.',
      })
    }

    return sendSuccess(reply, {
      submitted: true,
      testTitle: session.test.title,
      score: session.score,
    })
  })
}

async function notifyRecruitersOnSubmission(
  sessionId: string,
  score: { percentage: number; passed?: boolean | null } | null
) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      candidate: { select: { firstName: true, lastName: true } },
      test: { include: { tenant: { select: { settings: true } } } },
    },
  })
  if (!session) return

  const recruiters = await prisma.user.findMany({
    where: {
      tenantId: session.test.tenantId,
      isActive: true,
      role: { in: ['COMPANY_ADMIN', 'RECRUITER'] },
    },
    select: { email: true, firstName: true },
  })

  const candidateName = `${session.candidate.firstName} ${session.candidate.lastName}`
  const settings = (session.test.tenant.settings ?? undefined) as any

  await Promise.allSettled(
    recruiters.map(r =>
      sendSubmissionNotification({
        to: r.email,
        recruiterName: r.firstName,
        candidateName,
        testTitle: session.test.title,
        sessionId,
        score,
        tenantSettings: settings,
      })
    )
  )
}

async function fireCompletionWebhook(
  sessionId: string,
  score: { percentage: number; passed?: boolean | null } | null
) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
      test: { select: { id: true, title: true, tenant: { select: { settings: true } } } },
    },
  })
  if (!session) return
  const webhookUrl = ((session.test.tenant.settings ?? {}) as Record<string, unknown>).completionWebhookUrl as string | undefined
  if (!webhookUrl) return

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'assessment.completed',
      sessionId,
      candidate: session.candidate,
      test: { id: session.test.id, title: session.test.title },
      score: score ? { percentage: score.percentage, passed: score.passed } : null,
      submittedAt: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(10_000),
  })
}

async function autoSubmit(sessionId: string) {
  await prisma.session.update({ where: { id: sessionId }, data: { status: 'TIMED_OUT', submittedAt: new Date() } })
  const session = await prisma.session.findUnique({ where: { id: sessionId }, include: { invitation: true } })
  if (session?.invitation) {
    await prisma.invitation.update({ where: { id: session.invitation.id }, data: { status: 'COMPLETED' } })
  }
  await scoreSession(sessionId)
}
