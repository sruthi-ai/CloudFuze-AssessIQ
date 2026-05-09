import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../db'
import { sendError, sendSuccess } from '../utils/errors'
import { requireRole } from '../middleware/authenticate'

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(['COMPANY_ADMIN', 'RECRUITER', 'VIEWER']),
})

const updateUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  role: z.enum(['COMPANY_ADMIN', 'RECRUITER', 'VIEWER']).optional(),
  isActive: z.boolean().optional(),
})

export async function userRoutes(server: FastifyInstance) {
  const adminOrRecruiter = requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'RECRUITER')
  const adminOnly = requireRole('SUPER_ADMIN', 'COMPANY_ADMIN')

  // GET /api/users
  server.get('/', { preHandler: adminOrRecruiter }, async (request, reply) => {
    const users = await prisma.user.findMany({
      where: { tenantId: request.user.tenantId },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, isActive: true, lastLoginAt: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    return sendSuccess(reply, users)
  })

  // POST /api/users
  server.post('/', { preHandler: adminOnly }, async (request, reply) => {
    const result = createUserSchema.safeParse(request.body)
    if (!result.success) return sendError(reply, 400, 'Validation error', result.error.flatten())

    const { email, password, firstName, lastName, role } = result.data
    const existing = await prisma.user.findUnique({
      where: { email_tenantId: { email, tenantId: request.user.tenantId } },
    })
    if (existing) return sendError(reply, 409, 'User with this email already exists')

    const passwordHash = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({
      data: { email, passwordHash, firstName, lastName, role, tenantId: request.user.tenantId },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true, createdAt: true },
    })
    return sendSuccess(reply, user, 201)
  })

  // PATCH /api/users/:id
  server.patch('/:id', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const result = updateUserSchema.safeParse(request.body)
    if (!result.success) return sendError(reply, 400, 'Validation error', result.error.flatten())

    const user = await prisma.user.findFirst({ where: { id, tenantId: request.user.tenantId } })
    if (!user) return sendError(reply, 404, 'User not found')

    const updated = await prisma.user.update({
      where: { id },
      data: result.data,
      select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true },
    })
    return sendSuccess(reply, updated)
  })
}
