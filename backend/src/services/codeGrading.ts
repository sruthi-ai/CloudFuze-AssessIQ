import { prisma } from '../db'
import { JUDGE0_KEY, LANG_ID, runCode } from '../utils/judge0'

export interface TestCaseResult {
  caseId: string
  description: string | null
  isHidden: boolean
  passed: boolean
  actualOutput: string | null
  expectedOutput: string | null  // null for hidden cases (candidate-facing)
  status: string
  time: string | null
  memory: number | null
}

export interface GradeResult {
  results: TestCaseResult[]
  passedCount: number
  totalCount: number
  pointsEarned: number
  totalPoints: number
  hasTestCases: boolean
}

// Run code against all test cases for a question (used for auto-grading on submit)
// Returns full expected outputs (internal use only)
export async function gradeCode(
  code: string,
  language: string,
  questionId: string,
): Promise<GradeResult> {
  const testCases = await prisma.codeTestCase.findMany({
    where: { questionId },
    orderBy: { order: 'asc' },
  })

  if (testCases.length === 0) {
    return { results: [], passedCount: 0, totalCount: 0, pointsEarned: 0, totalPoints: 0, hasTestCases: false }
  }

  const langId = LANG_ID[language]
  if (!langId) {
    return { results: [], passedCount: 0, totalCount: 0, pointsEarned: 0, totalPoints: 0, hasTestCases: true }
  }

  const totalPoints = testCases.reduce((s, tc) => s + tc.points, 0)
  let pointsEarned = 0
  let passedCount = 0
  const results: TestCaseResult[] = []

  for (const tc of testCases) {
    if (!JUDGE0_KEY) {
      // Mock: always fail without a real Judge0 key
      results.push({
        caseId: tc.id,
        description: tc.description,
        isHidden: tc.isHidden,
        passed: false,
        actualOutput: null,
        expectedOutput: tc.expectedOutput,
        status: 'Mock mode — set JUDGE0_API_KEY for real execution',
        time: null,
        memory: null,
      })
      continue
    }

    try {
      const res = await runCode(code, langId, tc.input)
      const actual = (res.stdout ?? '').trimEnd()
      const expected = tc.expectedOutput.trimEnd()
      const passed = actual === expected && res.statusId === 3 // 3 = Accepted

      if (passed) {
        pointsEarned += tc.points
        passedCount++
      }

      results.push({
        caseId: tc.id,
        description: tc.description,
        isHidden: tc.isHidden,
        passed,
        actualOutput: res.stdout,
        expectedOutput: tc.expectedOutput,
        status: res.status,
        time: res.time,
        memory: res.memory,
      })
    } catch {
      results.push({
        caseId: tc.id,
        description: tc.description,
        isHidden: tc.isHidden,
        passed: false,
        actualOutput: null,
        expectedOutput: tc.expectedOutput,
        status: 'Execution error',
        time: null,
        memory: null,
      })
    }
  }

  return { results, passedCount, totalCount: testCases.length, pointsEarned, totalPoints, hasTestCases: true }
}

// Candidate-facing version: runs code but strips expected output from hidden test cases
export async function runTestsForCandidate(
  code: string,
  language: string,
  questionId: string,
): Promise<GradeResult> {
  const full = await gradeCode(code, language, questionId)
  return {
    ...full,
    results: full.results.map(r =>
      r.isHidden
        ? { ...r, expectedOutput: null, actualOutput: null }
        : r
    ),
  }
}
