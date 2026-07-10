import { FastifyInstance } from 'fastify'
import { createReadStream, existsSync, statSync } from 'fs'
import { join } from 'path'
import { sendError } from '../utils/errors'
import { UPLOADS_DIR } from '../uploads'
import { prisma } from '../db'

const INSTALLER_DIR = join(UPLOADS_DIR, 'secure-browser-installers')
const SEB_CONFIG_DIR = join(UPLOADS_DIR, 'seb-configs')

const PLATFORM_FILES: Record<string, { filename: string }> = {
  windows: { filename: 'AssessIQ-Secure-Browser-Setup.exe' },
  mac:     { filename: 'AssessIQ-Secure-Browser.dmg' },
  linux:   { filename: 'AssessIQ-Secure-Browser.deb' },
}

const FRONTEND_URL = (process.env.FRONTEND_URL ?? 'https://neutaraassessment.cftools.live').replace(/\/$/, '')

const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Minimal, unencrypted SEB config (XML plist). SEB fills the rest with defaults.
// sendBrowserExamKey=true makes SEB attach the Config/Request hash headers the
// backend verifies. allowQuit=true so a candidate is never trapped.
function buildSebConfig(startUrl: string, quitUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>startURL</key><string>${xmlEscape(startUrl)}</string>
  <key>sendBrowserExamKey</key><true/>
  <key>quitURL</key><string>${xmlEscape(quitUrl)}</string>
  <key>allowQuit</key><true/>
  <key>allowReload</key><true/>
  <key>showReloadButton</key><true/>
  <key>allowSpellCheck</key><false/>
  <key>enableJavaScript</key><true/>
  <key>browserWindowAllowReload</key><true/>
</dict>
</plist>
`
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

  // GET /api/downloads/seb/:token — the .seb config a candidate opens to launch
  // Safe Exam Browser locked to their exam. Serves the admin-uploaded config if
  // present, otherwise a generated minimal one. Public (token-scoped).
  server.get('/seb/:token', async (request, reply) => {
    const { token } = request.params as { token: string }
    const invitation = await prisma.invitation.findUnique({
      where: { token },
      select: { test: { select: { title: true, sebConfigFileUrl: true } } },
    })
    if (!invitation) return sendError(reply, 404, 'Invalid invitation')

    reply
      .header('Content-Type', 'application/seb')
      .header('Content-Disposition', 'attachment; filename="exam.seb"')

    // Admin-uploaded config (its keys match what they pasted for verification)
    const uploaded = invitation.test.sebConfigFileUrl
    if (uploaded) {
      const filePath = join(SEB_CONFIG_DIR, uploaded.replace(/^.*[\\/]/, ''))
      if (existsSync(filePath)) {
        reply.header('Content-Length', statSync(filePath).size)
        return reply.send(createReadStream(filePath))
      }
    }

    // Fallback: generate one on the fly. Start on the PIN entry page so the
    // candidate logs in with their unique PIN inside SEB (the same config can be
    // handed to a whole batch — the PIN is the per-candidate credential).
    const startUrl = `${FRONTEND_URL}/secure-browser/start`
    const quitUrl = `${FRONTEND_URL}/take/${token}/done`
    return reply.send(buildSebConfig(startUrl, quitUrl))
  })
}
