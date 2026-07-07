import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import multipart from '@fastify/multipart'
import Redis from 'ioredis'
import { createReadStream, existsSync } from 'fs'
import { extname, join, resolve, sep } from 'path'
import { UPLOADS_DIR, initUploads } from './uploads'
import { prisma } from './db'

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
import { auditRoutes } from './routes/audit'
import { ssoRoutes } from './routes/sso'
import { demoRoutes } from './routes/demo'
import { downloadRoutes } from './routes/downloads'
import { aiRoutes } from './routes/ai'
import { scorecardRoutes } from './routes/scorecard'
import { audioAssetRoutes } from './routes/audioAssets'
import { startReminderJob } from './jobs/reminders'
import { startSessionTimeoutJob } from './jobs/sessionTimeout'
import { startRetentionJob } from './jobs/retention'

// ── Startup security validation ───────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET
const INSECURE_DEFAULTS = ['dev-secret-change-in-production', 'change-in-production', 'secret']
if (!JWT_SECRET || JWT_SECRET.length < 32 || INSECURE_DEFAULTS.some(d => JWT_SECRET.includes(d))) {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: JWT_SECRET is not set to a secure value. Refusing to start.')
    process.exit(1)
  } else {
    console.warn('⚠  WARNING: JWT_SECRET is insecure — set a strong random value before production')
  }
}

const REQUIRED_IN_PROD = ['DATABASE_URL', 'JWT_SECRET', 'FRONTEND_URL']
if (process.env.NODE_ENV === 'production') {
  const missing = REQUIRED_IN_PROD.filter(k => !process.env[k])
  if (missing.length) {
    console.error(`FATAL: Missing required environment variables: ${missing.join(', ')}`)
    process.exit(1)
  }
}

if (!process.env.OPENAI_API_KEY) {
  console.warn('⚠  WARNING: OPENAI_API_KEY not set — AI question generation will be unavailable')
}

const server = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
  },
})

// No error-tracking service is wired in yet — these are the two places to add
// Sentry.captureException(err) (or similar) once a DSN is configured. Until then,
// this at minimum guarantees a crash is logged with a clear FATAL marker instead
// of silently vanishing (e.g. from an unhandled promise in a background cron job).
process.on('uncaughtException', (err) => {
  server.log.fatal({ err }, 'FATAL: uncaughtException')
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  server.log.fatal({ err: reason }, 'FATAL: unhandledRejection')
  process.exit(1)
})

async function bootstrap() {
  initUploads()
  // Security
  await server.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        mediaSrc: ["'self'", 'blob:'],
        workerSrc: ["'self'", 'blob:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
  const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
    .split(',').map(s => s.trim()).filter(Boolean)
  await server.register(cors, {
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
      cb(new Error(`Origin ${origin} not allowed`), false)
    },
    credentials: true,
  })
  // Rate-limit state: backed by Redis when REDIS_URL is set, so limits survive
  // restarts and stay consistent across multiple instances. Falls back to the
  // plugin's default in-memory store (single-process only) if unset.
  let rateLimitRedis: Redis | undefined
  if (process.env.REDIS_URL) {
    rateLimitRedis = new Redis(process.env.REDIS_URL, { connectTimeout: 500, maxRetriesPerRequest: 1 })
    rateLimitRedis.on('error', (err) => server.log.warn({ err }, 'Redis rate-limit store connection error'))
  } else {
    console.warn('⚠  WARNING: REDIS_URL not set — rate limiting will use in-memory state (resets on restart, inconsistent across multiple instances)')
  }
  await server.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    redis: rateLimitRedis,
    skipOnError: true,
  })
  await server.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } })

  // JWT
  await server.register(jwt, {
    secret: JWT_SECRET ?? 'dev-secret-change-in-production',
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
  await server.register(auditRoutes, { prefix: '/api/audit' })
  await server.register(ssoRoutes, { prefix: '/api/sso' })
  await server.register(demoRoutes, { prefix: '/api/demo' })
  await server.register(downloadRoutes, { prefix: '/api/downloads' })
  await server.register(aiRoutes, { prefix: '/api/ai' })
  await server.register(scorecardRoutes, { prefix: '/api/scorecard' })
  await server.register(audioAssetRoutes, { prefix: '/api/audio-assets' })

  // Health check
  server.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  // Static file serving for uploads — auth + tenant isolation + path traversal guard
  server.get('/uploads/*', async (request, reply) => {
    // Require a valid JWT
    try { await request.jwtVerify() } catch {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    const wildcard = (request.params as { '*': string })['*']
    const safePath = wildcard.replace(/\.\./g, '').replace(/^\/+/, '')
    const resolvedUploads = resolve(UPLOADS_DIR)
    const fullPath = resolve(resolvedUploads, safePath)

    // Ensure resolved path is within UPLOADS_DIR
    if (!fullPath.startsWith(resolvedUploads + sep)) {
      return reply.status(403).send({ error: 'Forbidden' })
    }

    // Tenant isolation: filename format is {sessionId}_{timestamp}.{ext}
    // Verify the session belongs to the requesting user's tenant
    const filename = fullPath.split(sep).pop() ?? ''
    const sessionId = filename.split('_')[0]
    if (sessionId) {
      const session = await prisma.session.findFirst({
        where: { id: sessionId },
        select: { test: { select: { tenantId: true } } },
      })
      if (!session || session.test.tenantId !== (request.user as any).tenantId) {
        return reply.status(403).send({ error: 'Forbidden' })
      }
    }

    if (!existsSync(fullPath)) return reply.status(404).send({ error: 'File not found' })
    const ext = extname(fullPath).toLowerCase()
    const mime =
      ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
      ext === '.png' ? 'image/png' :
      ext === '.webm' ? 'video/webm' :
      ext === '.pdf' ? 'application/pdf' :
      ext === '.mp3' ? 'audio/mpeg' :
      ext === '.wav' ? 'audio/wav' :
      ext === '.ogg' ? 'audio/ogg' :
      'application/octet-stream'
    return reply.type(mime).send(createReadStream(fullPath))
  })

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
  startReminderJob()
  startSessionTimeoutJob()
  startRetentionJob()
}

bootstrap().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
