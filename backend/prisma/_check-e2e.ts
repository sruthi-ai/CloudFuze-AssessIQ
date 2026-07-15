import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const session = await prisma.session.findFirst({
    where: { invitation: { candidate: { email: 'e2e-browser-test@example.invalid' } } },
    include: { answers: { include: { question: { select: { title: true, type: true } } } } },
    orderBy: { startedAt: 'desc' },
  })
  if (!session) { console.log('no session yet'); return }
  console.log('session status:', session.status)
  for (const a of session.answers) {
    console.log(`- ${a.question.title} [${a.question.type}] audioUrl=${a.audioUrl ?? '(none)'} updatedAt=${a.updatedAt.toISOString()}`)
  }
}
main().finally(() => prisma.$disconnect())
