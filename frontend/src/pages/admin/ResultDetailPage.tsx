import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Loader2, CheckCircle, XCircle, Clock, Bot,
  ShieldAlert, ShieldCheck, AlertTriangle, Trophy,
  Camera, CameraOff, TabletSmartphone, Minimize2, Copy,
  MousePointer2, Code2, Users, UserX, Volume2, Smartphone,
  Navigation, MonitorPlay, ZoomIn,
} from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, getErrorMessage } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { formatDateTime, formatSeconds, cn } from '@/lib/utils'

// ── SecureImage: fetches with Authorization header, renders as blob URL ───────
function SecureImage({ src, alt, className, onClick }: {
  src: string; alt: string; className?: string; onClick?: () => void
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [errorStatus, setErrorStatus] = useState<number | null>(null)
  const prevUrl = useRef<string | null>(null)

  useEffect(() => {
    setObjectUrl(null)
    setErrorStatus(null)
    let active = true
    const token = localStorage.getItem('accessToken')
    fetch(src, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => {
        if (!r.ok) { if (active) setErrorStatus(r.status); throw new Error(`${r.status}`) }
        return r.blob()
      })
      .then(blob => {
        if (!active) return
        if (prevUrl.current) URL.revokeObjectURL(prevUrl.current)
        const url = URL.createObjectURL(blob)
        prevUrl.current = url
        setObjectUrl(url)
      })
      .catch(() => {})
    return () => {
      active = false
      if (prevUrl.current) { URL.revokeObjectURL(prevUrl.current); prevUrl.current = null }
    }
  }, [src])

  if (errorStatus !== null) return (
    <div className={cn('flex flex-col items-center justify-center bg-gray-100 text-gray-400 gap-1', className)}>
      <CameraOff className="h-4 w-4" />
      <span className="text-[9px]">{errorStatus === 404 ? 'Not found' : `Error ${errorStatus}`}</span>
    </div>
  )
  if (!objectUrl) return (
    <div className={cn('bg-gray-100 animate-pulse', className)} />
  )
  return <img src={objectUrl} alt={alt} className={cn('object-cover', className)} onClick={onClick} />
}

const EVENT_LABELS: Record<string, string> = {
  TAB_SWITCH: 'Tab switched',
  WINDOW_BLUR: 'Window lost focus',
  FULLSCREEN_EXIT: 'Exited fullscreen',
  COPY_PASTE: 'Copy / paste attempt',
  RIGHT_CLICK: 'Right-click attempted',
  WEBCAM_BLOCKED: 'Webcam blocked',
  MULTIPLE_FACES: 'Multiple faces detected',
  NO_FACE_DETECTED: 'No face visible',
  NOISE_DETECTED: 'Background noise',
  SCREENSHOT_TAKEN: 'Webcam snapshot',
  DEVTOOLS_OPEN: 'DevTools opened',
  PHONE_DETECTED: 'Mobile device detected',
  HEAD_TURNED: 'Head turned away',
  SCREEN_RECORDING_STOPPED: 'Screen recording stopped',
  CUSTOM: 'Custom event',
}

const TYPE_LABELS: Record<string, string> = {
  MCQ_SINGLE: 'MCQ', MCQ_MULTI: 'Multi-Select', TRUE_FALSE: 'True/False',
  ESSAY: 'Essay', SHORT_ANSWER: 'Short Answer', CODE: 'Code',
  NUMERICAL: 'Numerical', RANKING: 'Ranking',
}

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: 'text-red-600 bg-red-50 border-red-200',
  HIGH: 'text-orange-600 bg-orange-50 border-orange-200',
  MEDIUM: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  LOW: 'text-blue-600 bg-blue-50 border-blue-200',
}
const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }

