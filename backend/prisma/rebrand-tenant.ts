/**
 * Rename/rebrand a tenant + its admin login. Values come from env so no real
 * credential is committed. Run on any environment (e.g. inside the container).
 *
 *   docker exec \
 *     -e OLD_SLUG=<current-slug> \
 *     -e NEW_NAME="<Your Company>" \
 *     -e NEW_SLUG=<new-slug> \
 *     -e OLD_EMAIL=<current-admin-email> \
 *     -e NEW_EMAIL=<new-admin-email> \
 *     -e NEW_PASSWORD='<new-strong-password>' \
 *     -e NEW_LOGO_URL='https://…/logo.png' \
 *     -w /app neutaraassessment-backend-1 npx tsx prisma/rebrand-tenant.ts
 *
 * Do NOT paste real credentials into this file — pass them only via the shell.
 *
 * Only the vars you set are applied; the rest are left unchanged. Idempotent.
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const OLD_SLUG = process.env.OLD_SLUG || 'demo-company'
  const { NEW_NAME, NEW_SLUG, OLD_EMAIL, NEW_EMAIL, NEW_PASSWORD, NEW_LOGO_URL } = process.env

  const tenant = await prisma.tenant.findUnique({ where: { slug: OLD_SLUG } })
    ?? (NEW_SLUG ? await prisma.tenant.findUnique({ where: { slug: NEW_SLUG } }) : null)
  if (!tenant) throw new Error(`No tenant with slug "${OLD_SLUG}"${process.env.NEW_SLUG ? ` or "${NEW_SLUG}"` : ''}.`)

  const tenantData: Record<string, unknown> = {}
  if (NEW_NAME) tenantData.name = NEW_NAME
  if (NEW_SLUG) tenantData.slug = NEW_SLUG
  if (NEW_LOGO_URL) tenantData.logoUrl = NEW_LOGO_URL
  if (Object.keys(tenantData).length) await prisma.tenant.update({ where: { id: tenant.id }, data: tenantData })

  // Admin user: find by OLD_EMAIL (or NEW_EMAIL if already renamed), scoped to the tenant.
  const admin =
    (OLD_EMAIL && await prisma.user.findFirst({ where: { tenantId: tenant.id, email: OLD_EMAIL } })) ||
    (NEW_EMAIL && await prisma.user.findFirst({ where: { tenantId: tenant.id, email: NEW_EMAIL } })) ||
    (await prisma.user.findFirst({ where: { tenantId: tenant.id, role: { in: ['SUPER_ADMIN', 'COMPANY_ADMIN'] } }, orderBy: { createdAt: 'asc' } }))
  if (admin) {
    const userData: Record<string, unknown> = {}
    if (NEW_EMAIL) userData.email = NEW_EMAIL
    if (NEW_PASSWORD) userData.passwordHash = await bcrypt.hash(NEW_PASSWORD, 12)
    if (Object.keys(userData).length) await prisma.user.update({ where: { id: admin.id }, data: userData })
  }

  const t2 = await prisma.tenant.findUnique({ where: { id: tenant.id } })
  console.log(`✅ Tenant: "${t2?.name}"  slug: ${t2?.slug}  logo: ${t2?.logoUrl ?? '(none)'}`)
  console.log(`✅ Admin email: ${NEW_EMAIL || admin?.email}${NEW_PASSWORD ? '  (password updated)' : ''}`)
}

main().catch(e => { console.error('❌ Rebrand failed:', e); process.exit(1) }).finally(() => prisma.$disconnect())
