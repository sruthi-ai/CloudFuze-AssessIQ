import { prisma } from '../db'

interface GradeResult {
  pointsEarned: number
  feedback: string
  confidence: number
}

export async function aiGradeSession(sessionId: string): Promise<{ graded: number; skipped: number }> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      answers: {
        where: { gradingStatus: 'PENDING' },
        include: {
          question: {
            include: {
              testQuestions: { where: { testId: { not: undefined } }, take: 1 },
            },
          },
        },
      },
      test: { select: { id: true } },
    },
  })

  if (!session) return { graded: 0, skipped: 0 }

  const apiKey = process.env.OPENAI_API_KEY
  let graded = 0
  let skipped = 0

  for (const answer of session.answers) {
    const q = answer.question
    if (!['ESSAY', 'SHORT_ANSWER'].includes(q.type)) {
      skipped++
      continue
    }

    const text = answer.responseText
    if (!text?.trim()) {
      await prisma.answer.update({
        where: { id: answer.id },
        data: { gradingStatus: 'AI_GRADED', pointsEarned: 0, feedback: 'No response provided.', gradedAt: new Date() },
      })
      graded++
      continue
    }

    const maxPoints = q.points

    let result: GradeResult
    if (apiKey) {
      result = await callOpenAI(q.title, q.body, text, maxPoints, apiKey)
    } else {
      result = heuristicGrade(text, maxPoints)
    }

    await prisma.answer.update({
      where: { id: answer.id },
      data: {
        gradingStatus: 'AI_GRADED',
        pointsEarned: result.pointsEarned,
        feedback: result.feedback,
        gradedAt: new Date(),
      },
    })
    graded++
  }

  // Recalculate score if answers were graded
  if (graded > 0) {
    const { scoreSession } = await import('./scoring')
    await scoreSession(sessionId)
  }

  return { graded, skipped }
}

async function callOpenAI(
  title: string,
  body: string,
  response: string,
  maxPoints: number,
  apiKey: string
): Promise<GradeResult> {
  const prompt = `You are an impartial exam grader. Grade the following student response.

Question: ${title}
${body}

Student Response:
${response}

Maximum points: ${maxPoints}

Respond with valid JSON only:
{
  "pointsEarned": <number between 0 and ${maxPoints}>,
  "feedback": "<2-3 sentence constructive feedback>",
  "confidence": <0.0-1.0>
}`

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 300,
    }),
  })

  if (!res.ok) throw new Error(`OpenAI error: ${res.status}`)

  const data = await res.json() as any
  const content = data.choices?.[0]?.message?.content ?? '{}'
  const parsed = JSON.parse(content.replace(/```json|```/g, '').trim())

  return {
    pointsEarned: Math.min(maxPoints, Math.max(0, Number(parsed.pointsEarned) || 0)),
    feedback: String(parsed.feedback || 'Graded by AI.'),
    confidence: Number(parsed.confidence ?? 0.8),
  }
}

// Simple heuristic grading when no OpenAI key is set
function heuristicGrade(text: string, maxPoints: number): GradeResult {
  const wordCount = text.trim().split(/\s+/).length
  let ratio = 0

  if (wordCount >= 100) ratio = 0.9
  else if (wordCount >= 50) ratio = 0.7
  else if (wordCount >= 20) ratio = 0.5
  else if (wordCount >= 5) ratio = 0.3
  else ratio = 0.1

  return {
    pointsEarned: Math.round(maxPoints * ratio * 10) / 10,
    feedback: `Heuristic grade based on response length (${wordCount} words). Set OPENAI_API_KEY for AI grading.`,
    confidence: 0.4,
  }
}
