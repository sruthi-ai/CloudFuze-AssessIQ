import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { createWriteStream, createReadStream, existsSync, statSync } from 'fs'
import { join, extname } from 'path'
import { pipeline } from 'stream/promises'
import { prisma } from '../db'
import { sendError, sendSuccess } from '../utils/errors'
import { requireRole } from '../middleware/authenticate'
import { UPLOADS_DIR } from '../uploads'
import { addAlertClient, removeAlertClient, broadcastAlert, AlertPayload } from '../alerts'

const SEVERITY_MAP: Record<string, 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'> = {
  TAB_SWITCH: 'HIGH',
  WINDOW_BLUR: 'HIGH',
  FULLSCREEN_EXIT: 'HIGH',
  COPY_PASTE: 'HIGH',
  RIGHT_CLICK: 'MEDIUM',
  WEBCAM_BLOCKED: 'CRITICAL',
  MULTIPLE_FACES: 'CRITICAL',
  NO_FACE_DETECTED: 'HIGH',
  NOISE_DETECTED: 'MEDIUM',
  SCREENSHOT_TAKEN: 'LOW',
  DEVTOOLS_OPEN: 'CRITICAL',
  PHONE_DETECTED: 'CRITICAL',
  HEAD_TURNED: 'HIGH',
  SCREEN_RECORDING_STOPPED: 'HIGH',
  FACE_OBSTRUCTED: 'HIGH',
  SUSPECTED_ASSISTANCE: 'CRITICAL',
  CUSTOM: 'MEDIUM',
}

// Per-event-type risk score weights and per-type caps.
// weight  = points added per occurrence
// maxPts  = maximum this event type can contribute in total (prevents spam inflating score)
const EVENT_RISK: Record<string, { weight: number; maxPts: number }> = {
  PHONE_DETECTED:           { weight: 65, maxPts: 65  }, // clear rule violation — device change
  WEBCAM_BLOCKED:           { weight: 55, maxPts: 55  }, // deliberately hiding from camera
  DEVTOOLS_OPEN:            { weight: 45, maxPts: 45  }, // suspicious but easy accidental F12
  MULTIPLE_FACES:           { weight: 40, maxPts: 80  }, // another person visible
  TAB_SWITCH:               { weight: 25, maxPts: 75  }, // left test window
  SCREEN_RECORDING_STOPPED: { weight: 20, maxPts: 20  }, // stopped proctoring
  COPY_PASTE:               { weight: 18, maxPts: 54  }, // pasting external content
  FULLSCREEN_EXIT:          { weight: 12, maxPts: 36  }, // exited fullscreen
  NO_FACE_DETECTED:         { weight: 4, maxPts: 40  }, // face not visible
  HEAD_TURNED:              { weight:  8, maxPts: 32  }, // looking away
  FACE_OBSTRUCTED:          { weight: 15, maxPts: 45  }, // face deliberately partially hidden
  SUSPECTED_ASSISTANCE:     { weight: 60, maxPts: 60  }, // repeated same-direction gaze pattern
  WINDOW_BLUR:              { weight:  6, maxPts: 18  }, // window lost focus (can be accidental)
  RIGHT_CLICK:              { weight:  2, maxPts:  6  }, // right-click (often accidental)
  NOISE_DETECTED:           { weight:  2, maxPts:  8  }, // background noise (common)
  SCREENSHOT_TAKEN:         { weight:  0, maxPts:  0  }, // system monitoring — not a violation
  CUSTOM:                   { weight:  5, maxPts: 20  },
}

const EVENT_TYPES = [
  'TAB_SWITCH', 'WINDOW_BLUR', 'FULLSCREEN_EXIT', 'COPY_PASTE', 'RIGHT_CLICK',
  'WEBCAM_BLOCKED', 'MULTIPLE_FACES', 'NO_FACE_DETECTED', 'NOISE_DETECTED',
  'SCREENSHOT_TAKEN', 'DEVTOOLS_OPEN', 'PHONE_DETECTED', 'HEAD_TURNED',
  'SCREEN_RECORDING_STOPPED', 'FACE_OBSTRUCTED', 'SUSPECTED_ASSISTANCE', 'CUSTOM',
] as const

