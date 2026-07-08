/**
 * Import content + auth data exported from another environment (prisma/seed-data.json).
 *
 * Usage on the server (from the backend working dir, e.g. inside the container):
 *   npx tsx prisma/import-data.ts
 *
 * It upserts every row by id, so it is safe to run on an empty DB or one that
 * already has the demo seed — it will not create duplicates. It only touches the
 * content + auth tables that were exported; sessions, answers, proctoring events,
 * candidates, invitations and tokens are left untouched.
 */
import { PrismaClient } from '@prisma/client'
import { readFileSync, copyFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const prisma = new PrismaClient()

// FK-safe order — parents before children.
const ORDER = [
  'tenant', 'user', 'questionBank', 'audioAsset', 'question',
  'questionOption', 'codeTestCase', 'test', 'testSection', 'testQuestion',
] as const

// Matches ISO-8601 timestamps that JSON.stringify produced from Date fields.
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

// Revive top-level DateTime columns back into Date objects. JSON columns are
// objects at the top level, so they are never matched here (only strings are).
function revive(row: Record<string, unknown>): Record<string, unknown> {
  const r: Record<string, unknown> = { ...row }
  for (const k of Object.keys(r)) {
    const v = r[k]
    if (typeof v === 'string' && ISO.test(v)) r[k] = new Date(v)
  }
  return r
}

// Copy bundled media (Listening clips, etc.) into the live uploads dir so the
// AudioAsset.url paths resolve. UPLOADS_DIR matches the app's own resolution
// (env in prod = /app/uploads; falls back to <cwd>/uploads locally).
function copyMedia() {
  const src = join(process.cwd(), 'prisma', 'seed-media')
  if (!existsSync(src)) { console.log('• no prisma/seed-media — skipping media copy'); return }
  const uploadsDir = process.env.UPLOADS_DIR ?? join(process.cwd(), 'uploads')
  let n = 0
  for (const sub of readdirSync(src)) {
    const subSrc = join(src, sub)
    const subDst = join(uploadsDir, sub)
    mkdirSync(subDst, { recursive: true })
    for (const f of readdirSync(subSrc)) {
      copyFileSync(join(subSrc, f), join(subDst, f))
      n++
    }
  }
  console.log(`✔ media: ${n} file(s) copied into ${uploadsDir}`)
}

async function main() {
  const file = join(process.cwd(), 'prisma', 'seed-data.json')
  const data = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record<string, unknown>[]>

  for (const table of ORDER) {
    const rows = data[table] ?? []
    let n = 0
    for (const raw of rows) {
      const row = revive(raw)
      await (prisma as any)[table].upsert({
        where: { id: row.id },
        create: row,
        update: row,
      })
      n++
    }
    console.log(`✔ ${table}: ${n} upserted`)
  }

  copyMedia()
  console.log('✅ Import complete.')
}

main()
  .catch(e => { console.error('❌ Import failed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
