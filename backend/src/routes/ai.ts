import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import Anthropic from '@anthropic-ai/sdk'
import { sendError, sendSuccess } from '../utils/errors'
import { requireRole } from '../middleware/authenticate'

const generateSchema = z.object({
  topic: z.string().min(10).max(6000),
  count: z.number().int().min(1).max(20).default(10),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD', 'MIXED']).default('MIXED'),
  types: z.array(z.enum(['MCQ_SINGLE', 'MCQ_MULTI', 'TRUE_FALSE', 'SHORT_ANSWER', 'NUMERICAL']))
    .min(1)
    .default(['MCQ_SINGLE']),
})

const TYPE_INSTRUCTIONS: Record<string, string> = {
  MCQ_SINGLE:   'Multiple choice — exactly 4 options, exactly 1 correct',
  MCQ_MULTI:    'Multi-select — 4-5 options, 2-3 correct answers',
  TRUE_FALSE:   'True/False — 2 options exactly: "True" and "False"',
  SHORT_ANSWER: 'Short answer — no options; set correctAnswer to a model answer (1-3 sentences)',
  NUMERICAL:    'Numerical — no options; set correctAnswer to the number as a string (e.g. "42")',
}

export async function aiRoutes(server: FastifyInstance) {
  const canEdit = requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'RECRUITER')

  server.post('/generate-questions', { preHandler: canEdit }, async (request, reply) => {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return sendError(reply, 503, 'AI generation is not configured — add ANTHROPIC_API_KEY to your environment')
    }

    const result = generateSchema.safeParse(request.body)
    if (!result.success) return sendError(reply, 400, 'Validation error', result.error.flatten())

    const { topic, count, difficulty, types } = result.data

    const difficultyInstr = difficulty === 'MIXED'
      ? 'Distribute difficulties roughly: 30% EASY, 50% MEDIUM, 20% HARD'
      : `All questions must be difficulty: "${difficulty}"`

    const typeList = types.map(t => `  - ${t}: ${TYPE_INSTRUCTIONS[t]}`).join('\n')

    const system = `You are an expert assessment designer. Your task is to return ONLY a valid JSON array — no explanation, no markdown fences, just the raw JSON.

Generate exactly ${count} assessment questions.

Question types to use (distribute evenly when multiple are listed):
${typeList}

Difficulty rule: ${difficultyInstr}

Each element of the JSON array must have exactly these fields:
{
  "type": one of the types listed above,
  "title": short title, max 80 characters,
  "body": full question text in markdown (may include code fences for technical questions),
  "difficulty": "EASY" | "MEDIUM" | "HARD",
  "points": integer — EASY→1, MEDIUM→2, HARD→3,
  "explanation": 1-2 sentences explaining the correct answer,
  "options": array of {text, isCorrect} — required for MCQ_SINGLE, MCQ_MULTI, TRUE_FALSE; omit for others,
  "correctAnswer": string — required for SHORT_ANSWER and NUMERICAL; omit for MCQ and TRUE_FALSE
}

Rules:
- MCQ_SINGLE: exactly 4 options, exactly 1 isCorrect=true
- MCQ_MULTI: 4-5 options, 2-3 isCorrect=true
- TRUE_FALSE: exactly [{text:"True",isCorrect:?},{text:"False",isCorrect:?}]
- NUMERICAL correctAnswer must be parseable as a number
- Make questions clear, unambiguous, and professionally worded
- Vary question styles (scenario, definition, application, calculation)
- Return ONLY the JSON array. No other text.`

    try {
      const client = new Anthropic({ apiKey })
      const message = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 8096,
        system,
        messages: [{ role: 'user', content: `Topic / Job Description:\n\n${topic}` }],
      })

      const raw = message.content[0].type === 'text' ? message.content[0].text : ''
      // Strip accidental markdown fences
      const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

      let questions: unknown
      try {
        questions = JSON.parse(clean)
      } catch {
        server.log.error({ raw }, 'Claude returned non-JSON')
        return sendError(reply, 500, 'AI returned an unexpected format — please try again')
      }

      if (!Array.isArray(questions)) {
        return sendError(reply, 500, 'AI returned an unexpected format — please try again')
      }

      return sendSuccess(reply, { questions: (questions as any[]).slice(0, count) })
    } catch (err: any) {
      server.log.error(err, 'Anthropic API error')
      const msg = err?.error?.error?.message ?? err?.message ?? 'Unknown error'
      return sendError(reply, 502, `AI generation failed: ${msg}`)
    }
  })
}