const eventSchema = z.object({
  token: z.string(),
  type: z.enum(EVENT_TYPES),
  description: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  occurredAt: z.string().datetime().optional(),
})

const bulkEventSchema = z.object({
  token: z.string(),
  events: z.array(eventSchema.omit({ token: true })),
})

// Broadcast a proctoring event alert to all connected admins for the session's tenant
async function maybeAlert(sessionId: string, type: string, severity: string, description: string | null, occurredAt: Date) {
  if (severity !== 'HIGH' && severity !== 'CRITICAL') return
  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        candidate: { select: { firstName: true, lastName: true, email: true } },
        test: { select: { id: true, title: true, tenantId: true } },
        proctoringEvents: { select: { type: true, severity: true } },
      },
    })
    if (!session) return
    const riskScore = calculateRiskScore(session.proctoringEvents)
    const payload: AlertPayload = {
      type: 'VIOLATION',
      sessionId,
      severity,
      eventType: type,
      description,
      occurredAt: occurredAt.toISOString(),
      candidate: session.candidate,
      test: { id: session.test.id, title: session.test.title },
      riskScore,
    }
    broadcastAlert(session.test.tenantId, payload)
  } catch { /* best-effort — never block the event store */ }
}

export async function proctoringRoutes(server: FastifyInstance) {
  const canView = requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'RECRUITER', 'VIEWER')

  // GET /api/proctoring/live/alerts — SSE stream for real-time proctor alerts (admin)
  server.get('/live/alerts', { preHandler: canView }, async (request, reply) => {
    const tenantId = request.user.tenantId

    reply.raw.setHeader('Content-Type', 'text/event-stream')
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.raw.setHeader('X-Accel-Buffering', 'no')
    reply.raw.writeHead(200)

    const send = (data: AlertPayload) => {
      try { reply.raw.write(`data: ${JSON.stringify(data)}\n\n`) } catch {}
    }

    addAlertClient(tenantId, send)
    send({ type: 'CONNECTED' })

    const heartbeat = setInterval(() => {
      try { reply.raw.write(': heartbeat\n\n') } catch {}
    }, 25_000)

    await new Promise<void>(resolve => {
      reply.raw.socket?.once('close', resolve)
      reply.raw.once('close', resolve)
    })

    clearInterval(heartbeat)
    removeAlertClient(tenantId, send)
  })

  // POST /api/proctoring/:sessionId/event — record a single proctoring event (public, token-validated)
  server.post('/:sessionId/event', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const result = eventSchema.safeParse(request.body)
    if (!result.success) return sendError(reply, 400, 'Validation error', result.error.flatten())

    const { token, type, description, metadata, occurredAt } = result.data

    const session = await prisma.session.findFirst({
      where: { id: sessionId, invitation: { token } },
      select: { id: true, status: true, test: { select: { proctoring: true } } },
    })
    if (!session) return sendError(reply, 404, 'Session not found')
    if (!session.test.proctoring) return sendSuccess(reply, { skipped: true })

    const ts = occurredAt ? new Date(occurredAt) : new Date()
    const severity = SEVERITY_MAP[type] ?? 'MEDIUM'
    const event = await prisma.proctoringEvent.create({
      data: { sessionId, type, severity, description, metadata: (metadata ?? null) as any, occurredAt: ts },
    })

    maybeAlert(sessionId, type, severity, description ?? null, ts)

    return sendSuccess(reply, event, 201)
  })

  // POST /api/proctoring/:sessionId/events — batch record (flush on submit/interval)
  server.post('/:sessionId/events', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const result = bulkEventSchema.safeParse(request.body)
    if (!result.success) return sendError(reply, 400, 'Validation error', result.error.flatten())

    const { token, events } = result.data

    const session = await prisma.session.findFirst({
      where: { id: sessionId, invitation: { token } },
      select: { id: true, test: { select: { proctoring: true } } },
    })
    if (!session) return sendError(reply, 404, 'Session not found')
    if (!session.test.proctoring) return sendSuccess(reply, { skipped: true, count: 0 })

    const created = await prisma.$transaction(
      events.map(e =>
        prisma.proctoringEvent.create({
          data: {
            sessionId,
            type: e.type,
            severity: SEVERITY_MAP[e.type] ?? 'MEDIUM',
            description: e.description,
            metadata: (e.metadata ?? null) as any,
            occurredAt: e.occurredAt ? new Date(e.occurredAt) : new Date(),
          },
        })
      )
    )

    // Broadcast alerts for any HIGH/CRITICAL events in this batch (non-blocking)
    created.forEach(ev => {
      maybeAlert(sessionId, ev.type, ev.severity, ev.description ?? null, ev.occurredAt)
    })

    return sendSuccess(reply, { count: created.length }, 201)
  })

  // GET /api/proctoring/active — live monitor: all in-progress sessions for this tenant
  server.get('/active', { preHandler: canView }, async (request, reply) => {
    const sessions = await prisma.session.findMany({
      where: {
        status: 'IN_PROGRESS',
        test: { tenantId: request.user.tenantId },
      },
      include: {
        candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
        test: { select: { id: true, title: true } },
        proctoringEvents: {
          orderBy: { occurredAt: 'desc' },
          take: 5,
          select: { id: true, type: true, severity: true, occurredAt: true, description: true },
        },
        webcamSnapshots: {
          orderBy: { occurredAt: 'desc' },
          take: 1,
          select: { id: true, occurredAt: true },
        },
        _count: { select: { proctoringEvents: true } },
      },
      orderBy: { startedAt: 'asc' },
    })

    const result = sessions.map(s => ({
      sessionId: s.id,
      startedAt: s.startedAt,
      timeoutAt: s.timeoutAt,
      candidate: s.candidate,
      test: s.test,
      recentEvents: s.proctoringEvents,
      totalEvents: s._count.proctoringEvents,
      riskScore: calculateRiskScore(s.proctoringEvents),
      latestSnapshot: s.webcamSnapshots[0] ?? null,
    }))

    return sendSuccess(reply, result)
  })

  // POST /api/proctoring/:sessionId/snapshot — upload watermarked webcam snapshot
  server.post('/:sessionId/snapshot', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const token = (request.query as { token?: string }).token

    const session = await prisma.session.findFirst({
      where: { id: sessionId, invitation: { token } },
      select: { id: true, test: { select: { proctoring: true } } },
    })
    if (!session) return sendError(reply, 404, 'Session not found')
    if (!session.test.proctoring) return sendSuccess(reply, { skipped: true })

    const data = await request.file()
    if (!data) return sendError(reply, 400, 'No file uploaded')

    const filename = `${sessionId}_${Date.now()}.jpg`
    const filePath = join(UPLOADS_DIR, 'snapshots', filename)
    await pipeline(data.file, createWriteStream(filePath))

    const snapshot = await prisma.webcamSnapshot.create({
      data: { sessionId, url: `/uploads/snapshots/${filename}` },
    })
    return sendSuccess(reply, snapshot, 201)
  })

  // POST /api/proctoring/:sessionId/screen-recording — upload screen recording
  server.post('/:sessionId/screen-recording', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const token = (request.query as { token?: string }).token

    const session = await prisma.session.findFirst({
      where: { id: sessionId, invitation: { token } },
      select: { id: true },
    })
    if (!session) return sendError(reply, 404, 'Session not found')

    const data = await request.file()
    if (!data) return sendError(reply, 400, 'No file uploaded')

    const filename = `${sessionId}_${Date.now()}.webm`
    const filePath = join(UPLOADS_DIR, 'recordings', filename)
    await pipeline(data.file, createWriteStream(filePath))

    const stat = statSync(filePath)
    const recording = await prisma.screenRecording.upsert({
      where: { sessionId },
      update: { url: `/uploads/recordings/${filename}`, fileSize: stat.size },
      create: { sessionId, url: `/uploads/recordings/${filename}`, fileSize: stat.size },
    })
    return sendSuccess(reply, recording, 201)
  })

  // GET /api/proctoring/:sessionId/media/snapshot/:snapshotId — serve snapshot image (admin)
  server.get('/:sessionId/media/snapshot/:snapshotId', { preHandler: canView }, async (request, reply) => {
    const { sessionId, snapshotId } = request.params as { sessionId: string; snapshotId: string }
    const snapshot = await prisma.webcamSnapshot.findFirst({
      where: { id: snapshotId, sessionId, session: { test: { tenantId: request.user.tenantId } } },
    })
    if (!snapshot) return sendError(reply, 404, 'Snapshot not found')

    // snapshot.url is /uploads/snapshots/filename.jpg — strip the leading /uploads/
    const relativePath = snapshot.url.replace(/^\/uploads\//, '')
    const filePath = join(UPLOADS_DIR, relativePath)
    if (!existsSync(filePath)) {
      return reply.status(404).send({ success: false, error: 'Snapshot file missing from disk', url: snapshot.url })
    }
    const ext = extname(filePath).toLowerCase()
    const mime = ext === '.png' ? 'image/png' : 'image/jpeg'
    return reply.type(mime).send(createReadStream(filePath))
  })

  // GET /api/proctoring/:sessionId/media/recording — serve screen recording (admin)
  server.get('/:sessionId/media/recording', { preHandler: canView }, async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const recording = await prisma.screenRecording.findFirst({
      where: { sessionId, session: { test: { tenantId: request.user.tenantId } } },
    })
    if (!recording) return sendError(reply, 404, 'Recording not found')

    const relativePath = recording.url.replace(/^\/uploads\//, '')
    const filePath = join(UPLOADS_DIR, relativePath)
    if (!existsSync(filePath)) {
      return reply.status(404).send({ success: false, error: 'Recording file missing from disk', url: recording.url })
    }
    return reply.type('video/webm').send(createReadStream(filePath))
  })

  // GET /api/proctoring/:sessionId/latest-snapshot-image — serve the most recent snapshot directly (admin)
  // Polled every 5s by the Live Monitor for real-time webcam view
  server.get('/:sessionId/latest-snapshot-image', { preHandler: canView }, async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const snapshot = await prisma.webcamSnapshot.findFirst({
      where: { sessionId, session: { test: { tenantId: request.user.tenantId } } },
      orderBy: { occurredAt: 'desc' },
    })
    if (!snapshot) return reply.status(404).send()

    const relativePath = snapshot.url.replace(/^\/uploads\//, '')
    const filePath = join(UPLOADS_DIR, relativePath)
    if (!existsSync(filePath)) return reply.status(404).send()

    reply.header('Cache-Control', 'no-store')
    return reply.type('image/jpeg').send(createReadStream(filePath))
  })

  // GET /api/proctoring/:sessionId/snapshots — list all snapshots for a session (admin)
  server.get('/:sessionId/snapshots', { preHandler: canView }, async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const session = await prisma.session.findFirst({
      where: { id: sessionId, test: { tenantId: request.user.tenantId } },
      include: {
        webcamSnapshots: { orderBy: { occurredAt: 'asc' } },
        screenRecording: true,
      },
    })
    if (!session) return sendError(reply, 404, 'Session not found')
    return sendSuccess(reply, {
      snapshots: session.webcamSnapshots,
      screenRecording: session.screenRecording,
    })
  })

  // POST /api/proctoring/:sessionId/room-scan — upload a room scan video (token-validated)
  server.post('/:sessionId/room-scan', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const { token, trigger } = request.query as { token?: string; trigger?: string }

    const session = await prisma.session.findFirst({
      where: { id: sessionId, invitation: { token } },
      select: { id: true, test: { select: { roomScanEnabled: true } } },
    })
    if (!session) return sendError(reply, 404, 'Session not found')
    if (!session.test.roomScanEnabled) return sendSuccess(reply, { skipped: true })

    const scanTrigger = trigger === 'PRE_TEST' ? 'PRE_TEST' : 'MID_TEST'

    const data = await request.file()
    if (!data) return sendError(reply, 400, 'No file uploaded')

    const filename = `${sessionId}_${scanTrigger}_${Date.now()}.webm`
    const filePath = join(UPLOADS_DIR, 'room-scans', filename)
    await pipeline(data.file, createWriteStream(filePath))

    const stat = statSync(filePath)
    const scan = await prisma.roomScan.create({
      data: {
        sessionId,
        url: `/uploads/room-scans/${filename}`,
        trigger: scanTrigger,
        fileSize: stat.size,
      },
    })
    return sendSuccess(reply, scan, 201)
  })

  // GET /api/proctoring/:sessionId/room-scans — list all room scans (admin)
  server.get('/:sessionId/room-scans', { preHandler: canView }, async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const session = await prisma.session.findFirst({
      where: { id: sessionId, test: { tenantId: request.user.tenantId } },
      select: { id: true },
    })
    if (!session) return sendError(reply, 404, 'Session not found')

    const scans = await prisma.roomScan.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    })
    return sendSuccess(reply, scans)
  })

  // GET /api/proctoring/:sessionId/room-scan/:scanId — stream a room scan video (admin)
  server.get('/:sessionId/room-scan/:scanId', { preHandler: canView }, async (request, reply) => {
    const { sessionId, scanId } = request.params as { sessionId: string; scanId: string }
    const scan = await prisma.roomScan.findFirst({
      where: { id: scanId, sessionId, session: { test: { tenantId: request.user.tenantId } } },
    })
    if (!scan) return sendError(reply, 404, 'Room scan not found')

    const relativePath = scan.url.replace(/^\/uploads\//, '')
    const filePath = join(UPLOADS_DIR, relativePath)
    if (!existsSync(filePath)) {
      return reply.status(404).send({ success: false, error: 'Room scan file missing from disk' })
    }
    return reply.type('video/webm').send(createReadStream(filePath))
  })

  // GET /api/proctoring/:sessionId/events — admin view of all events for a session
  server.get('/:sessionId/events', { preHandler: canView }, async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }

    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        test: { tenantId: request.user.tenantId },
      },
      include: {
        proctoringEvents: { orderBy: { occurredAt: 'asc' } },
        candidate: { select: { firstName: true, lastName: true, email: true } },
        test: { select: { title: true, proctoring: true } },
      },
    })
    if (!session) return sendError(reply, 404, 'Session not found')

    const events = session.proctoringEvents
    const summary = {
      total: events.length,
      critical: events.filter(e => e.severity === 'CRITICAL').length,
      high: events.filter(e => e.severity === 'HIGH').length,
      medium: events.filter(e => e.severity === 'MEDIUM').length,
      low: events.filter(e => e.severity === 'LOW').length,
      byType: events.reduce((acc, e) => {
        acc[e.type] = (acc[e.type] ?? 0) + 1
        return acc
      }, {} as Record<string, number>),
      riskScore: calculateRiskScore(events),
    }

    return sendSuccess(reply, { events, summary, candidate: session.candidate })
  })
}

function calculateRiskScore(events: { type: string; severity: string }[]): number {
  // Tally contribution per event type, capped per type to prevent single-category inflation
  const totals: Record<string, number> = {}
  for (const e of events) {
    const rule = EVENT_RISK[e.type]
    if (!rule || rule.weight === 0) continue
    totals[e.type] = Math.min(rule.maxPts, (totals[e.type] ?? 0) + rule.weight)
  }
  const raw = Object.values(totals).reduce((s, v) => s + v, 0)
  return Math.min(100, raw)
}
