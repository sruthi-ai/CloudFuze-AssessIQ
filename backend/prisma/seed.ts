import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  const passwordHash = await bcrypt.hash('Password123!', 12)

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo-company' },
    update: {},
    create: {
      name: 'Demo Company',
      slug: 'demo-company',
      plan: 'PRO',
      users: {
        create: {
          email: 'admin@demo.com',
          passwordHash,
          firstName: 'Admin',
          lastName: 'User',
          role: 'COMPANY_ADMIN',
        },
      },
      questionBanks: {
        create: {
          name: 'Default Question Bank',
          isDefault: true,
        },
      },
    },
    include: { users: true, questionBanks: true },
  })

  console.log(`Created tenant: ${tenant.name}`)
  console.log(`Admin login: admin@demo.com / Password123! (tenant slug: demo-company)`)

  // Seed some sample questions
  const bank = tenant.questionBanks[0]
  if (bank) {
    await prisma.question.createMany({
      data: [
        {
          type: 'MCQ_SINGLE',
          title: 'JavaScript Closures',
          body: 'What is a closure in JavaScript?',
          difficulty: 'MEDIUM',
          points: 1,
          domain: 'Software Engineering',
          tags: ['javascript', 'closures', 'fundamentals'],
          bankId: bank.id,
        },
        {
          type: 'TRUE_FALSE',
          title: 'React Re-renders',
          body: 'React always re-renders the entire DOM when state changes.',
          difficulty: 'EASY',
          points: 1,
          domain: 'Software Engineering',
          tags: ['react', 'performance'],
          bankId: bank.id,
        },
        {
          type: 'ESSAY',
          title: 'System Design',
          body: 'Describe how you would design a URL shortener service. Include considerations for scalability, availability, and data storage.',
          difficulty: 'HARD',
          points: 10,
          domain: 'Software Engineering',
          tags: ['system-design', 'scalability'],
          bankId: bank.id,
        },
      ],
      skipDuplicates: true,
    })

    // Add options to the MCQ
    const mcq = await prisma.question.findFirst({ where: { bankId: bank.id, type: 'MCQ_SINGLE' } })
    if (mcq) {
      await prisma.questionOption.createMany({
        data: [
          { questionId: mcq.id, text: 'A function that remembers the variables from its outer scope', isCorrect: true, order: 0 },
          { questionId: mcq.id, text: 'A function that runs automatically on page load', isCorrect: false, order: 1 },
          { questionId: mcq.id, text: 'A way to import modules in JavaScript', isCorrect: false, order: 2 },
          { questionId: mcq.id, text: 'An async function that returns a Promise', isCorrect: false, order: 3 },
        ],
        skipDuplicates: true,
      })
    }

    // Add options to True/False
    const tf = await prisma.question.findFirst({ where: { bankId: bank.id, type: 'TRUE_FALSE' } })
    if (tf) {
      await prisma.questionOption.createMany({
        data: [
          { questionId: tf.id, text: 'True', isCorrect: false, order: 0 },
          { questionId: tf.id, text: 'False', isCorrect: true, order: 1 },
        ],
        skipDuplicates: true,
      })
    }
  }

  console.log('Seed complete.')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
