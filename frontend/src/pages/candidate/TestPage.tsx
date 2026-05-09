import { useState, useEffect, useCallback } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  Clock, AlertTriangle, ChevronLeft, ChevronRight, Send, Loader2,
  Camera, CameraOff, Maximize, ShieldAlert,
} from 'lucide-react'
import MonacoEditor from '@monaco-editor/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { api, getErrorMessage } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { useProctoring } from '@/hooks/useProctoring'
import { ProctoringSetup } from '@/components/proctoring/ProctoringSetup'
import { formatSeconds, cn } from '@/lib/utils'

interface AnswerState {
  selectedOptions: string[]
  responseText: string
  numericValue: string
  codeSubmission: string
  language: string
  timeSpent: number
}

const emptyAnswer = (): AnswerState => ({
  selectedOptions: [], responseText: '', numericValue: '',
  codeSubmission: '', language: 'python', timeSpent: 0,
})

const MONACO_LANG: Record<string, string> = {
  python: 'python', javascript: 'javascript', typescript: 'typescript',
  java: 'java', c: 'c', cpp: 'cpp', go: 'go', rust: 'rust', csharp: 'csharp',
}

export function TestPage() {
  const { token } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { sessionId, inviteData } = location.state ?? {}

  const [testStep, setTestStep] = useState<'setup' | 'test'>('setup')
  const [currentSectionIdx, setCurrentSectionIdx] = useState(0)
  const [currentQIdx, setCurrentQIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({})
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null)
  const [questionStartTime, setQuestionStartTime] = useState(Date.now())
  const [submitting, setSubmitting] = useState(false)
  const [violations, setViolations] = useState<Record<string, number>>({})
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)

  const proctoring = inviteData?.test?.proctoring !== false

  const {
    pushEvent, stopProctoring, requestFullscreen, flush,
    attachVideoRef,
    webcamActive, micActive, faceCount,
    violationCounts,
  } = useProctoring({
    sessionId,
    token: token ?? '',
    enabled: proctoring,
    onViolation: (type, count) => setViolations(prev => ({ ...prev, [type]: count })),
  })

  const { data: testData, isLoading } = useQuery({
    queryKey: ['test-questions', sessionId],
    queryFn: () => api.get(`/sessions/${sessionId}/questions?token=${token}`).then(r => r.data.data),
    enabled: !!sessionId,
    refetchInterval: 30_000,
  })

  useEffect(() => {
    if (testData?.timeRemaining != null) setTimeRemaining(testData.timeRemaining)
  }, [testData?.timeRemaining])

  useEffect(() => {
    if (timeRemaining === null) return
    if (timeRemaining <= 0) { handleSubmit(); return }
    const timer = setInterval(() => setTimeRemaining(t => (t !== null ? Math.max(0, t - 1) : null)), 1000)
    return () => clearInterval(timer)
  }, [timeRemaining])

  const handleSetupReady = useCallback(() => {
    setTestStep('test')
    if (proctoring) requestFullscreen()
  }, [proctoring, requestFullscreen])

  const saveMutation = useMutation({
    mutationFn: ({ questionId, answer }: { questionId: string; answer: AnswerState }) =>
      api.post(`/sessions/${sessionId}/answers`, {
        token,
        questionId,
        selectedOptions: answer.selectedOptions,
        responseText: answer.responseText || undefined,
        numericValue: answer.numericValue ? parseFloat(answer.numericValue) : undefined,
        codeSubmission: answer.codeSubmission || undefined,
        language: answer.language || undefined,
        timeSpent: answer.timeSpent,
      }),
  })

  const submitMutation = useMutation({
    mutationFn: async () => {
      await flush()
      await stopProctoring()
      return api.post(`/sessions/${sessionId}/submit`, { token })
    },
    onSuccess: res => {
      setSubmitting(false)
      navigate(`/take/${token}/done`, { state: { result: res.data.data } })
    },
    onError: err => {
      setSubmitting(false)
      toast({ title: 'Submission failed', description: getErrorMessage(err), variant: 'destructive' })
    },
  })

  const sections = testData?.sections ?? []
  const currentSection = sections[currentSectionIdx]
  const questions = currentSection?.questions ?? []
  const currentQ = questions[currentQIdx]
  const currentAnswer = currentQ ? (answers[currentQ.questionId] ?? emptyAnswer()) : emptyAnswer()

  const saveCurrentAndGo = useCallback(async (action: () => void) => {
    if (currentQ) {
      const elapsed = Math.round((Date.now() - questionStartTime) / 1000)
      const updated = { ...currentAnswer, timeSpent: currentAnswer.timeSpent + elapsed }
      setAnswers(prev => ({ ...prev, [currentQ.questionId]: updated }))
      saveMutation.mutate({ questionId: currentQ.questionId, answer: updated })
    }
    setQuestionStartTime(Date.now())
    action()
  }, [currentQ, currentAnswer, questionStartTime, saveMutation])

  const goToNext = useCallback(() => {
    saveCurrentAndGo(() => {
      if (currentQIdx < questions.length - 1) setCurrentQIdx(i => i + 1)
      else if (currentSectionIdx < sections.length - 1) { setCurrentSectionIdx(i => i + 1); setCurrentQIdx(0) }
    })
  }, [saveCurrentAndGo, currentQIdx, currentSectionIdx, questions, sections])

  const goToPrev = useCallback(() => {
    saveCurrentAndGo(() => {
      if (currentQIdx > 0) setCurrentQIdx(i => i - 1)
      else if (currentSectionIdx > 0) {
        setCurrentSectionIdx(i => i - 1)
        setCurrentQIdx((sections[currentSectionIdx - 1]?.questions.length ?? 1) - 1)
      }
    })
  }, [saveCurrentAndGo, currentQIdx, currentSectionIdx, sections])

  const handleSubmit = async () => {
    if (submitting) return
    if (currentQ) {
      const elapsed = Math.round((Date.now() - questionStartTime) / 1000)
      const updated = { ...currentAnswer, timeSpent: currentAnswer.timeSpent + elapsed }
      await saveMutation.mutateAsync({ questionId: currentQ.questionId, answer: updated }).catch(() => {})
    }
    setSubmitting(true)
    submitMutation.mutate()
  }

  const updateAnswer = (patch: Partial<AnswerState>) => {
    if (!currentQ) return
    setAnswers(prev => ({ ...prev, [currentQ.questionId]: { ...(prev[currentQ.questionId] ?? emptyAnswer()), ...patch } }))
  }

  const totalQuestions = sections.reduce((a: number, s: any) => a + s.questions.length, 0)
  const answeredCount = Object.values(answers).filter(a =>
    a.selectedOptions.length > 0 || a.responseText || a.numericValue || a.codeSubmission
  ).length
  const totalViolations = Object.values(violations).reduce((s, n) => s + n, 0)
  const isLastQuestion = currentSectionIdx === sections.length - 1 && currentQIdx === questions.length - 1

  if (!sessionId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Invalid session. Please return to your invite link.</p>
      </div>
    )
  }

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  // ── Proctoring setup step ──────────────────────────────────────────────────
  if (proctoring && testStep === 'setup') {
    return (
      <ProctoringSetup
        attachVideoRef={attachVideoRef}
        webcamActive={webcamActive}
        micActive={micActive}
        faceCount={faceCount}
        onReady={handleSetupReady}
      />
    )
  }

  // ── Test UI ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <div className="font-semibold text-gray-900 truncate flex-1">{inviteData?.test?.title ?? 'Assessment'}</div>

          {proctoring && (
            <div className="flex items-center gap-1.5 shrink-0">
              {webcamActive
                ? <Camera className="h-4 w-4 text-green-600" />
                : <CameraOff className="h-4 w-4 text-red-500" />}
              {totalViolations > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <ShieldAlert className="h-3 w-3" />
                  {totalViolations} flag{totalViolations > 1 ? 's' : ''}
                </Badge>
              )}
              <button onClick={requestFullscreen} title="Enter fullscreen" className="text-muted-foreground hover:text-gray-900">
                <Maximize className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className={cn(
            'flex items-center gap-1.5 font-mono font-semibold shrink-0 px-3 py-1 rounded-md',
            timeRemaining !== null && timeRemaining < 300 ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-gray-100 text-gray-700'
          )}>
            <Clock className="h-4 w-4" />
            {timeRemaining !== null ? formatSeconds(timeRemaining) : '--:--'}
          </div>
          <div className="text-sm text-muted-foreground shrink-0">{answeredCount}/{totalQuestions}</div>
        </div>
      </header>

      {/* Webcam PIP */}
      {proctoring && (
        <video
          ref={attachVideoRef}
          autoPlay
          muted
          playsInline
          className="fixed bottom-4 right-4 w-32 h-24 rounded-lg border-2 border-white shadow-lg object-cover z-50 bg-gray-900"
        />
      )}

      <div className="flex flex-1 max-w-5xl mx-auto w-full px-4 py-6 gap-6">
        {/* Question panel */}
        <main className="flex-1 space-y-4 min-w-0">
          {currentSection && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-medium">{currentSection.title}</span>
              <span>·</span>
              <span>Question {currentQIdx + 1} of {questions.length}</span>
            </div>
          )}

          {currentQ && (
            <Card>
              <CardContent className="p-6 space-y-5">
                <div>
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Badge variant="outline">{currentQ.question.type.replace(/_/g, ' ')}</Badge>
                    <span className="text-xs text-muted-foreground">{currentQ.points} pt{currentQ.points !== 1 ? 's' : ''}</span>
                    {currentQ.isRequired && <span className="text-xs text-red-500">Required</span>}
                  </div>
                  <p className="text-base font-medium leading-relaxed whitespace-pre-wrap">{currentQ.question.body}</p>
                </div>

                <QuestionInput
                  question={currentQ.question}
                  answer={currentAnswer}
                  onChange={updateAnswer}
                  sessionId={sessionId}
                  token={token ?? ''}
                />
              </CardContent>
            </Card>
          )}

          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" onClick={goToPrev} disabled={currentSectionIdx === 0 && currentQIdx === 0}>
              <ChevronLeft className="h-4 w-4 mr-1" />Previous
            </Button>

            {isLastQuestion ? (
              <>
                {showSubmitConfirm ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Submit {totalQuestions - answeredCount > 0 ? `(${totalQuestions - answeredCount} unanswered)` : ''}?</span>
                    <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Confirm Submit
                    </Button>
                    <Button variant="outline" onClick={() => setShowSubmitConfirm(false)}>Cancel</Button>
                  </div>
                ) : (
                  <Button onClick={() => setShowSubmitConfirm(true)} className="gap-2">
                    <Send className="h-4 w-4" />Submit Assessment
                  </Button>
                )}
              </>
            ) : (
              <Button onClick={goToNext}>
                Next<ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </main>

        {/* Question navigator */}
        <aside className="w-52 shrink-0 hidden lg:block">
          <div className="bg-white rounded-lg border p-4 space-y-3 sticky top-20">
            <p className="text-sm font-medium text-gray-700">Questions</p>
            {sections.map((section: any, sIdx: number) => (
              <div key={section.id}>
                {sections.length > 1 && <p className="text-xs text-muted-foreground mb-1">{section.title}</p>}
                <div className="grid grid-cols-5 gap-1">
                  {section.questions.map((q: any, qIdx: number) => {
                    const ans = answers[q.questionId]
                    const answered = ans && (ans.selectedOptions.length > 0 || ans.responseText || ans.numericValue || ans.codeSubmission)
                    const isCurrent = sIdx === currentSectionIdx && qIdx === currentQIdx
                    return (
                      <button
                        key={q.questionId}
                        onClick={() => saveCurrentAndGo(() => { setCurrentSectionIdx(sIdx); setCurrentQIdx(qIdx) })}
                        className={cn(
                          'h-8 w-8 rounded text-xs font-medium transition-colors',
                          isCurrent ? 'bg-primary text-white' :
                          answered ? 'bg-green-100 text-green-700 border border-green-200' :
                          'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        )}
                      >
                        {qIdx + 1}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            <div className="pt-2 border-t space-y-1 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-green-100 border border-green-200" />Answered</div>
              <div className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-gray-100" />Unanswered</div>
              <div className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-primary" />Current</div>
            </div>

            {proctoring && totalViolations > 0 && (
              <div className="pt-2 border-t">
                <p className="text-xs font-medium text-red-600 flex items-center gap-1 mb-1">
                  <AlertTriangle className="h-3 w-3" />Flags logged
                </p>
                {Object.entries(violations).map(([type, count]) => (
                  <p key={type} className="text-xs text-muted-foreground">{type.replace(/_/g, ' ')}: {count}</p>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

function QuestionInput({ question, answer, onChange, sessionId, token }: {
  question: any; answer: AnswerState; onChange: (p: Partial<AnswerState>) => void
  sessionId: string; token: string
}) {
  switch (question.type) {
    case 'MCQ_SINGLE':
    case 'TRUE_FALSE':
      return (
        <div className="space-y-2">
          {question.options.map((opt: any) => (
            <label key={opt.id} className={cn(
              'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
              answer.selectedOptions.includes(opt.id) ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'
            )}>
              <input type="radio" name={`q-${question.id}`}
                checked={answer.selectedOptions.includes(opt.id)}
                onChange={() => onChange({ selectedOptions: [opt.id] })}
                className="text-primary" />
              <span className="text-sm">{opt.text}</span>
            </label>
          ))}
        </div>
      )

    case 'MCQ_MULTI':
      return (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Select all that apply</p>
          {question.options.map((opt: any) => (
            <label key={opt.id} className={cn(
              'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
              answer.selectedOptions.includes(opt.id) ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'
            )}>
              <input type="checkbox"
                checked={answer.selectedOptions.includes(opt.id)}
                onChange={e => {
                  const next = e.target.checked
                    ? [...answer.selectedOptions, opt.id]
                    : answer.selectedOptions.filter((id: string) => id !== opt.id)
                  onChange({ selectedOptions: next })
                }} />
              <span className="text-sm">{opt.text}</span>
            </label>
          ))}
        </div>
      )

    case 'ESSAY':
      return (
        <textarea rows={10}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
          placeholder="Write your detailed answer here..."
          value={answer.responseText}
          onChange={e => onChange({ responseText: e.target.value })} />
      )

    case 'SHORT_ANSWER':
      return (
        <textarea rows={3}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Your answer..."
          value={answer.responseText}
          onChange={e => onChange({ responseText: e.target.value })} />
      )

    case 'NUMERICAL':
      return (
        <div className="space-y-1">
          <input type="number" step="any"
            className="flex h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Enter a number"
            value={answer.numericValue}
            onChange={e => onChange({ numericValue: e.target.value })} />
        </div>
      )

    case 'CODE':
      return (
        <CodeQuestion
          answer={answer}
          onChange={onChange}
          questionId={question.id}
          visibleTestCases={question.codeTestCases ?? []}
          sessionId={sessionId}
          token={token}
        />
      )

    case 'RANKING':
      return <RankingQuestion question={question} answer={answer} onChange={onChange} />

    default:
      return <p className="text-sm text-muted-foreground italic">This question type is not yet supported.</p>
  }
}

interface TestCaseResult {
  caseId: string
  description: string | null
  isHidden: boolean
  passed: boolean
  actualOutput: string | null
  expectedOutput: string | null
  status: string
  time: string | null
  memory: number | null
}

function CodeQuestion({
  answer, onChange, questionId, visibleTestCases, sessionId, token,
}: {
  answer: AnswerState
  onChange: (p: Partial<AnswerState>) => void
  questionId: string
  visibleTestCases: any[]
  sessionId: string
  token: string
}) {
  const [activeTab, setActiveTab] = useState<'run' | 'testcases'>('run')
  const [running, setRunning] = useState(false)
  const [testRunning, setTestRunning] = useState(false)
  const [output, setOutput] = useState<{ stdout?: string; stderr?: string; status?: string } | null>(null)
  const [stdin, setStdin] = useState('')
  const [testResults, setTestResults] = useState<TestCaseResult[] | null>(null)
  const [testMeta, setTestMeta] = useState<{ passed: number; total: number; hasTestCases: boolean } | null>(null)
  const lang = answer.language || 'python'

  const runCode = async () => {
    if (!answer.codeSubmission) return
    setRunning(true)
    setOutput(null)
    try {
      const res = await api.post('/code/run', { code: answer.codeSubmission, language: lang, stdin })
      setOutput(res.data.data)
    } catch (err: any) {
      setOutput({ stderr: err.response?.data?.error || 'Execution failed' })
    } finally {
      setRunning(false)
    }
  }

  const runTests = async () => {
    if (!answer.codeSubmission) return
    setTestRunning(true)
    setTestResults(null)
    try {
      const res = await api.post('/code/run-tests', {
        code: answer.codeSubmission,
        language: lang,
        questionId,
        token,
        sessionId,
      })
      const data = res.data.data
      setTestResults(data.results ?? [])
      setTestMeta({ passed: data.passedCount, total: data.totalCount, hasTestCases: data.hasTestCases })
    } catch (err: any) {
      toast({ title: 'Test run failed', description: err.response?.data?.error || 'Could not run tests', variant: 'destructive' })
    } finally {
      setTestRunning(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Language + tab selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          className="text-xs rounded border border-input px-2 py-1.5 bg-background"
          value={lang}
          onChange={e => onChange({ language: e.target.value })}
        >
          {['python', 'javascript', 'typescript', 'java', 'c', 'cpp', 'go', 'rust', 'csharp'].map(l => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        <div className="flex border rounded overflow-hidden text-xs ml-auto">
          {(['run', 'testcases'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn('px-3 py-1.5 font-medium transition-colors',
                activeTab === tab ? 'bg-primary text-white' : 'bg-background text-muted-foreground hover:bg-gray-50'
              )}
            >
              {tab === 'run' ? '▶ Run' : `Test Cases${visibleTestCases.length ? ` (${visibleTestCases.length})` : ''}`}
            </button>
          ))}
        </div>
      </div>

      {/* Monaco editor */}
      <div className="rounded-lg overflow-hidden border">
        <MonacoEditor
          height="300px"
          language={MONACO_LANG[lang] ?? 'plaintext'}
          value={answer.codeSubmission}
          onChange={val => onChange({ codeSubmission: val ?? '' })}
          theme="vs-dark"
          options={{ fontSize: 13, minimap: { enabled: false }, scrollBeyondLastLine: false, wordWrap: 'on', tabSize: 4 }}
        />
      </div>

      {/* Run tab */}
      {activeTab === 'run' && (
        <div className="space-y-2">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">Stdin (optional)</p>
            <textarea
              rows={2}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Input for your program..."
              value={stdin}
              onChange={e => setStdin(e.target.value)}
            />
          </div>
          <Button size="sm" variant="outline" onClick={runCode} disabled={running || !answer.codeSubmission}>
            {running ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            {running ? 'Running…' : '▶ Run Code'}
          </Button>
          {output && (
            <div className="rounded-md bg-gray-900 text-gray-100 p-3 text-xs font-mono">
              {output.status && <p className="text-gray-400 mb-1">Status: {output.status}</p>}
              {output.stdout && <pre className="whitespace-pre-wrap text-green-300">{output.stdout}</pre>}
              {output.stderr && <pre className="whitespace-pre-wrap text-red-400">{output.stderr}</pre>}
              {!output.stdout && !output.stderr && <span className="text-gray-500">No output</span>}
            </div>
          )}
        </div>
      )}

      {/* Test Cases tab */}
      {activeTab === 'testcases' && (
        <div className="space-y-3">
          {/* Sample test cases display */}
          {visibleTestCases.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Sample test cases</p>
              {visibleTestCases.map((tc: any, i: number) => (
                <div key={tc.id} className="bg-gray-50 rounded-md border text-xs p-3 space-y-1">
                  <p className="font-medium text-gray-700">Case {i + 1}{tc.description ? ` — ${tc.description}` : ''}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-muted-foreground mb-0.5">Input:</p>
                      <pre className="bg-white border rounded p-1.5 text-xs font-mono whitespace-pre-wrap">{tc.input || '(none)'}</pre>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-0.5">Expected output:</p>
                      <pre className="bg-white border rounded p-1.5 text-xs font-mono whitespace-pre-wrap">{tc.expectedOutput}</pre>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Button size="sm" onClick={runTests} disabled={testRunning || !answer.codeSubmission}>
            {testRunning ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            {testRunning ? 'Running tests…' : 'Run All Test Cases'}
          </Button>

          {testMeta && !testMeta.hasTestCases && (
            <p className="text-xs text-muted-foreground italic">No test cases configured for this question.</p>
          )}

          {testResults && testResults.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className={cn('text-sm font-semibold', testMeta?.passed === testMeta?.total ? 'text-green-600' : 'text-orange-600')}>
                  {testMeta?.passed}/{testMeta?.total} passed
                </span>
              </div>
              {testResults.map((r, i) => (
                <div key={r.caseId} className={cn(
                  'rounded-md border p-3 text-xs space-y-1.5',
                  r.passed ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                )}>
                  <div className="flex items-center gap-2">
                    <span className={cn('font-semibold', r.passed ? 'text-green-700' : 'text-red-700')}>
                      {r.passed ? '✓' : '✗'} Case {i + 1}
                    </span>
                    {r.description && <span className="text-muted-foreground">{r.description}</span>}
                    {r.isHidden && <span className="text-muted-foreground italic">(hidden)</span>}
                    <span className="ml-auto text-muted-foreground">{r.status}</span>
                    {r.time && <span className="text-muted-foreground">{r.time}s</span>}
                  </div>
                  {!r.isHidden && !r.passed && r.actualOutput !== null && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-muted-foreground mb-0.5">Your output:</p>
                        <pre className="bg-white border rounded p-1.5 font-mono whitespace-pre-wrap text-red-700">{r.actualOutput || '(empty)'}</pre>
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-0.5">Expected:</p>
                        <pre className="bg-white border rounded p-1.5 font-mono whitespace-pre-wrap text-green-700">{r.expectedOutput || '(empty)'}</pre>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function RankingQuestion({ question, answer, onChange }: {
  question: any; answer: AnswerState; onChange: (p: Partial<AnswerState>) => void
}) {
  const [order, setOrder] = useState<string[]>(() =>
    answer.selectedOptions.length > 0 ? answer.selectedOptions : question.options.map((o: any) => o.id)
  )

  const move = (idx: number, dir: -1 | 1) => {
    const newOrder = [...order]
    const target = idx + dir
    if (target < 0 || target >= newOrder.length) return
    ;[newOrder[idx], newOrder[target]] = [newOrder[target], newOrder[idx]]
    setOrder(newOrder)
    onChange({ selectedOptions: newOrder })
  }

  const optMap = Object.fromEntries(question.options.map((o: any) => [o.id, o.text]))

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Drag or use arrows to rank from most to least preferred</p>
      {order.map((id, idx) => (
        <div key={id} className="flex items-center gap-2 p-3 rounded-lg border bg-white">
          <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
          <span className="flex-1 text-sm">{optMap[id]}</span>
          <div className="flex flex-col gap-0.5">
            <button onClick={() => move(idx, -1)} disabled={idx === 0} className="text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs leading-none">▲</button>
            <button onClick={() => move(idx, 1)} disabled={idx === order.length - 1} className="text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs leading-none">▼</button>
          </div>
        </div>
      ))}
    </div>
  )
}
