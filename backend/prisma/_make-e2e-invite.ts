import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const test = await prisma.test.findFirst({ where: { title: 'Freshers Assessment 1' }, include: { sections: true } })
  if (!test) throw new Error('Freshers Assessment 1 not found — run import-freshers.ts first.')
  if (test.status !== 'PUBLISHED') {
    await prisma.test.update({ where: { id: test.id }, data: { status: 'PUBLISHED', sebRequired: false } })
    console.log('Published test and disabled sebRequired for local browser testing.')
  } else if (test.sebRequired) {
    await prisma.test.update({ where: { id: test.id }, data: { sebRequired: false } })
    console.log('Disabled sebRequired for local browser testing (SEB not installed on this machine).')
  }
  console.log('Sections:', test.sections.map(s => `${s.title} (timeLimit=${s.timeLimit}s, audioAssetId=${s.audioAssetId})`).join(' | '))

  const admin = await prisma.user.findFirst({ where: { tenantId: test.tenantId }, orderBy: { createdAt: 'asc' } })
  const email = 'e2e-browser-test@example.invalid'
  const candidate = await prisma.candidate.upsert({
    where: { email_tenantId: { email, tenantId: test.tenantId } },
    create: { email, firstName: 'E2E', lastName: 'BrowserTest', tenantId: test.tenantId },
    update: {},
  })
  let invitation = await prisma.invitation.findUnique({ where: { testId_candidateId: { testId: test.id, candidateId: candidate.id } } })
  if (invitation) {
    await prisma.session.deleteMany({ where: { invitationId: invitation.id } })
    invitation = await prisma.invitation.update({ where: { id: invitation.id }, data: { status: 'SENT', expiresAt: new Date(Date.now() + 86400000) } })
  } else {
    invitation = await prisma.invitation.create({
      data: { testId: test.id, candidateId: candidate.id, sentById: admin!.id, expiresAt: new Date(Date.now() + 86400000), status: 'SENT', pin: 'E2ETEST1' },
    })
  }
  console.log('TOKEN:', invitation.token)
  console.log('URL: http://localhost:5180/take/' + invitation.token)
}
main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
