import { FastifyInstance } from 'fastify'
import { createReadStream, existsSync, statSync } from 'fs'
import { join } from 'path'
import { sendError } from '../utils/errors'
import { UPLOADS_DIR } from '../uploads'

const INSTALLER_DIR = join(UPLOADS_DIR, 'secure-browser-installers')

const PLATFORM_FILES: Record<string, { filename: string }> = {
  windows: { filename: 'AssessIQ-Secure-Browser-Setup.exe' },
  mac:     { filename: 'AssessIQ-Secure-Browser.dmg' },
  linux:   { filename: 'AssessIQ-Secure-Browser.deb' },
}

export async function downloadRoutes(server: FastifyInstance) {
  // GET /api/downloads/secure-browser/:platform  — serve built installer
  // Place built installers in uploads/secure-browser-installers/
  server.get('/secure-browser/:platform', async (request, reply) => {
    const { platform } = request.params as { platform: string }
    const meta = PLATFORM_FILES[platform]
    if (!meta) return sendError(reply, 404, 'Unknown platform. Use: windows, mac, linux')

    const filePath = join(INSTALLER_DIR, meta.filename)
    if (!existsSync(filePath)) {
      return sendError(reply, 503, `Installer for ${platform} is not yet available. Contact your administrator.`)
    }

    const { size } = statSync(filePath)
    reply
      .header('Content-Type', 'application/octet-stream')
      .header('Content-Disposition', `attachment; filename="${meta.filename}"`)
      .header('Content-Length', size)
    return reply.send(createReadStream(filePath))
  })
}
