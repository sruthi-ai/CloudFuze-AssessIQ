/**
 * Import "Freshers Assessment 1" (bank + 155 questions + test + 5 sections + audio)
 * onto any environment. Safe to run on production.
 *
 * Usage (from the backend working dir, e.g. inside the container):
 *   npx tsx prisma/import-freshers.ts
 *
 * It looks up the target tenant + an admin user on THIS server and remaps the
 * bank/test ownership to them, so it works regardless of local vs prod IDs.
 * Upserts by id, so re-running is safe (no duplicates). Also copies the bundled
 * Listening audio into the uploads dir.
 */
import { PrismaClient } from '@prisma/client'
import { readFileSync, copyFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const prisma = new PrismaClient()
const TENANT_SLUG = process.env.SEED_TENANT_SLUG || 'demo-company'

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
function revive(row: Record<string, unknown>): Record<string, unknown> {
  const r: Record<string, unknown> = { ...row }
  for (const k of Object.keys(r)) {
    const v = r[k]
    if (typeof v === 'string' && ISO.test(v)) r[k] = new Date(v)
  }
  return r
}

async function upsert(model: string, row: Record<string, unknown>) {
  await (prisma as any)[model].upsert({ where: { id: row.id }, create: row, update: row })
}

function copyMedia() {
  const src = join(process.cwd(), 'prisma', 'seed-media')
  if (!existsSync(src)) return
  const uploadsDir = process.env.UPLOADS_DIR ?? join(process.cwd(), 'uploads')
  let n = 0
  for (const sub of readdirSync(src)) {
    const subSrc = join(src, sub), subDst = join(uploadsDir, sub)
    mkdirSync(subDst, { recursive: true })
    for (const f of readdirSync(subSrc)) { copyFileSync(join(subSrc, f), join(subDst, f)); n++ }
  }
  console.log(`✔ media: ${n} file(s) copied into ${uploadsDir}`)
}

async function main() {
  const data = JSON.parse(readFileSync(join(process.cwd(), 'prisma', 'freshers-assessment-1.json'), 'utf8'))

  // Resolve THIS server's tenant + an admin user to own the imported content.
  const tenant = (await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } }))
    ?? (await prisma.tenant.findFirst({ orderBy: { createdAt: 'asc' } }))
  if (!tenant) throw new Error('No tenant found on this server — seed the DB first.')
  const admin = await prisma.user.findFirst({
    where: { tenantId: tenant.id, role: { in: ['SUPER_ADMIN', 'COMPANY_ADMIN'] } },
    orderBy: { createdAt: 'asc' },
  })
  if (!admin) throw new Error(`No admin user found for tenant ${tenant.slug}.`)
  console.log(`→ Target tenant: ${tenant.slug} (${tenant.id}); owner: ${admin.email}`)

  // Parents first, remapping ownership to this server's tenant/admin.
  await upsert('questionBank', { ...revive(data.bank), tenantId: tenant.id })
  for (const a of data.audioAssets) await upsert('audioAsset', { ...revive(a), tenantId: tenant.id })
  for (const q of data.questions) await upsert('question', revive(q))
  for (const o of data.options) await upsert('questionOption', revive(o))
  await upsert('test', { ...revive(data.test), tenantId: tenant.id, createdById: admin.id })
  for (const s of data.sections) await upsert('testSection', revive(s))
  for (const tq of data.testQuestions) await upsert('testQuestion', revive(tq))

  copyMedia()
  console.log(`✅ Imported "Freshers Assessment 1": ${data.questions.length} questions, ${data.sections.length} sections. Publish it, then invite candidates.`)
}

main()
  .catch(e => { console.error('❌ Import failed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
