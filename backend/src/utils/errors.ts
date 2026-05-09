import { FastifyReply } from 'fastify'

export const sendError = (reply: FastifyReply, statusCode: number, message: string, details?: unknown) => {
  return reply.status(statusCode).send({ success: false, error: message, ...(details ? { details } : {}) })
}

export const sendSuccess = <T>(reply: FastifyReply, data: T, statusCode = 200) => {
  return reply.status(statusCode).send({ success: true, data })
}
