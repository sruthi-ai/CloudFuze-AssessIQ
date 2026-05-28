import { mkdirSync } from 'fs'
import { join } from 'path'

export const UPLOADS_DIR = process.env.UPLOADS_DIR ?? join(process.cwd(), 'uploads')

export function initUploads(): void {
  mkdirSync(join(UPLOADS_DIR, 'snapshots'), { recursive: true })
  mkdirSync(join(UPLOADS_DIR, 'recordings'), { recursive: true })
  mkdirSync(join(UPLOADS_DIR, 'room-scans'), { recursive: true })
  mkdirSync(join(UPLOADS_DIR, 'id-photos'), { recursive: true })
  mkdirSync(join(UPLOADS_DIR, 'screen-snapshots'), { recursive: true })
  mkdirSync(join(UPLOADS_DIR, 'secure-browser-installers'), { recursive: true })
}
