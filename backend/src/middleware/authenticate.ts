import { FastifyRequest, FastifyReply } from 'fastify'

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
  } catch {
    reply.status(401).send({ success: false, error: 'Unauthorized' })
  }
}

export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply)
    if (reply.sent) return

    if (!roles.includes(request.user.role)) {
      reply.status(403).send({ success: false, error: 'Forbidden' })
    }
  }
}
