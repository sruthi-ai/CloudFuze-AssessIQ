import { prisma } from '../db'

export async function scoreSession(sessionId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      test: {
        include: {
          sections: {
            include: {
              testQuestions: {
                include: {
                  question: { include: { options: true } },
                },
              },
            },
          },
        },
      },
      answers: true,
    },
  })

  if (!session) return null

  const answerMap = new Map(session.answers.map(a => [a.questionId, a]))
  let totalPoints = 0
  let earnedPoints = 0
  const sectionBreakdown: Record<string, { earned: number; total: number }> = {}

  for (const section of session.test.sections) {
    let sectionEarned = 0
    let sectionTotal = 0

    for (const tq of section.testQuestions) {
      const q = tq.question
      const maxPoints = tq.points ?? q.points
      totalPoints += maxPoints
      sectionTotal += maxPoints

      const answer = answerMap.get(q.id)
      if (!answer) continue

      let pointsEarned = 0
      let gradingStatus: 'AUTO_GRADED' | 'PENDING' = 'AUTO_GRADED'

      switch (q.type) {
        case 'MCQ_SINGLE':
        case 'TRUE_FALSE': {
          const correctOption = q.options.find(o => o.isCorrect)
          const selected = (answer.selectedOptions as unknown as string[]) ?? []
          if (correctOption && selected.includes(correctOption.id)) {
            pointsEarned = maxPoints
          }
          break
        }

        case 'MCQ_MULTI': {
          const correctIds = new Set(q.options.filter(o => o.isCorrect).map(o => o.id))
          const selectedIds = new Set((answer.selectedOptions as unknown as string[]) ?? [])
          if (correctIds.size > 0) {
            const correctSelected = [...selectedIds].filter(id => correctIds.has(id)).length
            const incorrectSelected = [...selectedIds].filter(id => !correctIds.has(id)).length
            // Partial credit: correct/(total correct) minus penalty for wrong
            const raw = (correctSelected / correctIds.size) - (incorrectSelected / correctIds.size)
            pointsEarned = Math.max(0, raw) * maxPoints
          }
          break
        }

        case 'NUMERICAL': {
          const correctOption = q.options.find(o => o.isCorrect)
          if (correctOption && answer.numericValue !== null && answer.numericValue !== undefined) {
            const expected = parseFloat(correctOption.text)
            if (!isNaN(expected) && Math.abs(answer.numericValue - expected) < 0.001) {
              pointsEarned = maxPoints
            }
          }
          break
        }

        case 'RANKING': {
          const correctOrder = q.options.filter(o => o.isCorrect).sort((a, b) => a.order - b.order).map(o => o.id)
          const selectedOrder = (answer.selectedOptions as unknown as string[]) ?? []
          if (correctOrder.length > 0) {
            pointsEarned = scoreRanking(selectedOrder, correctOrder, maxPoints)
          } else {
            // No correct order defined — partial credit based on any answer given
            pointsEarned = selectedOrder.length > 0 ? maxPoints * 0.5 : 0
          }
          break
        }

        case 'CODE': {
          // Auto-grade if question has test cases, otherwise leave for AI/human
          if (answer.codeSubmission && answer.language) {
            try {
              const { gradeCode } = await import('./codeGrading')
              const { results, pointsEarned: codePoints, totalPoints: codeTotalPoints, hasTestCases } =
                await gradeCode(answer.codeSubmission, answer.language, q.id)
              if (hasTestCases && codeTotalPoints > 0) {
                pointsEarned = (codePoints / codeTotalPoints) * maxPoints
                gradingStatus = 'AUTO_GRADED'
                // Store test results in answer for later display
                await prisma.answer.update({
                  where: { id: answer.id },
                  data: { codeTestResults: results as any },
                })
              } else {
                gradingStatus = 'PENDING'
              }
            } catch {
              gradingStatus = 'PENDING'
            }
          } else {
            gradingStatus = 'PENDING'
          }
          break
        }

        case 'ESSAY':
        case 'SHORT_ANSWER':
        case 'FILE_UPLOAD':
        case 'AUDIO_RECORDING':
          gradingStatus = 'PENDING'
          break

        default:
          gradingStatus = 'PENDING'
      }

      earnedPoints += pointsEarned
      sectionEarned += pointsEarned

      await prisma.answer.update({
        where: { id: answer.id },
        data: { pointsEarned, gradingStatus },
      })
    }

    sectionBreakdown[section.id] = { earned: sectionEarned, total: sectionTotal }
  }

  const percentage = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0
  const passingScore = session.test.passingScore ?? 0
  const passed = passingScore > 0 ? percentage >= passingScore : null

  const score = await prisma.score.upsert({
    where: { sessionId },
    create: { sessionId, totalPoints, earnedPoints, percentage, passed, sectionBreakdown },
    update: { totalPoints, earnedPoints, percentage, passed, sectionBreakdown },
  })

  // Calculate percentile among all completed sessions for this test
  await recalculatePercentiles(session.testId)

  return score
}

export async function recalculatePercentiles(testId: string) {
  const scores = await prisma.score.findMany({
    where: { session: { testId, status: { in: ['SUBMITTED', 'TIMED_OUT'] } } },
    select: { id: true, sessionId: true, percentage: true },
    orderBy: { percentage: 'asc' },
  })

  if (scores.length === 0) return

  await prisma.$transaction(
    scores.map((s, idx) => {
      const percentile = Math.round((idx / scores.length) * 100)
      return prisma.score.update({ where: { id: s.id }, data: { percentile } })
    })
  )
}

// RANKING question scoring: award points based on how close the order is to the correct order
export function scoreRanking(selectedOrder: string[], correctOrder: string[], maxPoints: number): number {
  if (correctOrder.length === 0) return 0
  let correctPairs = 0
  let totalPairs = 0
  for (let i = 0; i < correctOrder.length; i++) {
    for (let j = i + 1; j < correctOrder.length; j++) {
      totalPairs++
      const selI = selectedOrder.indexOf(correctOrder[i])
      const selJ = selectedOrder.indexOf(correctOrder[j])
      if (selI !== -1 && selJ !== -1 && selI < selJ) correctPairs++
    }
  }
  return totalPairs > 0 ? (correctPairs / totalPairs) * maxPoints : 0
}
