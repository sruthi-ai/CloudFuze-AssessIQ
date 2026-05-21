import { FastifyRequest, FastifyReply } from 'fastify'

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    // EventSource (SSE) cannot set headers — accept token via ?jwt= query param as fallback
    const query = request.query as Record<string, string>
    if (!request.headers.authorization && query.jwt) {
      request.headers.authorization = `Bearer ${query.jwt}`
    }
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
