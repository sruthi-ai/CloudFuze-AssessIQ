import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../db'
import { sendError, sendSuccess } from '../utils/errors'
import { authenticate } from '../middleware/authenticate'
import type { JWTPayload } from '../types'

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  companyName: z.string().min(1),
  companySlug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  tenantSlug: z.string(),
})

const refreshSchema = z.object({
  refreshToken: z.string(),
})

function signTokens(server: FastifyInstance, payload: JWTPayload) {
  const accessToken = server.jwt.sign(payload, { expiresIn: process.env.JWT_EXPIRES_IN || '15m' })
  const refreshToken = server.jwt.sign({ sub: payload.sub } as any, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' })
  return { accessToken, refreshToken }
}

export async function authRoutes(server: FastifyInstance) {
  // POST /api/auth/register — create company + admin user
  server.post('/register', async (request, reply) => {
    const result = registerSchema.safeParse(request.body)
    if (!result.success) return sendError(reply, 400, 'Validation error', result.error.flatten())

    const { email, password, firstName, lastName, companyName, companySlug } = result.data

    const existingSlug = await prisma.tenant.findUnique({ where: { slug: companySlug } })
    if (existingSlug) return sendError(reply, 409, 'Company slug already taken')

    const passwordHash = await bcrypt.hash(password, 12)

    const tenant = await prisma.tenant.create({
      data: {
        name: companyName,
        slug: companySlug,
        users: {
          create: {
            email,
            passwordHash,
            firstName,
            lastName,
            role: 'COMPANY_ADMIN',
          },
        },
        questionBanks: {
          create: {
            name: 'Default Question Bank',
            isDefault: true,
          },
        },
      },
      include: { users: true },
    })

    const user = tenant.users[0]
    const payload: JWTPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
    }
    const { accessToken, refreshToken } = signTokens(server, payload)

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    })

    return sendSuccess(reply, {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role },
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
    }, 201)
  })

  // POST /api/auth/login
  server.post('/login', async (request, reply) => {
    const result = loginSchema.safeParse(request.body)
    if (!result.success) return sendError(reply, 400, 'Validation error', result.error.flatten())

    const { email, password, tenantSlug } = result.data

    const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } })
    if (!tenant || !tenant.isActive) return sendError(reply, 401, 'Invalid credentials')

    const user = await prisma.user.findUnique({ where: { email_tenantId: { email, tenantId: tenant.id } } })
    if (!user || !user.isActive) return sendError(reply, 401, 'Invalid credentials')

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return sendError(reply, 401, 'Invalid credentials')

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

    const payload: JWTPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
    }
    const { accessToken, refreshToken } = signTokens(server, payload)

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    })

    return sendSuccess(reply, {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role },
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, logoUrl: tenant.logoUrl, primaryColor: tenant.primaryColor },
    })
  })

  // POST /api/auth/refresh
  server.post('/refresh', async (request, reply) => {
    const result = refreshSchema.safeParse(request.body)
    if (!result.success) return sendError(reply, 400, 'Validation error')

    const stored = await prisma.refreshToken.findUnique({
      where: { token: result.data.refreshToken },
      include: { user: { include: { tenant: true } } },
    })

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      return sendError(reply, 401, 'Invalid or expired refresh token')
    }

    try {
      server.jwt.verify(result.data.refreshToken)
    } catch {
      return sendError(reply, 401, 'Invalid refresh token')
    }

    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } })

    const { user } = stored
    const payload: JWTPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      tenantSlug: user.tenant.slug,
    }
    const { accessToken, refreshToken } = signTokens(server, payload)

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    })

    return sendSuccess(reply, { accessToken, refreshToken })
  })

  // POST /api/auth/logout
  server.post('/logout', { preHandler: authenticate }, async (request, reply) => {
    const body = request.body as { refreshToken?: string }
    if (body?.refreshToken) {
      await prisma.refreshToken.updateMany({
        where: { token: body.refreshToken, userId: request.user.sub },
        data: { revokedAt: new Date() },
      })
    }
    return sendSuccess(reply, { message: 'Logged out' })
  })

  // GET /api/auth/me
  server.get('/me', { preHandler: authenticate }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.sub },
      include: { tenant: true },
    })
    if (!user) return sendError(reply, 404, 'User not found')

    const { passwordHash: _, ...safeUser } = user
    return sendSuccess(reply, safeUser)
  })
}
