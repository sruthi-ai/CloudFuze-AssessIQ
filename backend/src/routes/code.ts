import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { sendError, sendSuccess } from '../utils/errors'
import { JUDGE0_KEY, LANG_ID, runCode } from '../utils/judge0'
import { runTestsForCandidate } from '../services/codeGrading'

const runSchema = z.object({
  code: z.string().min(1),
  language: z.string(),
  stdin: z.string().optional(),
})

const runTestsSchema = z.object({
  code: z.string().min(1),
  language: z.string(),
  questionId: z.string(),
  token: z.string(),
  sessionId: z.string(),
})

export async function codeRoutes(server: FastifyInstance) {
  // POST /api/code/run — free-form execution (no test cases)
  server.post('/run', async (request, reply) => {
    const result = runSchema.safeParse(request.body)
    if (!result.success) return sendError(reply, 400, 'Validation error', result.error.flatten())

    const { code, language, stdin } = result.data
    const languageId = LANG_ID[language]
    if (!languageId) return sendError(reply, 400, `Unsupported language: ${language}`)

    if (!JUDGE0_KEY) {
      return sendSuccess(reply, mockExecute(code, language))
    }

    try {
      const res = await runCode(code, languageId, stdin ?? '')
      return sendSuccess(reply, {
        stdout: res.stdout,
        stderr: res.stderr,
        status: res.status,
        time: res.time,
        memory: res.memory,
      })
    } catch (err: any) {
      server.log.error(err, 'Judge0 fetch failed')
      return sendError(reply, 502, 'Code execution service unavailable')
    }
  })

  // POST /api/code/run-tests — run code against question's test cases (candidate-facing)
  server.post('/run-tests', async (request, reply) => {
    const result = runTestsSchema.safeParse(request.body)
    if (!result.success) return sendError(reply, 400, 'Validation error', result.error.flatten())

    const { code, language, questionId, token, sessionId } = result.data

    // Validate session
    const session = await prisma.session.findFirst({
      where: { id: sessionId, invitation: { token }, status: 'IN_PROGRESS' },
    })
    if (!session) return sendError(reply, 403, 'Invalid or expired session')

    if (session.timeoutAt && session.timeoutAt < new Date()) {
      return sendError(reply, 410, 'Session has timed out')
    }

    const gradeResult = await runTestsForCandidate(code, language, questionId)

    return sendSuccess(reply, gradeResult)
  })

  // GET /api/code/languages — list supported languages
  server.get('/languages', async (_request, reply) => {
    return sendSuccess(reply, Object.keys(LANG_ID).map(name => ({ name, id: LANG_ID[name] })))
  })
}

function mockExecute(code: string, language: string) {
  if (language === 'python') {
    const printMatches = [...code.matchAll(/print\(["'](.+?)["']\)/g)]
    const stdout = printMatches.map(m => m[1]).join('\n')
    return { stdout: stdout || null, stderr: null, status: 'Accepted (mock)', time: '0.01', memory: 1024 }
  }
  if (language === 'javascript') {
    const logMatches = [...code.matchAll(/console\.log\(["'](.+?)["']\)/g)]
    const stdout = logMatches.map(m => m[1]).join('\n')
    return { stdout: stdout || null, stderr: null, status: 'Accepted (mock)', time: '0.01', memory: 1024 }
  }
  return {
    stdout: null,
    stderr: null,
    status: 'Mock mode — set JUDGE0_API_KEY for real execution',
    time: null,
    memory: null,
  }
}
