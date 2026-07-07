import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import OpenAI from 'openai'
import { createReadStream, createWriteStream, existsSync } from 'fs'
import { writeFile } from 'fs/promises'
import { extname, join } from 'path'
import { pipeline } from 'stream/promises'
import { randomUUID } from 'crypto'
import { prisma } from '../db'
import { sendError, sendSuccess } from '../utils/errors'
import { requireRole } from '../middleware/authenticate'
import { UPLOADS_DIR } from '../uploads'
import { logAudit } from '../utils/audit'

const AUDIO_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.webm': 'audio/webm',
}
const UPLOAD_MIME_ALLOWLIST = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm']
const UPLOAD_MIME_TO_EXT: Record<string, string> = {
  'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'webm',
}

// OpenAI TTS hard limit on input length
const MAX_SCRIPT_CHARS = 4096

const generateSchema = z.object({
  name: z.string().min(1).max(200),
  script: z.string().min(1).max(MAX_SCRIPT_CHARS),
  voice: z.string().min(1).default('alloy'),
  accent: z.string().min(1).default('American English'),
  playLimit: z.number().int().min(0).default(0),
})

export async function audioAssetRoutes(server: FastifyInstance) {
  const canEdit = requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'RECRUITER')
  const canView = requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'RECRUITER', 'VIEWER')

  // GET /api/audio-assets — list tenant's audio assets (admin)
  server.get('/', { preHandler: canView }, async (request, reply) => {
    const assets = await prisma.audioAsset.findMany({
      where: { tenantId: request.user.tenantId },
      orderBy: { createdAt: 'desc' },
    })
    return sendSuccess(reply, assets)
  })

  // POST /api/audio-assets/generate — generate native-speaker audio via OpenAI TTS
  server.post('/generate', { preHandler: canEdit }, async (request, reply) => {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return sendError(reply, 503, 'AI audio generation is not configured — add OPENAI_API_KEY to your environment')
    }

    const result = generateSchema.safeParse(request.body)
    if (!result.success) return sendError(reply, 400, 'Validation error', result.error.flatten())
    const { name, script, voice, accent, playLimit } = result.data

    try {
      const client = new OpenAI({ apiKey })
      const speech = await client.audio.speech.create({
        model: 'gpt-4o-mini-tts',
        voice,
        input: script,
        instructions: `Speak with a ${accent} accent, at a natural, clear pace suitable for a listening comprehension exam.`,
        response_format: 'mp3',
      }, { timeout: 30_000 })

      const buffer = Buffer.from(await speech.arrayBuffer())
      const filename = `${randomUUID()}.mp3`
      const filePath = join(UPLOADS_DIR, 'audio-assets', filename)
      await writeFile(filePath, buffer)

      const asset = await prisma.audioAsset.create({
        data: {
          name, url: `/uploads/audio-assets/${filename}`, sourceType: 'TTS_GENERATED',
          accent, voice, transcript: script, playLimit, tenantId: request.user.tenantId,
        },
      })

      logAudit({
        tenantId: request.user.tenantId, userId: request.user.sub, action: 'AUDIO_ASSET_GENERATED',
        entityType: 'audioAsset', entityId: asset.id, metadata: { name, voice, accent },
      })

      return sendSuccess(reply, asset, 201)
    } catch (err: any) {
      server.log.error(err, 'OpenAI TTS generation failed')
      const msg = err?.error?.error?.message ?? err?.message ?? 'Unknown error'
      return sendError(reply, 502, `Audio generation failed: ${msg}`)
    }
  })

  // POST /api/audio-assets/upload — upload an audio file (admin)
  server.post('/upload', { preHandler: canEdit }, async (request, reply) => {
    const data = await request.file()
    if (!data) return sendError(reply, 400, 'No file uploaded')
    if (!UPLOAD_MIME_ALLOWLIST.includes(data.mimetype)) {
      return sendError(reply, 400, `Unsupported file type: ${data.mimetype}`)
    }

    const name = (data.fields?.name as any)?.value ?? data.filename ?? 'Uploaded audio'
    const playLimitRaw = (data.fields?.playLimit as any)?.value
    const playLimit = playLimitRaw ? Math.max(0, parseInt(playLimitRaw) || 0) : 0

    const ext = UPLOAD_MIME_TO_EXT[data.mimetype]
    const filename = `${randomUUID()}.${ext}`
    const filePath = join(UPLOADS_DIR, 'audio-assets', filename)
    await pipeline(data.file, createWriteStream(filePath))

    const asset = await prisma.audioAsset.create({
      data: {
        name: String(name), url: `/uploads/audio-assets/${filename}`, sourceType: 'UPLOADED',
        playLimit, tenantId: request.user.tenantId,
      },
    })

    logAudit({
      tenantId: request.user.tenantId, userId: request.user.sub, action: 'AUDIO_ASSET_UPLOADED',
      entityType: 'audioAsset', entityId: asset.id, metadata: { name: String(name) },
    })

    return sendSuccess(reply, asset, 201)
  })

  // GET /api/audio-assets/:id/media — stream an audio asset (admin, tenant-scoped)
  server.get('/:id/media', { preHandler: canView }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const asset = await prisma.audioAsset.findFirst({
      where: { id, tenantId: request.user.tenantId },
    })
    if (!asset) return sendError(reply, 404, 'Audio asset not found')

    const filePath = join(UPLOADS_DIR, asset.url.replace(/^\/uploads\//, ''))
    if (!existsSync(filePath)) return sendError(reply, 404, 'File missing from disk')

    const mime = AUDIO_MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
    return reply.type(mime).send(createReadStream(filePath))
  })

  // DELETE /api/audio-assets/:id — remove an asset (admin, tenant-scoped)
  server.delete('/:id', { preHandler: canEdit }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const asset = await prisma.audioAsset.findFirst({
      where: { id, tenantId: request.user.tenantId },
      include: { _count: { select: { questions: true } } },
    })
    if (!asset) return sendError(reply, 404, 'Audio asset not found')
    if (asset._count.questions > 0) {
      return sendError(reply, 409, `Cannot delete — this audio is used by ${asset._count.questions} question(s). Detach it first.`)
    }

    await prisma.audioAsset.delete({ where: { id } })
    logAudit({
      tenantId: request.user.tenantId, userId: request.user.sub, action: 'AUDIO_ASSET_DELETED',
      entityType: 'audioAsset', entityId: id, metadata: { name: asset.name },
    })
    return sendSuccess(reply, { deleted: true })
  })
}
