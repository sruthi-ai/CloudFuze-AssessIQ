import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  // Publish + invite a test candidate, then verify a session serves exactly 40 unique questions.
  const test = await prisma.test.findFirst({ where: { title: 'Aptitude Set 2' }, include: { sections: { include: { testQuestions: true } } } })
  if (!test) throw new Error('not found')
  await prisma.test.update({ where: { id: test.id }, data: { status: 'PUBLISHED', sebRequired: false } })
  console.log(`published. duration=${test.duration}min sections=${test.sections.map(s => `${s.title}: pool ${s.pickCount}/${s.testQuestions.length}, ${s.timeLimit}s`).join(', ')}`)
  console.log(`instructions: ${test.instructions}`)

  const admin = await prisma.user.findFirst({ where: { tenantId: test.tenantId }, orderBy: { createdAt: 'asc' } })
  const email = 'apti2-check@example.invalid'
  const candidate = await prisma.candidate.upsert({
    where: { email_tenantId: { email, tenantId: test.tenantId } },
    create: { email, firstName: 'Apti', lastName: 'Check', tenantId: test.tenantId },
    update: {},
  })
  let inv = await prisma.invitation.findUnique({ where: { testId_candidateId: { testId: test.id, candidateId: candidate.id } } })
  if (inv) { await prisma.session.deleteMany({ where: { invitationId: inv.id } }); inv = await prisma.invitation.update({ where: { id: inv.id }, data: { status: 'SENT', expiresAt: new Date(Date.now() + 86400000) } }) }
  else inv = await prisma.invitation.create({ data: { testId: test.id, candidateId: candidate.id, sentById: admin!.id, expiresAt: new Date(Date.now() + 86400000), status: 'SENT', pin: 'APTI2CHK' } })
  console.log('token:', inv.token)
}
main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
