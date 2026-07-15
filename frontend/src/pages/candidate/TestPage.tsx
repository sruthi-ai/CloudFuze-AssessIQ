import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Clock, ChevronLeft, ChevronRight, Send, Loader2,
  Camera, CameraOff, Maximize, Video, FileText, CalculatorIcon, X as XIcon, XCircle, AlertTriangle,
  Bookmark, BookmarkCheck, HelpCircle, MessageSquare, Mic, Square, Volume2,
} from 'lucide-react'
import MonacoEditor from '@monaco-editor/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { api, getErrorMessage } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { useProctoring } from '@/hooks/useProctoring'
import { useScreenRecorder } from '@/hooks/useScreenRecorder'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { ProctoringSetup } from '@/components/proctoring/ProctoringSetup'
import { SebGate } from '@/components/SebGate'
import { formatSeconds, cn } from '@/lib/utils'

interface AnswerState {
  selectedOptions: string[]
  responseText: string
  numericValue: string
  codeSubmission: string
  language: string
  timeSpent: number
  fileUrl: string
  audioUrl: string
}

const emptyAnswer = (): AnswerState => ({
  selectedOptions: [], responseText: '', numericValue: '',
  codeSubmission: '', language: 'python', timeSpent: 0,
  fileUrl: '', audioUrl: '',
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

  const [testStep, setTestStep] = useState<'instructions' | 'setup' | 'room-scan' | 'test'>(isPractice ? 'test' : 'instructions')
  const [honorAccepted, setHonorAccepted] = useState(false)
  const [currentSectionIdx, setCurrentSectionIdx] = useState(0)
  const [currentQIdx, setCurrentQIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({})
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null)
  const [questionStartTime, setQuestionStartTime] = useState(Date.now())
  const [submitting, setSubmitting] = useState(false)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const [sectionTimeRemaining, setSectionTimeRemaining] = useState<number | null>(null)
  const [showTools, setShowTools] = useState(false)
  const [toolsTab, setToolsTab] = useState<'notes' | 'calc'>('notes')
  const [scratchpad, setScratchpad] = useState('')
  const [calcDisplay, setCalcDisplay] = useState('0')
  const [calcPrev, setCalcPrev] = useState('')
  const [calcOp, setCalcOp] = useState<string | null>(null)
  const [calcJustEval, setCalcJustEval] = useState(false)
  const [flaggedQuestions, setFlaggedQuestions] = useState<Set<string>>(new Set())
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [showConcernPanel, setShowConcernPanel] = useState(false)
  const [concernMsg, setConcernMsg] = useState('')
  const [concernSending, setConcernSending] = useState(false)
  const [concernSent, setConcernSent] = useState(false)
  const timerWarned5Ref = useRef(false)
  const timerWarned1Ref = useRef(false)
  const sectionExpireRef = useRef<(() => void) | null>(null)

  const proctoring = !isPractice && inviteData?.test?.proctoring !== false
  // Pre-test room scan only (mid-test scans went with violation enforcement).
  const roomScanEnabled = proctoring && inviteData?.test?.roomScanEnabled === true
  const roomScanIntervalMins: number = inviteData?.test?.roomScanIntervalMins ?? 20
  const brandColor = inviteData?.test?.tenant?.primaryColor ?? '#6366f1'

  // Lockdown is Safe Exam Browser now (legacy AssessIQ Electron browser retired).
  const lockdownRequired = !isPractice && (inviteData?.test?.sebRequired === true || inviteData?.test?.requireSecureBrowser === true)
  const inSeb = /\bSEB\b/.test(navigator.userAgent)
  // Legacy AssessIQ Electron bridge (no-op unless that browser is still in use).
  const isSecureBrowser = !!(window as any).__SECURE_BROWSER__

  useEffect(() => {
    document.documentElement.style.setProperty('--brand-primary', brandColor)
    return () => { document.documentElement.style.removeProperty('--brand-primary') }
  }, [brandColor])

  const candidateName = practiceName
    ?? (inviteData?.candidate
      ? `${inviteData.candidate.firstName ?? ''} ${inviteData.candidate.lastName ?? ''}`.trim()
      : undefined)

  // Violation ENFORCEMENT is fully removed from the candidate experience (by
  // explicit product decision after live batches): no banners, no tab-switch
  // warning modal, no violation scoring, no auto-disqualify, no mid-test room
  // scan triggers. Proctoring = webcam with periodic snapshots + silent
  // background event logs for the record. Candidates are never interrupted.
  const handleTabReturn = useCallback(() => { /* no candidate-facing reaction */ }, [])
  const handleViolation = useCallback((_type: string, _count: number) => { /* silent — events still logged server-side */ }, [])

  const {
    pushEvent, pushImmediate, stopProctoring, requestFullscreen, flush,
    attachVideoRef,
    webcamActive, micActive,
    violationCounts,
  } = useProctoring({
    sessionId,
    token: token ?? '',
    enabled: proctoring,
    candidateName,
    onTabReturn: handleTabReturn,
    onViolation: handleViolation,
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
      (window as any).__secureBrowserBridge__?.setSession(sessionId, token)
    }
  }, [isSecureBrowser, sessionId, token])

  useEffect(() => {
    if (timeRemaining === null) return
    if (timeRemaining <= 0) { handleSubmit(); return }
    // Timer warnings
    if (timeRemaining <= 300 && !timerWarned5Ref.current) {
      timerWarned5Ref.current = true
      toast({ title: '⏰ 5 minutes remaining', description: 'Please review and submit your answers.', variant: 'default' })
    }
    if (timeRemaining <= 60 && !timerWarned1Ref.current) {
      timerWarned1Ref.current = true
      toast({ title: '🚨 1 minute remaining!', description: 'Your test will auto-submit when the timer reaches zero.', variant: 'destructive' })
    }
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

  // Reset section timer whenever the section changes — guarded by a ref so the
  // 30s background refetch of testData (a new object reference each time) can't
  // re-trigger this and snap the countdown back to the full limit mid-section.
  const timerInitSectionRef = useRef<number | null>(null)
  useEffect(() => {
    const secs = testData?.sections ?? []
    if (secs.length === 0) return
    if (timerInitSectionRef.current === currentSectionIdx) return
    timerInitSectionRef.current = currentSectionIdx
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
        (window as any).__secureBrowserBridge__?.notifySubmitted()
      }
      navigate(`/take/${token}/done`, { state: { result: res.data.data, isPractice, sessionId }, replace: true })
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

  // Clamp out-of-range indices. A pending auto-advance firing with a stale closure
  // (e.g. a recording's 800ms advance landing after the user already navigated)
  // could push the index past the section's last question — rendering an empty
  // "Question 2 of 1" card with no way to answer anything.
  useEffect(() => {
    if (sections.length > 0 && currentSectionIdx > sections.length - 1) {
      setCurrentSectionIdx(sections.length - 1)
      setCurrentQIdx(0)
    } else if (questions.length > 0 && currentQIdx > questions.length - 1) {
      setCurrentQIdx(questions.length - 1)
    }
  }, [currentQIdx, currentSectionIdx, questions.length, sections.length])

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

  // Explicit-questionId write — used by async flows (audio upload resolution) so a
  // late-resolving upload can never be attributed to whatever question happens to
  // be current by then.
  const updateAnswerFor = (questionId: string, patch: Partial<AnswerState>) => {
    setAnswers(prev => ({ ...prev, [questionId]: { ...(prev[questionId] ?? emptyAnswer()), ...patch } }))
  }
  const updateAnswer = (patch: Partial<AnswerState>) => {
    if (!currentQ) return
    updateAnswerFor(currentQ.questionId, patch)
  }

  const totalQuestions = sections.reduce((a: number, s: any) => a + s.questions.length, 0)
  // "Answered" = saved on the server (q.answered — survives revisits, reloads and a
  // second tab) OR answered locally this page load (covers the gap until the next
  // 30s questions refetch). Local-only state previously made recorded answers look
  // lost when navigating back, left the sidebar unmarked, and kept the counter at 0.
  const isAnsweredLocal = (a?: AnswerState) =>
    !!a && (a.selectedOptions.length > 0 || !!a.responseText || !!a.numericValue || !!a.codeSubmission || !!a.fileUrl || !!a.audioUrl)
  const answeredCount = sections.reduce(
    (n: number, s: any) => n + s.questions.filter((q: any) => q.answered || isAnsweredLocal(answers[q.questionId])).length, 0)
  const isLastQuestion = currentSectionIdx === sections.length - 1 && currentQIdx === questions.length - 1
  const isCodingQ = currentQ?.question.type === 'CODE'

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

  // ── Safe Exam Browser gate ─────────────────────────────────────────────────
  if (lockdownRequired && !inSeb) {
    return (
      <SebGate
        testTitle={inviteData?.test?.title}
        tenantName={inviteData?.test?.tenant?.name}
        token={token ?? ''}
      />
    )
  }

  // ── Instructions + honor code step ────────────────────────────────────────
  if (testStep === 'instructions') {
    const test = inviteData?.test
    const sections = testData?.sections ?? []
    const totalQ = sections.reduce((a: number, s: any) => a + (s.questions?.length ?? 0), 0)
    const brandCol = brandColor

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl space-y-5">
          {/* Header */}
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="h-2" style={{ background: brandCol }} />
            <div className="p-6 space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <span>{test?.tenant?.name}</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">{test?.title ?? 'Assessment'}</h1>
              <div className="flex flex-wrap gap-4 mt-3 text-sm text-gray-600">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <strong>{test?.duration ?? '--'} minutes</strong>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-4 w-4 text-gray-400 text-center font-bold">Q</span>
                  <strong>{totalQ} questions</strong>
                </span>
                {sections.length > 1 && (
                  <span className="flex items-center gap-1.5">
                    <span className="text-gray-400">§</span>
                    <strong>{sections.length} sections</strong>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Sections breakdown */}
          {sections.length > 0 && (
            <div className="bg-white rounded-xl border shadow-sm p-5 space-y-3">
              <h2 className="font-semibold text-gray-800">Sections</h2>
              <div className="divide-y">
                {sections.map((s: any, i: number) => (
                  <div key={s.id} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="font-medium text-gray-700">{i + 1}. {s.title}</span>
                    <div className="flex gap-4 text-muted-foreground text-xs">
                      <span>{s.questions?.length ?? 0} question{(s.questions?.length ?? 0) === 1 ? '' : 's'}</span>
                      {/* timeLimit is stored in SECONDS — was rendered raw as "600 min" */}
                      {s.timeLimit && <span>{Math.round(s.timeLimit / 60)} min</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rules */}
          <div className="bg-white rounded-xl border shadow-sm p-5 space-y-3">
            <h2 className="font-semibold text-gray-800">Exam Rules</h2>
            <ul className="space-y-2 text-sm text-gray-700">
              {[
                'The timer starts as soon as you click "Begin Assessment" and cannot be paused.',
                'Do not switch browser tabs or open other applications — this will be recorded.',
                'Your webcam must remain active and your face visible throughout the exam.',
                'Do not seek help from any other person or resource during the assessment.',
                'Refreshing the page will not reset the timer — your answers are auto-saved.',
                'The assessment will auto-submit when the timer reaches zero.',
                proctoring ? 'Your camera, microphone, and screen may be monitored during this assessment.' : null,
              ].filter(Boolean).map((rule, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-xs font-medium">{i + 1}</span>
                  {rule}
                </li>
              ))}
            </ul>
          </div>

          {/* Honor code */}
          <div className="bg-white rounded-xl border shadow-sm p-5">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-indigo-600"
                checked={honorAccepted}
                onChange={e => setHonorAccepted(e.target.checked)}
              />
              <span className="text-sm text-gray-700">
                I have read and understood the exam rules. I confirm that I will complete this assessment independently, without external assistance, and that my answers represent my own work. I understand that this session may be monitored and violations will be recorded.
              </span>
            </label>
          </div>

          <Button
            className="w-full"
            size="lg"
            disabled={!honorAccepted}
            onClick={() => setTestStep(proctoring ? 'setup' : 'test')}
          >
            {proctoring ? 'Continue to Camera Setup →' : 'Begin Assessment →'}
          </Button>
        </div>
      </div>
    )
  }

  // ── Proctoring setup step ──────────────────────────────────────────────────
  if (proctoring && testStep === 'setup') {
    return (
      <ProctoringSetup
        attachVideoRef={attachVideoRef}
        webcamActive={webcamActive}
        micActive={micActive}
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
            title="Notes — scratch pad"
            aria-label="Notes — scratch pad"
            className="shrink-0 p-1.5 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-700"
          >
            <HelpCircle className="h-5 w-5" />
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

      {/* Scratch pad (notes only) */}
      {showTools && (
        <div className="fixed bottom-32 right-4 w-72 bg-white rounded-xl shadow-2xl border z-40 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b">
            <span className="px-1 py-1 text-xs font-medium text-gray-900 flex items-center gap-1">
              <FileText className="h-3 w-3" />Notes
            </span>
            <button onClick={() => setShowTools(false)} className="text-gray-400 hover:text-gray-600">
              <XIcon className="h-4 w-4" />
            </button>
          </div>

          <textarea
            className="w-full h-48 p-3 text-sm resize-none focus:outline-none font-mono"
            placeholder="Scratch pad — notes are not saved"
            value={scratchpad}
            onChange={e => setScratchpad(e.target.value)}
          />
        </div>
      )}

      {/* ── Split-screen layout for CODE questions ── */}
      {isCodingQ && currentQ && (
        <div className="flex flex-1 w-full overflow-hidden" style={{ height: 'calc(100vh - 56px)' }}>
          {/* Left: problem statement */}
          <div className="w-[42%] min-w-0 border-r bg-white overflow-y-auto p-5 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline">CODE</Badge>
              <span className="text-xs text-muted-foreground">{currentQ.points} pt{currentQ.points !== 1 ? 's' : ''}</span>
              {currentQ.isRequired && <span className="text-xs text-red-500">Required</span>}
              <span className="text-xs text-muted-foreground ml-auto">Q{currentQIdx + 1}/{questions.length}</span>
            </div>
            <p className="text-base font-medium leading-relaxed whitespace-pre-wrap text-gray-900">{currentQ.question.body}</p>
            <div className="flex items-center gap-2 pt-2 border-t">
              <button
                onClick={() => setFlaggedQuestions(prev => { const n = new Set(prev); n.has(currentQ.questionId) ? n.delete(currentQ.questionId) : n.add(currentQ.questionId); return n })}
                className={cn('flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors',
                  flaggedQuestions.has(currentQ.questionId) ? 'text-amber-600 bg-amber-50' : 'text-gray-400 hover:text-amber-600 hover:bg-amber-50'
                )}
              >
                {flaggedQuestions.has(currentQ.questionId) ? <><BookmarkCheck className="h-3.5 w-3.5" /> Marked</> : <><Bookmark className="h-3.5 w-3.5" /> Mark for review</>}
              </button>
              <div className="flex gap-2 ml-auto">
                <Button variant="outline" size="sm" onClick={goToPrev} disabled={currentSectionIdx === 0 && currentQIdx === 0}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {isLastQuestion ? (
                  <Button size="sm" onClick={() => setShowReviewModal(true)} className="gap-1">
                    <Send className="h-3.5 w-3.5" />Finish
                  </Button>
                ) : (
                  <Button size="sm" onClick={goToNext}>
                    Next <ChevronRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
          {/* Right: IDE */}
          <div className="flex-1 min-w-0 overflow-hidden bg-gray-950 flex flex-col">
            <QuestionInput
              key={currentQ.questionId}
              question={currentQ.question}
              answer={currentAnswer}
              onChange={updateAnswer}
              onAnswerSaved={updateAnswerFor}
              sessionId={sessionId}
              token={token ?? ''}
              serverAnswered={currentQ.answered}
            />
          </div>
        </div>
      )}

      {/* ── Standard layout for non-CODE questions ── */}
      {!isCodingQ && <div className="flex flex-1 max-w-5xl mx-auto w-full px-4 py-6 gap-6">
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

          {/* Section-level Listening audio: one clip for all questions in this section.
              Keyed by section id so playback state persists as the candidate moves
              between questions, and resets (re-mounts) when the section changes. */}
          {currentSection?.audioAsset && (
            <Card className="border-indigo-200">
              <CardContent className="p-4">
                <p className="text-sm font-semibold text-indigo-900 mb-2">
                  Listening audio — for the questions in “{currentSection.title}”
                </p>
                <AudioPrompt
                  key={currentSection.id}
                  audioAsset={currentSection.audioAsset}
                  sessionId={sessionId}
                  token={token ?? ''}
                />
              </CardContent>
            </Card>
          )}

          {currentQ && (
            <Card>
              <CardContent className="p-6 space-y-5">
                <div>
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Badge variant="outline">{currentQ.question.type.replace(/_/g, ' ')}</Badge>
                    <span className="text-xs text-muted-foreground">{currentQ.points} pt{currentQ.points !== 1 ? 's' : ''}</span>
                    {currentQ.isRequired && <span className="text-xs text-red-500">Required</span>}
                    <button
                      onClick={() => setFlaggedQuestions(prev => {
                        const next = new Set(prev)
                        if (next.has(currentQ.questionId)) next.delete(currentQ.questionId)
                        else next.add(currentQ.questionId)
                        return next
                      })}
                      className={cn('ml-auto flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors',
                        flaggedQuestions.has(currentQ.questionId)
                          ? 'text-amber-600 bg-amber-50 hover:bg-amber-100'
                          : 'text-gray-400 hover:text-amber-600 hover:bg-amber-50'
                      )}
                      title="Mark for review"
                    >
                      {flaggedQuestions.has(currentQ.questionId)
                        ? <><BookmarkCheck className="h-3.5 w-3.5" /> Marked</>
                        : <><Bookmark className="h-3.5 w-3.5" /> Mark for review</>}
                    </button>
                  </div>
                  <p className="text-base font-medium leading-relaxed whitespace-pre-wrap">{currentQ.question.body}</p>
                </div>

                {currentQ.question.audioAsset && (
                  <AudioPrompt
                    audioAsset={currentQ.question.audioAsset}
                    sessionId={sessionId}
                    token={token ?? ''}
                  />
                )}

                <QuestionInput
                  key={currentQ.questionId}
                  question={currentQ.question}
                  answer={currentAnswer}
                  onChange={updateAnswer}
                  onAnswerSaved={updateAnswerFor}
                  sessionId={sessionId}
                  token={token ?? ''}
                  onAutoAdvance={goToNext}
                  serverAnswered={currentQ.answered}
                />
              </CardContent>
            </Card>
          )}

          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" onClick={goToPrev} disabled={currentSectionIdx === 0 && currentQIdx === 0}>
              <ChevronLeft className="h-4 w-4 mr-1" />Previous
            </Button>

            {isLastQuestion ? (
              <Button onClick={() => setShowReviewModal(true)} className="gap-2">
                <Send className="h-4 w-4" />Finish Test
              </Button>
            ) : (
              <Button onClick={goToNext}>
                Next<ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        {/* Submission review modal */}
        {showReviewModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
              <h2 className="text-xl font-bold text-gray-900">Review before submitting</h2>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-green-50 rounded-lg p-3">
                  <p className="text-2xl font-bold text-green-700">{answeredCount}</p>
                  <p className="text-xs text-green-600 mt-0.5">Answered</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-3">
                  <p className="text-2xl font-bold text-amber-700">{flaggedQuestions.size}</p>
                  <p className="text-xs text-amber-600 mt-0.5">For review</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-2xl font-bold text-gray-700">{totalQuestions - answeredCount}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Unanswered</p>
                </div>
              </div>

              {totalQuestions - answeredCount > 0 && (
                <div className="text-sm text-gray-600 bg-orange-50 border border-orange-200 rounded-lg p-3">
                  <p className="font-medium text-orange-800 mb-1">⚠ Unanswered questions</p>
                  <p>Unanswered questions will receive 0 points. You can go back and answer them before submitting.</p>
                </div>
              )}

              {flaggedQuestions.size > 0 && (
                <div className="text-sm text-gray-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="font-medium text-amber-800">📌 You have {flaggedQuestions.size} question{flaggedQuestions.size > 1 ? 's' : ''} marked for review.</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowReviewModal(false)}>
                  Back to Test
                </Button>
                <Button className="flex-1 gap-2" onClick={() => { setShowReviewModal(false); handleSubmit() }} disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Confirm Submit
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Raise concern panel */}
        {showConcernPanel && (
          <div className="fixed bottom-20 left-4 w-80 bg-white rounded-xl shadow-2xl border z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-indigo-600">
              <div className="flex items-center gap-2 text-white">
                <MessageSquare className="h-4 w-4" />
                <span className="text-sm font-medium">Flag a concern</span>
              </div>
              <button onClick={() => { setShowConcernPanel(false); setConcernSent(false); setConcernMsg('') }} className="text-white/70 hover:text-white">
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {concernSent ? (
                <div className="text-center py-4 space-y-2">
                  <div className="text-green-600 text-2xl">✓</div>
                  <p className="text-sm font-medium text-gray-900">Concern received</p>
                  <p className="text-xs text-muted-foreground">The proctor has been notified. Your timer is still running.</p>
                  <Button size="sm" variant="outline" className="w-full mt-2" onClick={() => { setShowConcernPanel(false); setConcernSent(false); setConcernMsg('') }}>
                    Close
                  </Button>
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">Describe your issue. Your timer continues running — this will not pause the exam.</p>
                  <textarea
                    rows={3}
                    maxLength={500}
                    className="w-full text-sm border rounded-md p-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g. Camera not working, question is unclear, technical issue..."
                    value={concernMsg}
                    onChange={e => setConcernMsg(e.target.value)}
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{concernMsg.length}/500</span>
                    <Button
                      size="sm"
                      disabled={!concernMsg.trim() || concernSending}
                      onClick={async () => {
                        setConcernSending(true)
                        try {
                          await api.post(`/sessions/${sessionId}/raise-concern`, { token, message: concernMsg.trim() })
                          setConcernSent(true)
                        } catch {
                          toast({ title: 'Could not send concern', description: 'Please try again', variant: 'destructive' })
                        } finally {
                          setConcernSending(false)
                        }
                      }}
                    >
                      {concernSending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                      Send to Proctor
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Raise concern floating button */}
        {testStep === 'test' && (
          <button
            onClick={() => setShowConcernPanel(s => !s)}
            className="fixed bottom-4 left-4 flex items-center gap-1.5 bg-white border shadow-md rounded-full px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 z-40 transition-colors"
            title="Flag a concern to the proctor"
          >
            <HelpCircle className="h-4 w-4 text-indigo-500" />
            Help
          </button>
        )}

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
                    // Server flag OR local state — see isAnsweredLocal above.
                    const answered = q.answered || isAnsweredLocal(answers[q.questionId])
                    const isCurrent = sIdx === currentSectionIdx && qIdx === currentQIdx
                    const isFlagged = flaggedQuestions.has(q.questionId)
                    return (
                      <button
                        key={q.questionId}
                        onClick={() => saveCurrentAndGo(() => { setCurrentSectionIdx(sIdx); setCurrentQIdx(qIdx) })}
                        className={cn(
                          'h-8 w-8 rounded text-xs font-medium transition-colors',
                          isCurrent ? 'bg-primary text-white' :
                          isFlagged ? 'bg-amber-100 text-amber-700 border border-amber-300' :
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
              <div className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-amber-100 border border-amber-300" />For review</div>
              <div className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-gray-100" />Unanswered</div>
              <div className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-primary" />Current</div>
            </div>

          </div>
        </aside>
      </div>}
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
    const r = op === '+' ? a + b : op === '-' ? a - b : op === '×' ? a * b : b !== 0 ? a / b : NaN
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

function AudioPrompt({ audioAsset, sessionId, token }: {
  audioAsset: { id: string; url: string; playLimit: number; playsUsed: number }
  sessionId: string; token: string
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playsUsed, setPlaysUsed] = useState(audioAsset.playsUsed)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const unlimited = audioAsset.playLimit === 0
  const remaining = unlimited ? Infinity : Math.max(0, audioAsset.playLimit - playsUsed)
  const canPlay = !playing && !loading && (unlimited || remaining > 0)
  const fullUrl = `${import.meta.env.VITE_API_URL ?? ''}${audioAsset.url}`

  const handlePlay = async () => {
    setError('')
    setLoading(true)
    try {
      const res = await api.post(`/sessions/${sessionId}/audio-play`, { token, assetId: audioAsset.id })
      const { allowed, playsUsed: used } = res.data.data
      setPlaysUsed(used)
      if (!allowed) { setLoading(false); return }
      const el = audioRef.current
      if (el) {
        el.currentTime = 0
        await el.play()
        setPlaying(true)
      }
    } catch (err) {
      setError(getErrorMessage(err) || 'Could not start playback — please try again.')
    } finally {
      setLoading(false)
    }
  }

  // The <audio> element can fail asynchronously (network hiccup, slow load) even
  // after el.play() has already resolved — without this the button was left stuck
  // on "Playing…" forever with no sound and no way to retry.
  const handleMediaError = () => {
    setPlaying(false)
    setError('Playback failed — check your connection and try again.')
  }

  return (
    <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 p-3 space-y-2">
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" onClick={handlePlay} disabled={!canPlay}>
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Volume2 className="h-4 w-4 mr-2" />}
          {playing ? 'Playing…' : error ? 'Retry audio' : 'Play audio'}
        </Button>
        <span className="text-xs text-indigo-800">
          {unlimited
            ? 'You may replay this audio as needed.'
            : remaining > 0
              ? `Plays remaining: ${remaining} of ${audioAsset.playLimit}`
              : 'No plays remaining'}
        </span>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {/* No native controls — playback is gated through the server-side play-limit check */}
      <audio ref={audioRef} src={fullUrl} onEnded={() => setPlaying(false)} onError={handleMediaError} className="hidden" />
    </div>
  )
}

function QuestionInput({ question, answer, onChange, onAnswerSaved, sessionId, token, onAutoAdvance, serverAnswered }: {
  question: any; answer: AnswerState; onChange: (p: Partial<AnswerState>) => void
  onAnswerSaved?: (questionId: string, p: Partial<AnswerState>) => void  // explicit-id write for async saves
  sessionId: string; token: string; onAutoAdvance?: () => void
  serverAnswered?: boolean  // the server's persisted "answered" flag — survives revisits/reloads
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

    case 'AUDIO_RECORDING':
      return (
        <AudioRecordingQuestion
          answer={answer} onChange={onChange} onAnswerSaved={onAnswerSaved}
          questionId={question.id} sessionId={sessionId} token={token}
          prepSeconds={question.prepSeconds ?? 0} speakSeconds={question.speakSeconds ?? null}
          onAutoAdvance={onAutoAdvance}
          serverAnswered={serverAnswered}
        />
      )

    case 'FILE_UPLOAD':
      return (
        <FileUploadQuestion
          answer={answer} onChange={onChange}
          questionId={question.id} sessionId={sessionId} token={token}
        />
      )

    default:
      return <p className="text-sm text-muted-foreground italic">This question type is not yet supported.</p>
  }
}

function AudioRecordingQuestion({ answer, onChange, onAnswerSaved, questionId, sessionId, token, prepSeconds, speakSeconds, onAutoAdvance, serverAnswered }: {
  answer: AnswerState; onChange: (p: Partial<AnswerState>) => void
  onAnswerSaved?: (questionId: string, p: Partial<AnswerState>) => void
  questionId: string; sessionId: string; token: string
  prepSeconds: number; speakSeconds: number | null; onAutoAdvance?: () => void
  serverAnswered?: boolean
}) {
  const { permission, recording, uploading, previewUrl, start, stopAndUpload } = useAudioRecorder()
  const queryClient = useQueryClient()
  const timed = typeof speakSeconds === 'number' && speakSeconds > 0
  // Local audioUrl (this page load) OR the server's persisted flag. Without the
  // server flag, revisiting an already-recorded question showed the prep screen
  // again — candidates believed their recording was lost (it wasn't) and timed
  // questions would even re-enter the auto-record cascade, overwriting the
  // earlier answer with silence.
  const alreadyAnswered = !!answer.audioUrl || !!serverAnswered

  const handleStop = async () => {
    const audioUrl = await stopAndUpload(sessionId, token, questionId)
    if (audioUrl) {
      // Explicit-id write: an upload that resolves after navigation must still be
      // credited to THIS question, never whichever is current by then.
      if (onAnswerSaved) onAnswerSaved(questionId, { audioUrl })
      else onChange({ audioUrl })
      // Pull the server's answered flags right away (instead of the 30s poll) so
      // every "is this answered?" surface agrees immediately after an upload.
      queryClient.invalidateQueries({ queryKey: ['test-questions', sessionId] })
    }
    return audioUrl
  }

  // Salvage on unmount: if the candidate navigates away mid-recording (Next/Previous/
  // section auto-advance), stop the recorder and upload what was captured. Previously
  // the recorder was silently abandoned — the take was never uploaded (answer lost)
  // and the mic was left running.
  const salvageRef = useRef<() => void>(() => {})
  salvageRef.current = () => { if (recording) void handleStop() }
  useEffect(() => () => salvageRef.current(), [])

  // ── Timed Speaking mode: prep countdown → auto-record → speak countdown → auto-stop → advance ──
  if (timed) {
    return (
      <TimedSpeaking
        prepSeconds={prepSeconds}
        speakSeconds={speakSeconds as number}
        uploading={uploading}
        permission={permission}
        previewUrl={previewUrl}
        alreadyAnswered={alreadyAnswered}
        start={start}
        stopAndUpload={handleStop}
        onAutoAdvance={onAutoAdvance}
      />
    )
  }

  // ── Free-form mode (unchanged): manual start/stop/re-record ──
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {!recording ? (
          <Button type="button" variant="outline" onClick={start} disabled={uploading}>
            <Mic className="h-4 w-4 mr-2" />
            {alreadyAnswered ? 'Re-record answer' : 'Start recording'}
          </Button>
        ) : (
          <Button type="button" variant="destructive" onClick={handleStop}>
            <Square className="h-4 w-4 mr-2" />
            Stop recording
          </Button>
        )}
        {recording && <span className="text-sm text-red-600 animate-pulse">Recording…</span>}
        {uploading && <span className="text-sm text-muted-foreground">Uploading…</span>}
      </div>
      {permission === 'denied' && (
        <p className="text-xs text-red-600">Microphone access was denied. Please allow microphone access to record your answer.</p>
      )}
      {previewUrl && !recording && (
        <audio controls src={previewUrl} className="w-full" />
      )}
      {alreadyAnswered && !previewUrl && !recording && (
        <p className="text-xs text-green-700">Your recorded answer has been saved.</p>
      )}
    </div>
  )
}

function TimedSpeaking({ prepSeconds, speakSeconds, uploading, permission, previewUrl, alreadyAnswered, start, stopAndUpload, onAutoAdvance }: {
  prepSeconds: number; speakSeconds: number
  uploading: boolean; permission: string; previewUrl: string | null
  alreadyAnswered: boolean
  start: () => Promise<boolean>
  stopAndUpload: () => Promise<string | null>
  onAutoAdvance?: () => void
}) {
  // phase: 'prep' → 'recording' → 'done'.  If already answered (revisiting), go straight to done.
  const [phase, setPhase] = useState<'prep' | 'recording' | 'done'>(alreadyAnswered ? 'done' : (prepSeconds > 0 ? 'prep' : 'recording'))
  const [remaining, setRemaining] = useState(prepSeconds > 0 ? prepSeconds : speakSeconds)
  const startedRef = useRef(false)
  const finishedRef = useRef(false)

  // React to a LATE-arriving answered flag (the refetch can land moments after
  // mount). Without this, phase was decided once at mount — a revisited question
  // whose flag arrived a beat later stayed in 'prep', auto-started recording, and
  // cascaded through the whole section re-recording saved answers with silence.
  useEffect(() => {
    if (alreadyAnswered && phase === 'prep' && !startedRef.current) setPhase('done')
  }, [alreadyAnswered, phase])

  const beginRecording = useCallback(async () => {
    if (startedRef.current) return
    startedRef.current = true
    setPhase('recording')
    setRemaining(speakSeconds)
    await start()
  }, [start, speakSeconds])

  // Track the pending advance so it can be cancelled if this question unmounts
  // first (candidate already navigated) — a stale advance firing later walked the
  // index past the end of the section.
  const advanceTimerRef = useRef<number | null>(null)
  useEffect(() => () => { if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current) }, [])

  const finish = useCallback(async () => {
    if (finishedRef.current) return
    finishedRef.current = true
    await stopAndUpload()
    setPhase('done')
    // brief pause so the candidate sees "recorded", then advance
    advanceTimerRef.current = window.setTimeout(() => onAutoAdvance?.(), 800)
  }, [stopAndUpload, onAutoAdvance])

  // Single countdown driving both phases.
  // beginRecording/finish are kept in refs and OUT of the effect deps: their
  // identities change on every parent re-render (the exam clock re-renders the
  // page every second), and with them in the deps this effect tore down and
  // rescheduled its own 1s tick each time — a timer-vs-timer race that could
  // freeze the prep countdown at 0:10 until the candidate clicked manually.
  const beginRecordingRef = useRef(beginRecording)
  const finishRef = useRef(finish)
  useEffect(() => { beginRecordingRef.current = beginRecording; finishRef.current = finish })
  useEffect(() => {
    if (phase === 'done') return
    if (remaining <= 0) {
      if (phase === 'prep') { beginRecordingRef.current() }
      else if (phase === 'recording') { finishRef.current() }
      return
    }
    const t = setTimeout(() => setRemaining(r => r - 1), 1000)
    return () => clearTimeout(t)
  }, [remaining, phase])

  if (phase === 'done') {
    return (
      <div className="space-y-2">
        <p className="text-sm text-green-700 font-medium">✓ Answer recorded.</p>
        {uploading && <p className="text-xs text-muted-foreground">Uploading…</p>}
        {previewUrl && <audio controls src={previewUrl} className="w-full" />}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {phase === 'prep' ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-800">
            <Clock className="h-5 w-5" />
            <span className="font-semibold">Preparation time</span>
          </div>
          <p className="text-3xl font-bold tabular-nums text-amber-900">{formatSeconds(remaining)}</p>
          <p className="text-xs text-amber-700">Recording starts automatically when this reaches 0:00.</p>
          <Button type="button" variant="outline" size="sm" onClick={beginRecording}>
            <Mic className="h-4 w-4 mr-2" /> Start speaking now
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-2">
          <div className="flex items-center gap-2 text-red-700">
            <span className="h-3 w-3 rounded-full bg-red-600 animate-pulse" />
            <span className="font-semibold">Recording — speak now</span>
          </div>
          <p className="text-3xl font-bold tabular-nums text-red-800">{formatSeconds(remaining)}</p>
          <p className="text-xs text-red-600">Recording stops and submits automatically at 0:00.</p>
          <Button type="button" variant="destructive" size="sm" onClick={finish} disabled={uploading}>
            <Square className="h-4 w-4 mr-2" /> Stop &amp; submit
          </Button>
        </div>
      )}
      {permission === 'denied' && (
        <p className="text-xs text-red-600">Microphone access was denied — please allow it so your answer can be recorded.</p>
      )}
    </div>
  )
}

function FileUploadQuestion({ answer, onChange, questionId, sessionId, token }: {
  answer: AnswerState; onChange: (p: Partial<AnswerState>) => void
  questionId: string; sessionId: string; token: string
}) {
  const [uploading, setUploading] = useState(false)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')

  const handleFile = async (e: any) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(
        `${import.meta.env.VITE_API_URL ?? ''}/api/sessions/${sessionId}/answers/${questionId}/media?token=${encodeURIComponent(token)}`,
        { method: 'POST', body: fd }
      )
      const json = await res.json()
      if (!res.ok) {
        setError(json?.error ?? 'Upload failed')
        return
      }
      setFileName(file.name)
      onChange({ fileUrl: json.data.fileUrl })
    } catch {
      setError('Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      <input
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.txt"
        disabled={uploading}
        onChange={handleFile}
        className="text-sm"
      />
      {uploading && <p className="text-xs text-muted-foreground">Uploading…</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {answer.fileUrl && !uploading && (
        <p className="text-xs text-green-700">File uploaded{fileName ? `: ${fileName}` : ''}.</p>
      )}
    </div>
  )
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

      {/* Monaco editor — height fills container in split-screen, fixed otherwise */}
      <div className="rounded-lg overflow-hidden border flex-shrink-0" style={{ height: 'clamp(280px, 45vh, 520px)' }}>
        <MonacoEditor
          height="100%"
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

// ── Guided room scan helpers ───────────────────────────────────────────────────

const SCAN_STEPS = [
  { icon: '👤', label: 'Face the camera',          hint: "Look directly at the camera so we can verify it's you",               secs: 5 },
  { icon: '⬅',  label: 'Show your LEFT side',      hint: 'Slowly pan left — show the wall and area to your left',              secs: 8 },
  { icon: '➡',  label: 'Show your RIGHT side',     hint: 'Pan right — show the full right side of your workspace',             secs: 8 },
  { icon: '⬇',  label: 'Show desk & any screens',  hint: 'Tilt the camera down — reveal your desk surface and extra monitors', secs: 8 },
  { icon: '🔄', label: 'Show behind you',           hint: 'Rotate or physically turn around to show the area behind your seat', secs: 9 },
]

function rsThumb(video: HTMLVideoElement): Uint8ClampedArray | null {
  if (video.readyState < 2 || video.videoWidth === 0) return null
  const c = document.createElement('canvas')
  c.width = 32; c.height = 18
  const ctx = c.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(video, 0, 0, 32, 18)
  return ctx.getImageData(0, 0, 32, 18).data
}

function rsFrameIssue(d: Uint8ClampedArray): 'ceiling' | 'dark' | null {
  const n = d.length / 4
  let sumL = 0
  for (let i = 0; i < d.length; i += 4) sumL += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
  const mean = sumL / n
  let sumV = 0
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    sumV += (l - mean) ** 2
  }
  const sd = Math.sqrt(sumV / n)
  if (sd < 18 && mean > 175) return 'ceiling'
  if (sd < 18 && mean < 35) return 'dark'
  return null
}

function rsFrameDiff(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let sum = 0
  for (let i = 0; i < a.length; i += 4)
    sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])
  return sum / (a.length / 4 * 3 * 255)
}

const RS_WARNING: Record<string, string> = {
  ceiling: 'Camera appears aimed at the ceiling — point it toward the room',
  dark: 'Image too dark — move to a lit area or uncover the camera lens',
  not_moving: "Camera didn't appear to move — please pan to show this area",
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
  const startThumbRef = useRef<Uint8ClampedArray | null>(null)
  const stepFramesRef = useRef<string[]>([])
  const stepIssuesRef = useRef<(string | null)[]>(Array(SCAN_STEPS.length).fill(null))

  const [phase, setPhase] = useState<'intro' | 'scanning' | 'uploading' | 'done'>('intro')
  const [stepIdx, setStepIdx] = useState(0)
  const [stepSecs, setStepSecs] = useState(0)
  const [warning, setWarning] = useState<string | null>(null)
  const [camError, setCamError] = useState(false)

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      .then(stream => { streamRef.current = stream; if (videoRef.current) videoRef.current.srcObject = stream })
      .catch(() => setCamError(true))
    return () => { streamRef.current?.getTracks().forEach(t => t.stop()) }
  }, [])

  // Per-step countdown — re-runs whenever stepIdx changes while scanning
  useEffect(() => {
    if (phase !== 'scanning') return
    setWarning(null)
    setStepSecs(SCAN_STEPS[stepIdx].secs)
    if (videoRef.current) startThumbRef.current = rsThumb(videoRef.current)

    const tick = setInterval(() => {
      setStepSecs(prev => {
        if (prev > 1) return prev - 1
        clearInterval(tick)

        const video = videoRef.current
        let stepIssue: string | null = null

        if (video) {
          const endThumb = rsThumb(video)
          if (endThumb) {
            const issue = rsFrameIssue(endThumb)
            if (issue) {
              stepIssue = issue
              setWarning(RS_WARNING[issue])
            } else if (startThumbRef.current && stepIdx > 0) {
              if (rsFrameDiff(startThumbRef.current, endThumb) < 0.03) {
                stepIssue = 'not_moving'
                setWarning(RS_WARNING.not_moving)
              }
            }
          }

          // Capture full-res frame for panorama stitch
          const fCanvas = document.createElement('canvas')
          fCanvas.width = 320; fCanvas.height = 180
          const fCtx = fCanvas.getContext('2d')
          if (fCtx) {
            fCtx.drawImage(video, 0, 0, 320, 180)
            stepFramesRef.current[stepIdx] = fCanvas.toDataURL('image/jpeg', 0.75)
          }
        }
        stepIssuesRef.current[stepIdx] = stepIssue

        const next = stepIdx + 1
        if (next >= SCAN_STEPS.length) {
          setPhase('uploading')
          if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop()
        } else {
          setStepIdx(next)
        }
        return 0
      })
    }, 1000)
    return () => clearInterval(tick)
  }, [phase, stepIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  const startScan = () => {
    if (!streamRef.current) return
    chunksRef.current = []
    stepFramesRef.current = []
    stepIssuesRef.current = Array(SCAN_STEPS.length).fill(null)
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm'
    const recorder = new MediaRecorder(streamRef.current, { mimeType })
    recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    recorder.onstop = async () => {
      try {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' })

        // Compute quality score: -20 pts per flagged step
        const issues = stepIssuesRef.current
        const badSteps = issues.filter(Boolean).length
        const qualityScore = Math.max(0, 100 - badSteps * 20)
        const qualityFlags: Record<string, string | null> = {}
        SCAN_STEPS.forEach((_, i) => { qualityFlags[String(i)] = issues[i] ?? null })
        const quality = encodeURIComponent(JSON.stringify({ score: qualityScore, flags: qualityFlags }))

        const fd = new FormData()
        fd.append('file', blob, 'room-scan.webm')
        const res = await api.post(
          `/proctoring/${sessionId}/room-scan?token=${token}&trigger=${trigger}&quality=${quality}`,
          fd,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        )
        const scanId: string | undefined = res.data?.data?.id

        // Stitch panorama: 5 frames side-by-side with step labels
        if (scanId) {
          const FRAME_W = 320, FRAME_H = 180
          const pCanvas = document.createElement('canvas')
          pCanvas.width = FRAME_W * SCAN_STEPS.length
          pCanvas.height = FRAME_H
          const pCtx = pCanvas.getContext('2d')
          if (pCtx) {
            for (let i = 0; i < SCAN_STEPS.length; i++) {
              const src = stepFramesRef.current[i]
              if (src) {
                const img = new Image()
                const loaded = await new Promise<boolean>(resolve => {
                  img.onload = () => resolve(true)
                  img.onerror = () => resolve(false)
                  img.src = src
                })
                if (loaded) pCtx.drawImage(img, i * FRAME_W, 0, FRAME_W, FRAME_H)
                else { pCtx.fillStyle = '#374151'; pCtx.fillRect(i * FRAME_W, 0, FRAME_W, FRAME_H) }
              } else {
                pCtx.fillStyle = '#374151'
                pCtx.fillRect(i * FRAME_W, 0, FRAME_W, FRAME_H)
              }
              // Step label bar
              pCtx.fillStyle = 'rgba(0,0,0,0.55)'
              pCtx.fillRect(i * FRAME_W, FRAME_H - 22, FRAME_W, 22)
              pCtx.fillStyle = issues[i] ? '#fbbf24' : '#fff'
              pCtx.font = '11px sans-serif'
              pCtx.textAlign = 'center'
              pCtx.fillText(SCAN_STEPS[i].label, i * FRAME_W + FRAME_W / 2, FRAME_H - 7)
              // Divider line between frames
              if (i > 0) {
                pCtx.strokeStyle = 'rgba(255,255,255,0.25)'
                pCtx.lineWidth = 1
                pCtx.beginPath(); pCtx.moveTo(i * FRAME_W, 0); pCtx.lineTo(i * FRAME_W, FRAME_H); pCtx.stroke()
              }
            }
            const pBlob = await new Promise<Blob | null>(resolve => pCanvas.toBlob(resolve, 'image/jpeg', 0.82))
            if (pBlob) {
              const pFd = new FormData()
              pFd.append('file', pBlob, 'panorama.jpg')
              await api.post(
                `/proctoring/${sessionId}/room-scan/${scanId}/panorama?token=${token}`,
                pFd,
                { headers: { 'Content-Type': 'multipart/form-data' } }
              )
            }
          }
        }
      } catch { /* best-effort */ }
      setPhase('done')
    }
    recorderRef.current = recorder
    recorder.start(1000)
    setStepIdx(0)
    setPhase('scanning')
  }

  const totalSecs = SCAN_STEPS.reduce((a, s) => a + s.secs, 0)

  return (
    <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
      <div className="bg-primary/10 px-6 py-4 border-b flex items-center gap-3">
        <Video className="h-5 w-5 text-primary shrink-0" />
        <div>
          <h2 className="text-lg font-bold text-gray-900">
            {trigger === 'PRE_TEST' ? 'Pre-Test Room Scan' : 'Periodic Room Check'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {trigger === 'PRE_TEST' ? 'Follow the guided steps to show your surroundings' : 'A brief guided verification is required to continue'}
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
            {/* Camera preview */}
            <div className="relative bg-gray-900 rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />

              {phase === 'scanning' && (
                <>
                  {/* REC badge */}
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded-full z-10">
                    <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                    REC
                  </div>
                  {/* Direction icon overlay */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-6xl drop-shadow-lg select-none opacity-80">{SCAN_STEPS[stepIdx].icon}</span>
                  </div>
                  {/* Step progress bar */}
                  <div className="absolute bottom-0 inset-x-0 h-1.5 bg-black/30">
                    <div
                      className="h-full bg-primary transition-all duration-1000"
                      style={{ width: `${stepSecs > 0 ? (stepSecs / SCAN_STEPS[stepIdx].secs) * 100 : 0}%` }}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Warning */}
            {warning && phase === 'scanning' && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                <span>{warning}</span>
              </div>
            )}

            {/* Intro step list */}
            {phase === 'intro' && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700">
                  You'll be guided through {SCAN_STEPS.length} steps (~{totalSecs}s total):
                </p>
                <div className="grid grid-cols-5 gap-2">
                  {SCAN_STEPS.map((s, i) => (
                    <div key={i} className="text-center space-y-1">
                      <div className="text-2xl">{s.icon}</div>
                      <p className="text-[10px] text-muted-foreground leading-tight">{s.label}</p>
                      <p className="text-[10px] font-mono text-muted-foreground">{s.secs}s</p>
                    </div>
                  ))}
                </div>
                <Button className="w-full" onClick={startScan}>
                  <Video className="h-4 w-4 mr-2" />
                  Begin Guided Room Scan
                </Button>
              </div>
            )}

            {/* Scanning — current step info */}
            {phase === 'scanning' && (
              <div className="space-y-3">
                {/* Step progress dots */}
                <div className="flex gap-1.5">
                  {SCAN_STEPS.map((_, i) => (
                    <div key={i} className={cn(
                      'flex-1 h-1.5 rounded-full transition-colors',
                      i < stepIdx ? 'bg-green-400' : i === stepIdx ? 'bg-primary' : 'bg-gray-200'
                    )} />
                  ))}
                </div>
                <div className="text-center space-y-1">
                  <div className="text-4xl font-mono font-bold text-gray-900 tabular-nums">{stepSecs}s</div>
                  <p className="text-base font-semibold text-gray-900">{SCAN_STEPS[stepIdx].label}</p>
                  <p className="text-sm text-muted-foreground">{SCAN_STEPS[stepIdx].hint}</p>
                  <p className="text-xs text-muted-foreground">Step {stepIdx + 1} of {SCAN_STEPS.length}</p>
                </div>
              </div>
            )}

            {phase === 'uploading' && (
              <div className="flex items-center justify-center gap-2 py-4">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Saving room scan…</span>
              </div>
            )}

            {phase === 'done' && (
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