// Border classes applied to snapshot thumbnails based on nearby events
const RISK_BORDER: Record<string, string> = {
  CRITICAL: 'ring-2 ring-red-500 border-red-400',
  HIGH: 'ring-2 ring-orange-400 border-orange-300',
  MEDIUM: 'ring-1 ring-yellow-400 border-yellow-300',
  LOW: 'ring-1 ring-blue-300 border-blue-200',
}
const RISK_DOT: Record<string, string> = {
  CRITICAL: 'bg-red-500',
  HIGH: 'bg-orange-400',
  MEDIUM: 'bg-yellow-400',
  LOW: 'bg-blue-400',
}

function getSnapshotRisk(snapTime: string, events: any[]): string | null {
  const t = new Date(snapTime).getTime()
  const nearby = events.filter((e: any) => Math.abs(new Date(e.occurredAt).getTime() - t) <= 30_000)
  if (nearby.some((e: any) => e.severity === 'CRITICAL')) return 'CRITICAL'
  if (nearby.some((e: any) => e.severity === 'HIGH')) return 'HIGH'
  if (nearby.some((e: any) => e.severity === 'MEDIUM')) return 'MEDIUM'
  if (nearby.some((e: any) => e.severity === 'LOW')) return 'LOW'
  return null
}

function EventIcon({ type }: { type: string }) {
  const cls = 'h-4 w-4 shrink-0 mt-0.5'
  switch (type) {
    case 'TAB_SWITCH': return <TabletSmartphone className={cls} />
    case 'WINDOW_BLUR': return <Minimize2 className={cls} />
    case 'FULLSCREEN_EXIT': return <Minimize2 className={cls} />
    case 'COPY_PASTE': return <Copy className={cls} />
    case 'RIGHT_CLICK': return <MousePointer2 className={cls} />
    case 'DEVTOOLS_OPEN': return <Code2 className={cls} />
    case 'WEBCAM_BLOCKED': return <CameraOff className={cls} />
    case 'MULTIPLE_FACES': return <Users className={cls} />
    case 'NO_FACE_DETECTED': return <UserX className={cls} />
    case 'NOISE_DETECTED': return <Volume2 className={cls} />
    case 'SCREENSHOT_TAKEN': return <Camera className={cls} />
    case 'PHONE_DETECTED': return <Smartphone className={cls} />
    case 'HEAD_TURNED': return <Navigation className={cls} />
    case 'SCREEN_RECORDING_STOPPED': return <MonitorPlay className={cls} />
    default: return <AlertTriangle className={cls} />
  }
}

