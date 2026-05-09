import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import multipart from '@fastify/multipart'

import { authRoutes } from './routes/auth'
import { userRoutes } from './routes/users'
import { testRoutes } from './routes/tests'
import { questionRoutes } from './routes/questions'
import { candidateRoutes } from './routes/candidates'
import { sessionRoutes } from './routes/sessions'
import { resultRoutes } from './routes/results'
import { settingsRoutes } from './routes/settings'
import { proctoringRoutes } from './routes/proctoring'
import { codeRoutes } from './routes/code'
import { analyticsRoutes } from './routes/analytics'

const server = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
  },
})

async function bootstrap() {
  // Security
  await server.register(helmet, { contentSecurityPolicy: false })
  await server.register(cors, {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  })
  await server.register(rateLimit, { max: 100, timeWindow: '1 minute' })
  await server.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } })

  // JWT
  await server.register(jwt, {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  })

  // Routes
  await server.register(authRoutes, { prefix: '/api/auth' })
  await server.register(userRoutes, { prefix: '/api/users' })
  await server.register(testRoutes, { prefix: '/api/tests' })
  await server.register(questionRoutes, { prefix: '/api/questions' })
  await server.register(candidateRoutes, { prefix: '/api/candidates' })
  await server.register(sessionRoutes, { prefix: '/api/sessions' })
  await server.register(resultRoutes, { prefix: '/api/results' })
  await server.register(settingsRoutes, { prefix: '/api/settings' })
  await server.register(proctoringRoutes, { prefix: '/api/proctoring' })
  await server.register(codeRoutes, { prefix: '/api/code' })
  await server.register(analyticsRoutes, { prefix: '/api/analytics' })

  // Health check
  server.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  // 404 handler
  server.setNotFoundHandler((request, reply) => {
    reply.status(404).send({ success: false, error: `Route ${request.method} ${request.url} not found` })
  })

  // Error handler
  server.setErrorHandler((error, request, reply) => {
    server.log.error(error)
    if (error.statusCode) {
      reply.status(error.statusCode).send({ success: false, error: error.message })
    } else {
      reply.status(500).send({ success: false, error: 'Internal server error' })
    }
  })

  const port = parseInt(process.env.PORT || '3001')
  const host = process.env.HOST || '0.0.0.0'

  await server.listen({ port, host })
  console.log(`AssessIQ backend running at http://${host}:${port}`)
}

bootstrap().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
