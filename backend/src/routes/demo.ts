import { FastifyInstance } from 'fastify'
import crypto from 'crypto'
import { prisma } from '../db'
import { sendError, sendSuccess } from '../utils/errors'

function fisherYates<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export async function demoRoutes(server: FastifyInstance) {
  // GET /api/demo/:token — public: test summary for the practice landing page
  server.get('/:token', async (request, reply) => {
    const { token } = request.params as { token: string }
    const test = await prisma.test.findFirst({
      where: { practiceToken: token, practiceEnabled: true, status: 'PUBLISHED' },
      select: {
        id: true, title: true, description: true, instructions: true,
        duration: true, passingScore: true,
        tenant: { select: { name: true, logoUrl: true, primaryColor: true } },
        _count: { select: { sections: true } },
      },
    })
    if (!test) return sendError(reply, 404, 'Practice link not found or no longer active')
    return sendSuccess(reply, test)
  })

  // POST /api/demo/:token/start — { name } → creates a practice session, returns tokens
  server.post('/:token/start', async (request, reply) => {
    const { token } = request.params as { token: string }
    const { name } = request.body as { name?: string }
    if (!name?.trim()) return sendError(reply, 400, 'Please enter your name')

    const test = await prisma.test.findFirst({
      where: { practiceToken: token, practiceEnabled: true, status: 'PUBLISHED' },
      include: {
        sections: {
          include: { testQuestions: { orderBy: { order: 'asc' } } },
          orderBy: { order: 'asc' },
        },
      },
    })
    if (!test) return sendError(reply, 404, 'Practice link not found or no longer active')

    const nameParts = name.trim().split(/\s+/)
    const firstName = nameParts[0]
    const lastName = nameParts.slice(1).join(' ') || ''

    // Create a throwaway candidate (unique email per practice attempt)
    const candidate = await prisma.candidate.create({
      data: {
        email: `practice-${crypto.randomUUID()}@demo.internal`,
        firstName,
        lastName,
        tenantId: test.tenantId,
      },
    })

    // Create a short-lived invitation (status STARTED so /start won't re-create)
    const invitationToken = crypto.randomUUID().replace(/-/g, '')
    const invitation = await prisma.invitation.create({
      data: {
        token: invitationToken,
        testId: test.id,
        candidateId: candidate.id,
        sentById: test.createdById,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: 'STARTED',
      },
    })

    // Build questionOrder for shuffle / pool randomisation
    let questionOrder: Record<string, string[]> | null = null
    if (test.shuffleQuestions || test.sections.some(s => s.pickCount)) {
      questionOrder = {}
      for (const section of test.sections) {
        let ids = section.testQuestions.map(tq => tq.questionId)
        if (section.pickCount && section.pickCount < ids.length) {
          ids = fisherYates([...ids]).slice(0, section.pickCount)
        } else if (test.shuffleQuestions) {
          ids = fisherYates([...ids])
        }
        questionOrder[section.id] = ids
      }
    }

    const timeoutAt = new Date(Date.now() + test.duration * 60 * 1000)
    const session = await prisma.session.create({
      data: {
        testId: test.id,
        candidateId: candidate.id,
        invitationId: invitation.id,
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        timeoutAt,
        isPractice: true,
        ...(questionOrder ? { questionOrder: questionOrder as any } : {}),
      },
    })

    return sendSuccess(reply, { invitationToken, sessionId: session.id })
  })
}
