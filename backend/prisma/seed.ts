import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // Real admin password is set via env (kept out of git); fallback only for fresh dev.
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe@2026'
  const passwordHash = await bcrypt.hash(adminPassword, 12)

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'neutara-assessments' },
    // Keep the logo pinned on re-seeds too — candidate pages fall back to a
    // letter avatar when logoUrl is unset. The file ships in frontend/public.
    update: { logoUrl: '/neutara-logo.png' },
    create: {
      name: 'Neutara Technologies Pvt Ltd',
      slug: 'neutara-assessments',
      logoUrl: '/neutara-logo.png',
      plan: 'PRO',
      users: {
        create: {
          email: 'assessments@neutara.com',
          passwordHash,
          firstName: 'Neutara',
          lastName: 'Admin',
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
  console.log(`Admin login: assessments@neutara.com (tenant slug: neutara-assessments)`)

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
