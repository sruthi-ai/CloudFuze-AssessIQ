import type { User, Tenant } from '@prisma/client'

export interface JWTPayload {
  sub: string       // user id
  email: string
  role: string
  tenantId: string
  tenantSlug: string
}

export interface AuthenticatedRequest {
  user: JWTPayload
}

// Augment @fastify/jwt so request.user is typed as JWTPayload throughout the app
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JWTPayload
    user: JWTPayload
  }
}

export type SafeUser = Omit<User, 'passwordHash'>
export type SafeTenant = Tenant
