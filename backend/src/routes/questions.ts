import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { sendError, sendSuccess } from '../utils/errors'
import { requireRole } from '../middleware/authenticate'

const optionSchema = z.object({
  text: z.string().min(1),
  isCorrect: z.boolean().default(false),
  order: z.number().int().default(0),
})

const testCaseSchema = z.object({
  input: z.string().default(''),
  expectedOutput: z.string().min(1, 'Expected output required'),
  isHidden: z.boolean().default(false),
  points: z.number().min(0).default(1),
  description: z.string().optional(),
  order: z.number().int().default(0),
})

const createQuestionSchema = z.object({
  type: z.enum(['MCQ_SINGLE', 'MCQ_MULTI', 'TRUE_FALSE', 'ESSAY', 'SHORT_ANSWER', 'CODE', 'FILE_UPLOAD', 'AUDIO_RECORDING', 'RANKING', 'NUMERICAL']),
  title: z.string().min(1),
  body: z.string().min(1),
  explanation: z.string().optional(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
  points: z.number().optional(),
  timeLimit: z.number().int().optional(),
  tags: z.array(z.string()).optional(),
  domain: z.string().optional(),
  bankId: z.string().optional(),
  options: z.array(optionSchema).optional(),
  testCases: z.array(testCaseSchema).optional(), // for CODE questions
})

const QUESTION_INCLUDE = {
  options: { orderBy: { order: 'asc' } as const },
  codeTestCases: { orderBy: { order: 'asc' } as const },
}

export async function questionRoutes(server: FastifyInstance) {
  const canEdit = requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'RECRUITER')
  const canView = requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'RECRUITER', 'VIEWER')

  // GET /api/questions
  server.get('/', { preHandler: canView }, async (request, reply) => {
    const query = request.query as {
      bankId?: string; type?: string; difficulty?: string; domain?: string;
      tags?: string; search?: string; page?: string; limit?: string
    }
    const page = parseInt(query.page || '1')
    const limit = parseInt(query.limit || '20')
    const skip = (page - 1) * limit

    const bank = query.bankId
      ? await prisma.questionBank.findFirst({ where: { id: query.bankId, tenantId: request.user.tenantId } })
      : await prisma.questionBank.findFirst({ where: { tenantId: request.user.tenantId, isDefault: true } })

    if (!bank) return sendError(reply, 404, 'Question bank not found')

    const where: Record<string, unknown> = { bankId: bank.id, isArchived: false }
    if (query.type) where.type = query.type
    if (query.difficulty) where.difficulty = query.difficulty
    if (query.domain) where.domain = query.domain
    if (query.search) where.title = { contains: query.search, mode: 'insensitive' }

    const [questions, total] = await Promise.all([
      prisma.question.findMany({
        where,
        include: QUESTION_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.question.count({ where }),
    ])

    return sendSuccess(reply, { questions, total, page, limit, pages: Math.ceil(total / limit) })
  })

  // GET /api/questions/banks
  server.get('/banks', { preHandler: canView }, async (request, reply) => {
    const banks = await prisma.questionBank.findMany({
      where: { tenantId: request.user.tenantId },
      include: { _count: { select: { questions: true } } },
      orderBy: { createdAt: 'asc' },
    })
    return sendSuccess(reply, banks)
  })

  // POST /api/questions/banks
  server.post('/banks', { preHandler: canEdit }, async (request, reply) => {
    const { name, description } = request.body as { name: string; description?: string }
    if (!name) return sendError(reply, 400, 'Name is required')

    const bank = await prisma.questionBank.create({
      data: { name, description, tenantId: request.user.tenantId },
    })
    return sendSuccess(reply, bank, 201)
  })

  // GET /api/questions/:id
  server.get('/:id', { preHandler: canView }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const question = await prisma.question.findFirst({
      where: { id, bank: { tenantId: request.user.tenantId } },
      include: { ...QUESTION_INCLUDE, bank: true },
    })
    if (!question) return sendError(reply, 404, 'Question not found')
    return sendSuccess(reply, question)
  })

  // POST /api/questions
  server.post('/', { preHandler: canEdit }, async (request, reply) => {
    const result = createQuestionSchema.safeParse(request.body)
    if (!result.success) return sendError(reply, 400, 'Validation error', result.error.flatten())

    const { options, testCases, bankId, ...data } = result.data

    let targetBankId = bankId
    if (!targetBankId) {
      const defaultBank = await prisma.questionBank.findFirst({
        where: { tenantId: request.user.tenantId, isDefault: true },
      })
      if (!defaultBank) return sendError(reply, 404, 'No default question bank found')
      targetBankId = defaultBank.id
    } else {
      const bank = await prisma.questionBank.findFirst({ where: { id: targetBankId, tenantId: request.user.tenantId } })
      if (!bank) return sendError(reply, 404, 'Question bank not found')
    }

    const question = await prisma.question.create({
      data: {
        ...data,
        bankId: targetBankId,
        options: options?.length ? { create: options } : undefined,
        codeTestCases: testCases?.length ? { create: testCases } : undefined,
      },
      include: QUESTION_INCLUDE,
    })
    return sendSuccess(reply, question, 201)
  })

  // PATCH /api/questions/:id
  server.patch('/:id', { preHandler: canEdit }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const result = createQuestionSchema.partial().safeParse(request.body)
    if (!result.success) return sendError(reply, 400, 'Validation error', result.error.flatten())

    const question = await prisma.question.findFirst({
      where: { id, bank: { tenantId: request.user.tenantId } },
    })
    if (!question) return sendError(reply, 404, 'Question not found')

    const { options, testCases, bankId: _, ...data } = result.data

    if (options !== undefined) {
      await prisma.questionOption.deleteMany({ where: { questionId: id } })
    }
    if (testCases !== undefined) {
      await prisma.codeTestCase.deleteMany({ where: { questionId: id } })
    }

    const updated = await prisma.question.update({
      where: { id },
      data: {
        ...data,
        options: options?.length ? { create: options } : undefined,
        codeTestCases: testCases?.length ? { create: testCases } : undefined,
      },
      include: QUESTION_INCLUDE,
    })
    return sendSuccess(reply, updated)
  })

  // DELETE /api/questions/:id
  server.delete('/:id', { preHandler: canEdit }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const question = await prisma.question.findFirst({
      where: { id, bank: { tenantId: request.user.tenantId } },
    })
    if (!question) return sendError(reply, 404, 'Question not found')

    await prisma.question.update({ where: { id }, data: { isArchived: true } })
    return sendSuccess(reply, { message: 'Question archived' })
  })

  // POST /api/questions/bulk-import
  server.post('/bulk-import', { preHandler: canEdit }, async (request, reply) => {
    const { questions, bankId } = request.body as { questions: unknown[]; bankId?: string }
    if (!Array.isArray(questions) || questions.length === 0) {
      return sendError(reply, 400, 'Questions array required')
    }

    let targetBankId = bankId
    if (!targetBankId) {
      const defaultBank = await prisma.questionBank.findFirst({
        where: { tenantId: request.user.tenantId, isDefault: true },
      })
      if (!defaultBank) return sendError(reply, 404, 'No default question bank')
      targetBankId = defaultBank.id
    }

    const validated = questions.map(q => createQuestionSchema.parse(q))
    const created = await prisma.$transaction(
      validated.map(({ options, testCases, bankId: _bid, ...data }) =>
        prisma.question.create({
          data: {
            ...data,
            bankId: targetBankId!,
            options: options?.length ? { create: options } : undefined,
            codeTestCases: testCases?.length ? { create: testCases } : undefined,
          },
          include: QUESTION_INCLUDE,
        })
      )
    )
    return sendSuccess(reply, { created: created.length, questions: created }, 201)
  })
}