export function ResultDetailPage() {
  const { sessionId } = useParams()
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<'answers' | 'proctoring'>('answers')
  const [expandedShot, setExpandedShot] = useState<{ id: string; url: string } | null>(null)
  const [linkedSnapshotId, setLinkedSnapshotId] = useState<string | null>(null)
  const [panelSnap, setPanelSnap] = useState<{ id: string; url: string } | null>(null)
  const snapshotRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const { data: session, isLoading } = useQuery({
    queryKey: ['result', sessionId],
    queryFn: () => api.get(`/results/${sessionId}`).then(r => r.data.data),
  })

  const { data: proctoringData } = useQuery({
    queryKey: ['proctoring', sessionId],
    queryFn: () => api.get(`/proctoring/${sessionId}/events`).then(r => r.data.data),
    enabled: !!sessionId,
  })

  const { data: snapshotsData } = useQuery({
    queryKey: ['proctoring-snapshots', sessionId],
    queryFn: () => api.get(`/proctoring/${sessionId}/snapshots`).then(r => r.data.data),
    enabled: !!sessionId,
  })

  const gradeMutation = useMutation({
    mutationFn: ({ answerId, pointsEarned, feedback }: { answerId: string; pointsEarned: number; feedback: string }) =>
      api.patch(`/results/${sessionId}/answers/${answerId}`, { pointsEarned, feedback }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['result', sessionId] })
      toast({ title: 'Answer graded' })
    },
    onError: err => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  })

  const aiGradeMutation = useMutation({
    mutationFn: () => api.post(`/results/${sessionId}/ai-grade`, {}),
    onSuccess: res => {
      qc.invalidateQueries({ queryKey: ['result', sessionId] })
      toast({ title: `AI graded ${res.data.data.graded} answers` })
    },
    onError: err => toast({ title: 'AI grading failed', description: getErrorMessage(err), variant: 'destructive' }),
  })

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
  }
  if (!session) return <div className="text-center py-12 text-muted-foreground">Session not found</div>

  const answerMap = new Map(session.answers.map((a: any) => [a.questionId, a]))
  const hasPendingAnswers = session.answers.some((a: any) => a.gradingStatus === 'PENDING')
  const riskScore = proctoringData?.summary?.riskScore ?? 0

  // Find the snapshot closest in time to a given ISO timestamp
  const findNearestSnapshot = (isoTime: string) => {
    const snapshots: any[] = snapshotsData?.snapshots ?? []
    if (snapshots.length === 0) return null
    const t = new Date(isoTime).getTime()
    return snapshots.reduce((best: any, snap: any) => {
      const d = Math.abs(new Date(snap.occurredAt).getTime() - t)
      const bd = Math.abs(new Date(best.occurredAt).getTime() - t)
      return d < bd ? snap : best
    })
  }

  const handleEventClick = (evt: any) => {
    setActiveTab('proctoring')
    const snap = findNearestSnapshot(evt.occurredAt)
    if (!snap) return
    const url = `/api/proctoring/${sessionId}/media/snapshot/${snap.id}`
    setLinkedSnapshotId(snap.id)
    setPanelSnap({ id: snap.id, url })
    setTimeout(() => {
      snapshotRefs.current[snap.id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 50)
  }

  // Sorted: Critical → High → Medium → Low, then chronological within same severity
  const nonScreenshotEvents: any[] = (proctoringData?.events ?? [])
    .filter((e: any) => e.type !== 'SCREENSHOT_TAKEN')
    .sort((a: any, b: any) => {
      const sev = (SEVERITY_ORDER[a.severity] ?? 4) - (SEVERITY_ORDER[b.severity] ?? 4)
      if (sev !== 0) return sev
      return new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
    })

  // Auto-select: when proctoring tab opens, show the first critical/high event's snapshot
  useEffect(() => {
    if (activeTab !== 'proctoring' || panelSnap || !snapshotsData?.snapshots?.length) return
    const highPriority = nonScreenshotEvents.find(
      e => e.severity === 'CRITICAL' || e.severity === 'HIGH'
    )
    const snap = highPriority
      ? findNearestSnapshot(highPriority.occurredAt)
      : snapshotsData.snapshots[0]
    if (!snap) return
    const url = `/api/proctoring/${sessionId}/media/snapshot/${snap.id}`
    setPanelSnap({ id: snap.id, url })
    setLinkedSnapshotId(snap.id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, snapshotsData])

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-4 flex-wrap">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin/results"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900">
            {session.candidate.firstName} {session.candidate.lastName}
          </h1>
          <p className="text-sm text-muted-foreground">{session.test.title}</p>
        </div>
        {hasPendingAnswers && (
          <Button variant="outline" size="sm" onClick={() => aiGradeMutation.mutate()} disabled={aiGradeMutation.isPending}>
            {aiGradeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Bot className="h-4 w-4 mr-2" />}
            AI Grade Pending
          </Button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-primary">
              {session.score ? `${Math.round(session.score.percentage)}%` : '—'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Score</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">
              {session.score ? `${session.score.earnedPoints.toFixed(1)}` : '—'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">of {session.score?.totalPoints ?? '?'} pts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            {session.score?.passed !== null && session.score?.passed !== undefined
              ? session.score.passed
                ? <CheckCircle className="h-7 w-7 text-green-500 mx-auto" />
                : <XCircle className="h-7 w-7 text-red-500 mx-auto" />
              : <span className="text-2xl">—</span>}
            <p className="text-xs text-muted-foreground mt-1">
              {session.score?.passed ? 'Passed' : session.score?.passed === false ? 'Failed' : 'No threshold'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-1">
              <Trophy className="h-5 w-5 text-amber-500" />
              <p className="text-2xl font-bold">{session.score?.percentile != null ? `${session.score.percentile}th` : '—'}</p>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Percentile</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-1">
              {riskScore === 0
                ? <ShieldCheck className="h-6 w-6 text-green-500" />
                : riskScore < 30
                ? <ShieldAlert className="h-6 w-6 text-yellow-500" />
                : <ShieldAlert className="h-6 w-6 text-red-500" />}
              <p className="text-2xl font-bold">{riskScore}</p>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Risk score</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(['answers', 'proctoring'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={cn('px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize',
              activeTab === t ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'
            )}>
            {t}
            {t === 'proctoring' && proctoringData?.summary?.critical > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5">{proctoringData.summary.critical}</span>
            )}
          </button>
        ))}
      </div>

      {/* Answers tab */}
      {activeTab === 'answers' && session.test.sections.map((section: any) => (
        <Card key={section.id}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{section.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {section.testQuestions.map((tq: any, idx: number) => {
              const answer = answerMap.get(tq.question.id) as any
              return (
                <AnswerReview
                  key={tq.id}
                  index={idx + 1}
                  question={tq.question}
                  answer={answer}
                  maxPoints={tq.points ?? tq.question.points}
                  onGrade={(pts, fb) => gradeMutation.mutate({ answerId: answer?.id, pointsEarned: pts, feedback: fb })}
                />
              )
            })}
          </CardContent>
        </Card>
      ))}

      {/* Proctoring tab */}
      {activeTab === 'proctoring' && (() => {
        const hasSnapshots = (snapshotsData?.snapshots?.length ?? 0) > 0
        return (
          <div className="space-y-4">
            {!proctoringData ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No proctoring data available</CardContent></Card>
            ) : (
              <>
                {/* Severity counts */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Critical', count: proctoringData.summary.critical, color: 'text-red-600' },
                    { label: 'High', count: proctoringData.summary.high, color: 'text-orange-600' },
                    { label: 'Medium', count: proctoringData.summary.medium, color: 'text-yellow-600' },
                    { label: 'Low', count: proctoringData.summary.low, color: 'text-blue-600' },
                  ].map(item => (
                    <Card key={item.label}>
                      <CardContent className="p-3 text-center">
                        <p className={`text-2xl font-bold ${item.color}`}>{item.count}</p>
                        <p className="text-xs text-muted-foreground">{item.label}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Screen recording */}
                {snapshotsData?.screenRecording && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <MonitorPlay className="h-4 w-4" />
                        Screen Recording
                        {snapshotsData.screenRecording.fileSize && (
                          <span className="text-xs font-normal text-muted-foreground ml-1">
                            ({(snapshotsData.screenRecording.fileSize / 1024 / 1024).toFixed(1)} MB)
                          </span>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <video
                        src={`/api/proctoring/${sessionId}/media/recording`}
                        controls
                        className="w-full rounded-md border max-h-72 bg-black"
                      />
                    </CardContent>
                  </Card>
                )}

                {/* Event timeline + snapshot panel side by side */}
                <div className={cn('grid gap-4', hasSnapshots ? 'lg:grid-cols-5' : '')}>
                  {/* Event timeline */}
                  <Card className={cn(hasSnapshots && 'lg:col-span-3')}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        Event Timeline
                        {hasSnapshots && (
                          <span className="text-xs font-normal text-muted-foreground">— click to preview snapshot</span>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {nonScreenshotEvents.length === 0 ? (
                        <div className="py-8 text-center">
                          <ShieldCheck className="h-10 w-10 text-green-500 mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">No violations detected</p>
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
                          {nonScreenshotEvents.map((evt: any) => {
                            const nearestSnap = findNearestSnapshot(evt.occurredAt)
                            const snapUrl = nearestSnap
                              ? `/api/proctoring/${sessionId}/media/snapshot/${nearestSnap.id}`
                              : null
                            const isActive = panelSnap?.id === nearestSnap?.id
                            return (
                              <button
                                key={evt.id}
                                onClick={() => handleEventClick(evt)}
                                className={cn(
                                  'w-full flex items-start gap-2 p-2 rounded-md border text-sm text-left transition-all',
                                  SEVERITY_COLOR[evt.severity],
                                  nearestSnap ? 'hover:brightness-95 cursor-pointer' : 'cursor-default',
                                  isActive && 'ring-1 ring-inset ring-primary/40'
                                )}
                              >
                                <EventIcon type={evt.type} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-semibold text-xs">
                                      {EVENT_LABELS[evt.type] ?? evt.type.replace(/_/g, ' ')}
                                    </span>
                                    <Badge variant="outline" className="text-[10px] py-0 h-4 font-normal">
                                      {evt.severity}
                                    </Badge>
                                  </div>
                                  {evt.description && (
                                    <p className="text-[11px] mt-0.5 opacity-75 truncate">{evt.description}</p>
                                  )}
                                  <p className="text-[10px] opacity-50 mt-0.5">{formatDateTime(evt.occurredAt)}</p>
                                </div>
                                {/* Inline snapshot thumbnail */}
                                {snapUrl && (
                                  <div className={cn(
                                    'shrink-0 w-16 h-11 rounded overflow-hidden border bg-gray-100 transition-all',
                                    isActive ? 'ring-2 ring-primary opacity-100' : 'opacity-60 group-hover:opacity-100'
                                  )}>
                                    <SecureImage src={snapUrl} alt="snapshot" className="w-full h-full" />
                                  </div>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Snapshot preview panel — sticky so it stays visible while scrolling events */}
                  {hasSnapshots && (
                    <Card className="lg:col-span-2 lg:sticky lg:top-4 self-start">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Camera className="h-4 w-4" />
                          Snapshot Preview
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {panelSnap ? (
                          <>
                            <div
                              className="rounded-lg overflow-hidden border cursor-zoom-in"
                              title="Click to expand"
                              onClick={() => setExpandedShot(panelSnap)}
                            >
                              <SecureImage
                                src={panelSnap.url}
                                alt="Selected snapshot"
                                className="w-full rounded-lg"
                              />
                            </div>
                            {/* Events near this snapshot */}
                            {(() => {
                              const snap = snapshotsData?.snapshots?.find((s: any) => s.id === panelSnap.id)
                              if (!snap) return null
                              const t = new Date(snap.occurredAt).getTime()
                              const nearby = nonScreenshotEvents.filter(
                                (e: any) => Math.abs(new Date(e.occurredAt).getTime() - t) <= 30_000
                              )
                              if (nearby.length === 0) return (
                                <p className="text-xs text-muted-foreground text-center">No flagged events near this moment</p>
                              )
                              return (
                                <div className="space-y-1">
                                  <p className="text-xs font-medium text-gray-600">Nearby events:</p>
                                  {nearby.slice(0, 4).map((evt: any) => (
                                    <div key={evt.id} className={cn(
                                      'flex items-center gap-2 text-xs px-2 py-1 rounded-md border',
                                      SEVERITY_COLOR[evt.severity]
                                    )}>
                                      <EventIcon type={evt.type} />
                                      <span className="flex-1 truncate">{EVENT_LABELS[evt.type] ?? evt.type}</span>
                                      <Badge variant="outline" className="text-[9px] py-0 h-4 font-normal shrink-0">
                                        {evt.severity}
                                      </Badge>
                                    </div>
                                  ))}
                                  {nearby.length > 4 && (
                                    <p className="text-[10px] text-muted-foreground text-center">
                                      +{nearby.length - 4} more
                                    </p>
                                  )}
                                </div>
                              )
                            })()}
                            <p className="text-[10px] text-muted-foreground text-center">
                              Click image to expand fullscreen
                            </p>
                          </>
                        ) : (
                          <div className="py-8 rounded-lg bg-gray-50 border border-dashed flex flex-col items-center justify-center gap-2">
                            <Camera className="h-8 w-8 text-gray-300" />
                            <p className="text-xs text-muted-foreground text-center px-4">
                              Click any timeline event to preview the nearest snapshot
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Webcam snapshot gallery with risk color-coding */}
                {hasSnapshots && (
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Camera className="h-4 w-4" />
                          Webcam Snapshots ({snapshotsData!.snapshots.length})
                        </CardTitle>
                        {linkedSnapshotId && (
                          <button
                            className="text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => { setLinkedSnapshotId(null); setPanelSnap(null) }}
                          >
                            Clear highlight ✕
                          </button>
                        )}
                      </div>
                      {/* Risk legend */}
                      <div className="flex items-center gap-3 pt-1 flex-wrap">
                        {[
                          { dot: 'bg-red-500', label: 'Critical' },
                          { dot: 'bg-orange-400', label: 'High' },
                          { dot: 'bg-yellow-400', label: 'Medium' },
                          { dot: 'bg-blue-400', label: 'Low' },
                          { dot: 'bg-gray-200', label: 'No nearby event' },
                        ].map(item => (
                          <span key={item.label} className="flex items-center gap-1">
                            <span className={cn('w-2 h-2 rounded-full', item.dot)} />
                            <span className="text-[10px] text-muted-foreground">{item.label}</span>
                          </span>
                        ))}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                        {snapshotsData!.snapshots.map((snap: any) => {
                          const isLinked = linkedSnapshotId === snap.id
                          const imgSrc = `/api/proctoring/${sessionId}/media/snapshot/${snap.id}`
                          const riskLevel = getSnapshotRisk(snap.occurredAt, nonScreenshotEvents)
                          return (
                            <button
                              key={snap.id}
                              ref={el => { snapshotRefs.current[snap.id] = el }}
                              onClick={() => {
                                setExpandedShot({ id: snap.id, url: imgSrc })
                                setLinkedSnapshotId(snap.id)
                                setPanelSnap({ id: snap.id, url: imgSrc })
                              }}
                              className={cn(
                                'relative group aspect-video overflow-hidden rounded-md border transition-all',
                                isLinked
                                  ? 'ring-2 ring-orange-400 border-orange-400 shadow-md scale-105'
                                  : riskLevel
                                    ? RISK_BORDER[riskLevel]
                                    : 'border-gray-200 hover:ring-2 hover:ring-primary'
                              )}
                            >
                              <SecureImage
                                src={imgSrc}
                                alt={`Snapshot ${formatDateTime(snap.occurredAt)}`}
                                className="w-full h-full"
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-1">
                                <span className="text-[9px] text-white font-mono leading-none">
                                  {new Date(snap.occurredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                              </div>
                              {/* Risk dot indicator */}
                              {riskLevel && !isLinked && (
                                <div className={cn(
                                  'absolute top-1 left-1 w-2.5 h-2.5 rounded-full shadow',
                                  RISK_DOT[riskLevel]
                                )} />
                              )}
                              {isLinked && (
                                <div className="absolute top-1 right-1 bg-orange-400 rounded-full p-0.5">
                                  <ZoomIn className="h-2.5 w-2.5 text-white" />
                                </div>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Lightbox */}
                {expandedShot && (
                  <div
                    className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
                    onClick={() => setExpandedShot(null)}
                  >
                    <div className="relative max-w-3xl w-full" onClick={e => e.stopPropagation()}>
                      <SecureImage
                        src={expandedShot.url}
                        alt="Snapshot"
                        className="w-full rounded-lg shadow-2xl"
                      />
                      <button
                        className="absolute top-3 right-3 bg-black/50 hover:bg-black/80 text-white rounded-full w-8 h-8 flex items-center justify-center text-lg font-bold transition-colors"
                        onClick={() => setExpandedShot(null)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )
      })()}
    </div>
  )
}

function AnswerReview({ index, question, answer, maxPoints, onGrade }: {
  index: number; question: any; answer: any; maxPoints: number
  onGrade: (points: number, feedback: string) => void
}) {
  const [grading, setGrading] = useState(false)
  const [points, setPoints] = useState<number | string>(answer?.pointsEarned ?? '')
  const [feedback, setFeedback] = useState(answer?.feedback ?? '')
  const needsGrading = ['ESSAY', 'SHORT_ANSWER', 'CODE', 'FILE_UPLOAD', 'AUDIO_RECORDING'].includes(question.type)

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-muted-foreground">Q{index}</span>
            <Badge variant="outline" className="text-xs">{TYPE_LABELS[question.type] ?? question.type}</Badge>
            {answer?.gradingStatus && (
              <Badge variant={answer.gradingStatus === 'PENDING' ? 'secondary' : 'outline'} className="text-xs">
                {answer.gradingStatus.replace('_', ' ')}
              </Badge>
            )}
          </div>
          <p className="font-medium text-sm mt-1">{question.title}</p>
        </div>
        <div className="text-right shrink-0 text-sm">
          {answer ? (
            <span className={cn('font-bold',
              answer.pointsEarned === maxPoints ? 'text-green-600' :
              (answer.pointsEarned ?? 0) > 0 ? 'text-yellow-600' : 'text-red-500'
            )}>
              {answer.pointsEarned?.toFixed(1) ?? '?'}/{maxPoints}
            </span>
          ) : (
            <span className="text-muted-foreground text-xs">No answer</span>
          )}
        </div>
      </div>

      {answer?.feedback && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-2 text-xs text-blue-800">
          <strong>AI Feedback:</strong> {answer.feedback}
        </div>
      )}

      {answer && (
        <div className="bg-gray-50 rounded-md p-3 text-sm">
          {answer.responseText && <p className="whitespace-pre-wrap">{answer.responseText}</p>}
          {(answer.selectedOptions?.length > 0) && (
            <div className="space-y-1">
              {question.options?.map((opt: any) => (
                <div key={opt.id} className={cn('flex items-center gap-2 text-xs',
                  answer.selectedOptions.includes(opt.id) ? 'font-medium' : 'text-muted-foreground'
                )}>
                  <span>{answer.selectedOptions.includes(opt.id) ? '●' : '○'}</span>
                  <span>{opt.text}</span>
                  {opt.isCorrect && <span className="text-green-600 font-medium">✓ Correct</span>}
                </div>
              ))}
            </div>
          )}
          {answer.numericValue != null && <p>Answer: <strong>{answer.numericValue}</strong></p>}
          {answer.codeSubmission && (
            <pre className="bg-gray-900 text-gray-100 p-3 rounded text-xs overflow-x-auto mt-2 max-h-48">
              {answer.codeSubmission}
            </pre>
          )}
          {answer.timeSpent && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <Clock className="h-3 w-3" />{formatSeconds(answer.timeSpent)} spent
            </p>
          )}
        </div>
      )}

      {needsGrading && answer && !grading && (
        <Button variant="outline" size="sm" onClick={() => setGrading(true)}>Grade manually</Button>
      )}

      {needsGrading && grading && (
        <div className="space-y-3 border-t pt-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Points (max {maxPoints})</Label>
              <Input type="number" min="0" max={maxPoints} step="0.5"
                value={points} onChange={e => setPoints(parseFloat(e.target.value))} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Feedback</Label>
            <textarea rows={2}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={feedback} onChange={e => setFeedback(e.target.value)}
              placeholder="Optional feedback..." />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { onGrade(Number(points), feedback); setGrading(false) }}>Save</Button>
            <Button size="sm" variant="outline" onClick={() => setGrading(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  )
}
