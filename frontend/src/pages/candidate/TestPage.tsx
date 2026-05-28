import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  Clock, ChevronLeft, ChevronRight, Send, Loader2,
  Camera, CameraOff, Maximize, Video, FileText, CalculatorIcon, X as XIcon,
} from 'lucide-react'
import MonacoEditor from '@monaco-editor/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { api, getErrorMessage } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { useProctoring } from '@/hooks/useProctoring'
import { useScreenRecorder } from '@/hooks/useScreenRecorder'
import { ProctoringSetup } from '@/components/proctoring/ProctoringSetup'
import { SecureBrowserGate } from '@/components/SecureBrowserGate'
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
  const { sessionId, inviteData, isPractice, practiceName } = location.state ?? {}

  const [testStep, setTestStep] = useState<'setup' | 'room-scan' | 'test'>(isPractice ? 'test' : 'setup')
  const [showMidScan, setShowMidScan] = useState(false)
  const [currentSectionIdx, setCurrentSectionIdx] = useState(0)
  const [currentQIdx, setCurrentQIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({})
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null)
  const [questionStartTime, setQuestionStartTime] = useState(Date.now())
  const [submitting, setSubmitting] = useState(false)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const [tabWarningCount, setTabWarningCount] = useState(0)
  const [showTabWarning, setShowTabWarning] = useState(false)
  const [sectionTimeRemaining, setSectionTimeRemaining] = useState<number | null>(null)
  const [showTools, setShowTools] = useState(false)
  const [toolsTab, setToolsTab] = useState<'notes' | 'calc'>('notes')
  const [scratchpad, setScratchpad] = useState('')
  const [calcDisplay, setCalcDisplay] = useState('0')
  const [calcPrev, setCalcPrev] = useState('')
  const [calcOp, setCalcOp] = useState<string | null>(null)
  const [calcJustEval, setCalcJustEval] = useState(false)
  const sectionExpireRef = useRef<(() => void) | null>(null)

  const proctoring = !isPractice && inviteData?.test?.proctoring !== false
  const roomScanEnabled = proctoring && inviteData?.test?.roomScanEnabled === true
  const roomScanIntervalMins: number = inviteData?.test?.roomScanIntervalMins ?? 20
  const brandColor = inviteData?.test?.tenant?.primaryColor ?? '#6366f1'

  const requireSecureBrowser = !isPractice && inviteData?.test?.requireSecureBrowser === true
  const isSecureBrowser = !!(window as any).__SECURE_BROWSER__

  useEffect(() => {
    document.documentElement.style.setProperty('--brand-primary', brandColor)
    return () => { document.documentElement.style.removeProperty('--brand-primary') }
  }, [brandColor])

  const candidateName = practiceName
    ?? (inviteData?.candidate
      ? `${inviteData.candidate.firstName ?? ''} ${inviteData.candidate.lastName ?? ''}`.trim()
      : undefined)

  const handleTabReturn = useCallback(() => {
    setTabWarningCount(c => c + 1)
    setShowTabWarning(true)
  }, [])

  const {
    pushEvent, pushImmediate, stopProctoring, requestFullscreen, flush,
    attachVideoRef,
    webcamActive, micActive, faceCount,
    violationCounts,
  } = useProctoring({
    sessionId,
    token: token ?? '',
    enabled: proctoring,
    candidateName,
    onTabReturn: handleTabReturn,
  })

  const {
    requestPermission: requestScreenShare,
    stopAndUpload: stopAndUploadRecording,
    permission: screenSharePermission,
  } = useScreenRecorder({
    sessionId: sessionId ?? '',
    token: token ?? '',
    enabled: proctoring,
    onStopped: () => pushImmediate('SCREEN_RECORDING_STOPPED', 'Candidate stopped screen sharing during the test'),
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

  // Register session with secure browser main process for violation reporting
  useEffect(() => {
    if (isSecureBrowser && sessionId && token) {
      ;(window as any).__secureBrowserBridge__?.setSession(sessionId, token)
    }
  }, [isSecureBrowser, sessionId, token])

  useEffect(() => {
    if (timeRemaining === null) return
    if (timeRemaining <= 0) { handleSubmit(); return }
    const timer = setInterval(() => setTimeRemaining(t => (t !== null ? Math.max(0, t - 1) : null)), 1000)
    return () => clearInterval(timer)
  }, [timeRemaining])

  // Server-side heartbeat — keeps session alive and syncs server time
  useEffect(() => {
    if (testStep !== 'test' || !sessionId) return
    const send = async () => {
      try {
        const res = await api.post(`/sessions/${sessionId}/heartbeat`, { token })
        if (res.data?.data?.timeRemaining !== undefined && res.data.data.timeRemaining !== null) {
          setTimeRemaining(res.data.data.timeRemaining)
        }
      } catch {
        // silently ignore — session may have expired, which the normal timer handles
      }
    }
    send()
    const interval = setInterval(send, 30_000)
    return () => clearInterval(interval)
  }, [testStep, sessionId, token])

  // Keep a stable ref to the section-expire handler so the countdown effect doesn't go stale
  useEffect(() => {
    const secs = testData?.sections ?? []
    sectionExpireRef.current = () => {
      if (currentSectionIdx < secs.length - 1) {
        setCurrentSectionIdx(i => i + 1)
        setCurrentQIdx(0)
      } else {
        handleSubmit()
      }
    }
  })

  // Reset section timer whenever the section changes
  useEffect(() => {
    const secs = testData?.sections ?? []
    const limit = secs[currentSectionIdx]?.timeLimit ?? null
    setSectionTimeRemaining(limit)
  }, [currentSectionIdx, testData])

  // Count down section timer; auto-advance on expiry
  useEffect(() => {
    if (sectionTimeRemaining === null || sectionTimeRemaining <= 0) {
      if (sectionTimeRemaining === 0) sectionExpireRef.current?.()
      return
    }
    const t = setInterval(() => setSectionTimeRemaining(s => s !== null ? Math.max(0, s - 1) : null), 1000)
    return () => clearInterval(t)
  }, [sectionTimeRemaining])

  const handleSetupReady = useCallback(() => {
    if (roomScanEnabled) {
      setTestStep('room-scan')
    } else {
      setTestStep('test')
      if (proctoring) requestFullscreen()
    }
  }, [proctoring, roomScanEnabled, requestFullscreen])

  // Mid-test room scan interval
  useEffect(() => {
    if (testStep !== 'test' || !roomScanEnabled) return
    const ms = roomScanIntervalMins * 60 * 1000
    const t = setInterval(() => setShowMidScan(true), ms)
    return () => clearInterval(t)
  }, [testStep, roomScanEnabled, roomScanIntervalMins])

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
      // Upload screen recording before stopping (best-effort, non-blocking)
      await Promise.race([
        stopAndUploadRecording(),
        new Promise(resolve => setTimeout(resolve, 8000)), // 8s cap so submit doesn't stall
      ])
      await stopProctoring()
      return api.post(`/sessions/${sessionId}/submit`, { token })
    },
    onSuccess: res => {
      setSubmitting(false)
      // Notify secure browser that test is complete — unlocks the kiosk window
      if (isSecureBrowser) {
        ;(window as any).__secureBrowserBridge__?.notifySubmitted()
      }
      navigate(`/take/${token}/done`, { state: { result: res.data.data, isPractice }, replace: true })
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

  // ── Secure browser gate ────────────────────────────────────────────────────
  if (requireSecureBrowser && !isSecureBrowser) {
    return (
      <SecureBrowserGate
        testTitle={inviteData?.test?.title}
        tenantName={inviteData?.test?.tenant?.name}
      />
    )
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
        onRequestScreenShare={requestScreenShare}
        screenSharePermission={screenSharePermission}
      />
    )
  }

  // ── Pre-test room scan ─────────────────────────────────────────────────────
  if (testStep === 'room-scan') {
    return (
      <RoomScanModal
        sessionId={sessionId}
        token={token ?? ''}
        trigger="PRE_TEST"
        onComplete={() => { setTestStep('test'); if (proctoring) requestFullscreen() }}
      />
    )
  }

  // ── Test UI ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Mid-test room scan overlay */}
      {showMidScan && (
        <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4">
          <RoomScanModal
            sessionId={sessionId}
            token={token ?? ''}
            trigger="MID_TEST"
            onComplete={() => setShowMidScan(false)}
          />
        </div>
      )}

      {/* Tab-return warning overlay */}
      {showTabWarning && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto">
              <span className="text-3xl">⚠️</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Tab switch detected</h2>
              <p className="text-sm text-muted-foreground mt-1">
                You left this tab. This violation has been recorded and a screenshot was taken.
              </p>
              {tabWarningCount >= 3 && (
                <p className="text-sm text-red-600 font-medium mt-2">
                  {tabWarningCount} violations logged. Repeated switching may result in disqualification.
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Violation #{tabWarningCount} — your proctor will be notified.
            </p>
            <Button className="w-full" onClick={() => { setShowTabWarning(false); requestFullscreen() }}>
              I understand — continue test
            </Button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10" style={{ borderTopColor: brandColor, borderTopWidth: 3, borderTopStyle: 'solid' }}>
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <div className="font-semibold text-gray-900 truncate flex-1">{inviteData?.test?.title ?? 'Assessment'}</div>

          {proctoring && (
            <div className="flex items-center gap-1.5 shrink-0">
              {webcamActive
                ? <Camera className="h-4 w-4 text-green-600" />
                : <CameraOff className="h-4 w-4 text-red-500" />}
              <button onClick={requestFullscreen} title="Enter fullscreen" className="text-muted-foreground hover:text-gray-900">
                <Maximize className="h-4 w-4" />
              </button>
            </div>
          )}

          {sectionTimeRemaining !== null && (
            <div className={cn(
              'flex items-center gap-1 font-mono text-sm font-semibold shrink-0 px-2 py-1 rounded-md',
              sectionTimeRemaining < 60 ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-amber-50 text-amber-700'
            )}>
              <span className="text-xs font-normal mr-0.5">§</span>
              {formatSeconds(sectionTimeRemaining)}
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
          <button
            onClick={() => setShowTools(s => !s)}
            title="Scratch pad & calculator"
            className="shrink-0 p-1.5 rounded hover:bg-gray-100 text-gray-500"
          >
            <FileText className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Webcam PIP */}
      {proctoring && (
        <video
          ref={attachVideoRef}
          autoPlay
          muted
          playsInline
          className="fixed bottom-4 right-4 w-32 h-24 rounded-lg border-2 shadow-lg object-cover z-50 bg-gray-900"
          style={{ borderColor: brandColor }}
        />
      )}

      {/* Scratch pad + calculator panel */}
      {showTools && (
        <div className="fixed bottom-32 right-4 w-72 bg-white rounded-xl shadow-2xl border z-40 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b">
            <div className="flex gap-1">
              <button
                onClick={() => setToolsTab('notes')}
                className={cn('px-3 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1',
                  toolsTab === 'notes' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                <FileText className="h-3 w-3" />Notes
              </button>
              <button
                onClick={() => setToolsTab('calc')}
                className={cn('px-3 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1',
                  toolsTab === 'calc' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                <CalculatorIcon className="h-3 w-3" />Calc
              </button>
            </div>
            <button onClick={() => setShowTools(false)} className="text-gray-400 hover:text-gray-600">
              <XIcon className="h-4 w-4" />
            </button>
          </div>

          {toolsTab === 'notes' ? (
            <textarea
              className="w-full h-48 p-3 text-sm resize-none focus:outline-none font-mono"
              placeholder="Scratch pad — notes are not saved"
              value={scratchpad}
              onChange={e => setScratchpad(e.target.value)}
            />
          ) : (
            <Calculator
              display={calcDisplay} prev={calcPrev} op={calcOp} justEval={calcJustEval}
              setDisplay={setCalcDisplay} setPrev={setCalcPrev} setOp={setCalcOp} setJustEval={setCalcJustEval}
            />
          )}
        </div>
      )}

      <div className="flex flex-1 max-w-5xl mx-auto w-full px-4 py-6 gap-6">
        {/* Question panel */}
        <main className="flex-1 space-y-4 min-w-0">
          {currentSection && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
              <span className="font-medium text-gray-800">{currentSection.title}</span>
              <span>·</span>
              <span>Question {currentQIdx + 1} of {questions.length}</span>
              {currentSection.timeLimit && sectionTimeRemaining !== null && (
                <>
                  <span>·</span>
                  <span className={cn(
                    'flex items-center gap-1',
                    sectionTimeRemaining < 60 ? 'text-red-600 font-semibold' : 'text-amber-600'
                  )}>
                    <Clock className="h-3 w-3" />
                    {formatSeconds(sectionTimeRemaining)} left in section
                  </span>
                </>
              )}
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
                {sections.length > 1 && (
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    {section.title}
                    {section.timeLimit && <Clock className="h-2.5 w-2.5 text-amber-500" />}
                  </p>
                )}
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

          </div>
        </aside>
      </div>
    </div>
  )
}

function Calculator({
  display, prev, op, justEval,
  setDisplay, setPrev, setOp, setJustEval,
}: {
  display: string; prev: string; op: string | null; justEval: boolean
  setDisplay: (v: string) => void; setPrev: (v: string) => void
  setOp: (v: string | null) => void; setJustEval: (v: boolean) => void
}) {
  const handleDigit = (d: string) => {
    if (justEval) { setDisplay(d); setJustEval(false); return }
    setDisplay(display === '0' && d !== '.' ? d : display.includes('.') && d === '.' ? display : display + d)
  }
  const handleOp = (o: string) => {
    setPrev(display); setOp(o); setJustEval(false)
  }
  const handleEquals = () => {
    if (!op || !prev) return
    const a = parseFloat(prev), b = parseFloat(display)
    let r = op === '+' ? a + b : op === '-' ? a - b : op === '×' ? a * b : b !== 0 ? a / b : NaN
    const res = isNaN(r) ? 'Error' : String(parseFloat(r.toFixed(10)))
    setDisplay(res); setPrev(''); setOp(null); setJustEval(true)
  }
  const handleClear = () => { setDisplay('0'); setPrev(''); setOp(null); setJustEval(false) }
  const handleToggleSign = () => { setDisplay(String(-parseFloat(display))) }
  const handlePercent = () => { setDisplay(String(parseFloat(display) / 100)) }

  const btn = (label: string, onClick: () => void, variant: 'op' | 'fn' | 'num' | 'eq') => {
    const colors = {
      op: 'bg-amber-400 hover:bg-amber-300 text-white',
      fn: 'bg-gray-300 hover:bg-gray-200 text-gray-900',
      num: 'bg-gray-700 hover:bg-gray-600 text-white',
      eq: 'bg-amber-400 hover:bg-amber-300 text-white',
    }
    return (
      <button key={label} onClick={onClick}
        className={cn('h-12 rounded-full text-lg font-medium transition-colors', colors[variant])}
      >{label}</button>
    )
  }

  return (
    <div className="bg-black p-3 space-y-2">
      <div className="text-right">
        <p className="text-gray-400 text-xs h-4">{prev}{op ? ` ${op}` : ''}</p>
        <p className="text-white text-3xl font-light truncate">{display}</p>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {btn('C', handleClear, 'fn')}
        {btn('+/-', handleToggleSign, 'fn')}
        {btn('%', handlePercent, 'fn')}
        {btn('÷', () => handleOp('÷'), 'op')}
        {btn('7', () => handleDigit('7'), 'num')}
        {btn('8', () => handleDigit('8'), 'num')}
        {btn('9', () => handleDigit('9'), 'num')}
        {btn('×', () => handleOp('×'), 'op')}
        {btn('4', () => handleDigit('4'), 'num')}
        {btn('5', () => handleDigit('5'), 'num')}
        {btn('6', () => handleDigit('6'), 'num')}
        {btn('−', () => handleOp('-'), 'op')}
        {btn('1', () => handleDigit('1'), 'num')}
        {btn('2', () => handleDigit('2'), 'num')}
        {btn('3', () => handleDigit('3'), 'num')}
        {btn('+', () => handleOp('+'), 'op')}
        <button onClick={() => handleDigit('0')}
          className="col-span-2 h-12 rounded-full bg-gray-700 hover:bg-gray-600 text-white text-lg font-medium text-left pl-5">0</button>
        {btn('.', () => handleDigit('.'), 'num')}
        {btn('=', handleEquals, 'eq')}
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

function RoomScanModal({
  sessionId, token, trigger, onComplete,
}: {
  sessionId: string
  token: string
  trigger: 'PRE_TEST' | 'MID_TEST'
  onComplete: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const [step, setStep] = useState<'intro' | 'recording' | 'uploading' | 'done' | 'error'>('intro')
  const [countdown, setCountdown] = useState(60)
  const [camError, setCamError] = useState(false)

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      .then(stream => {
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(() => setCamError(true))
    return () => { streamRef.current?.getTracks().forEach(t => t.stop()) }
  }, [])

  const startRecording = () => {
    if (!streamRef.current) return
    chunksRef.current = []

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm'
    const recorder = new MediaRecorder(streamRef.current, { mimeType })
    recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    recorder.onstop = async () => {
      setStep('uploading')
      try {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' })
        const formData = new FormData()
        formData.append('file', blob, 'room-scan.webm')
        await api.post(
          `/proctoring/${sessionId}/room-scan?token=${token}&trigger=${trigger}`,
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        )
      } catch { /* best-effort */ }
      setStep('done')
    }
    recorderRef.current = recorder
    recorder.start(1000)
    setStep('recording')

    let remaining = 60
    const tick = setInterval(() => {
      remaining--
      setCountdown(remaining)
      if (remaining <= 0) {
        clearInterval(tick)
        if (recorder.state !== 'inactive') recorder.stop()
      }
    }, 1000)
  }

  return (
    <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
      <div className="bg-primary/10 px-6 py-4 border-b flex items-center gap-3">
        <Video className="h-5 w-5 text-primary shrink-0" />
        <div>
          <h2 className="text-lg font-bold text-gray-900">
            {trigger === 'PRE_TEST' ? 'Pre-Test Room Scan' : 'Periodic Room Check'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {trigger === 'PRE_TEST'
              ? 'Show your surroundings before starting the assessment'
              : 'A brief room verification is required to continue'}
          </p>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {camError ? (
          <div className="text-center space-y-3 py-4">
            <p className="text-sm text-muted-foreground">Camera not available. You may continue.</p>
            <Button className="w-full" onClick={onComplete}>Continue</Button>
          </div>
        ) : (
          <>
            <div className="relative bg-gray-900 rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
              {step === 'recording' && (
                <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                  <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                  REC {countdown}s
                </div>
              )}
            </div>

            {step === 'intro' && (
              <div className="space-y-3">
                <ul className="text-sm text-gray-600 space-y-1.5">
                  <li>• Slowly rotate your camera to show the entire room</li>
                  <li>• Include your desk, walls, and any visible screens</li>
                  <li>• Recording stops automatically after 60 seconds</li>
                </ul>
                <Button className="w-full" onClick={startRecording}>
                  Start Room Scan (60 seconds)
                </Button>
              </div>
            )}

            {step === 'recording' && (
              <div className="text-center space-y-1.5">
                <div className="text-5xl font-mono font-bold text-gray-900 tabular-nums">{countdown}s</div>
                <p className="text-sm text-muted-foreground">Slowly show your entire room…</p>
              </div>
            )}

            {step === 'uploading' && (
              <div className="flex items-center justify-center gap-2 py-4">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Saving room scan…</span>
              </div>
            )}

            {step === 'done' && (
              <div className="space-y-3 text-center">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                  <span className="text-2xl text-green-600">✓</span>
                </div>
                <p className="text-sm text-gray-600">
                  {trigger === 'PRE_TEST' ? 'Room scan complete. You may now begin.' : 'Verification complete. You may continue.'}
                </p>
                <Button className="w-full" onClick={onComplete}>
                  {trigger === 'PRE_TEST' ? 'Begin Assessment' : 'Continue Test'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
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
