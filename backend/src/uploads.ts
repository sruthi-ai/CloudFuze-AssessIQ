import { mkdirSync } from 'fs'
import { join } from 'path'

export const UPLOADS_DIR = process.env.UPLOADS_DIR ?? join(process.cwd(), 'uploads')

export function initUploads(): void {
  mkdirSync(join(UPLOADS_DIR, 'snapshots'), { recursive: true })
  mkdirSync(join(UPLOADS_DIR, 'recordings'), { recursive: true })
}
