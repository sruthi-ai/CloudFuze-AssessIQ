import { FastifyInstance } from 'fastify'
import { prisma } from '../db'
import { sendSuccess } from '../utils/errors'
import { requireRole } from '../middleware/authenticate'

export async function auditRoutes(server: FastifyInstance) {
  const canView = requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'RECRUITER', 'VIEWER')

  // GET /api/audit
  server.get('/', { preHandler: canView }, async (request, reply) => {
    const query = request.query as {
      entityType?: string
      action?: string
      userId?: string
      page?: string
      limit?: string
    }
    const page = parseInt(query.page || '1')
    const limit = Math.min(parseInt(query.limit || '50'), 200)
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = { tenantId: request.user.tenantId }
    if (query.entityType) where.entityType = query.entityType
    if (query.action) where.action = query.action
    if (query.userId) where.userId = query.userId

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ])

    return sendSuccess(reply, { logs, total, page, limit, pages: Math.ceil(total / limit) })
  })
}
