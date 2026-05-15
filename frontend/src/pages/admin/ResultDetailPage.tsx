import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Loader2, CheckCircle, XCircle, Clock, Bot,
  ShieldAlert, ShieldCheck, AlertTriangle, Trophy,
  Camera, CameraOff, TabletSmartphone, Minimize2, Copy,
  MousePointer2, Code2, Users, UserX, Volume2, Smartphone,
  Navigation, MonitorPlay,
} from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, getErrorMessage } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { formatDateTime, formatSeconds, cn } from '@/lib/utils'

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
  const [expandedShot, setExpandedShot] = useState<string | null>(null)

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

  // Show all events in the timeline except low-noise periodic snapshots
  const nonScreenshotEvents: any[] = (proctoringData?.events ?? []).filter(
    (e: any) => e.type !== 'SCREENSHOT_TAKEN'
  )

  return (
    <div className="space-y-6 max-w-4xl">
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
      {activeTab === 'proctoring' && (
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
                      src={snapshotsData.screenRecording.url}
                      controls
                      className="w-full rounded-md border max-h-64"
                    />
                  </CardContent>
                </Card>
              )}

              {/* Webcam snapshot gallery — real uploaded images with watermarks */}
              {(snapshotsData?.snapshots?.length ?? 0) > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Camera className="h-4 w-4" />
                      Webcam Snapshots ({snapshotsData!.snapshots.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                      {snapshotsData!.snapshots.map((snap: any) => (
                        <button
                          key={snap.id}
                          onClick={() => setExpandedShot(snap.url)}
                          className="relative group aspect-video overflow-hidden rounded border hover:ring-2 hover:ring-primary transition-all"
                          title={formatDateTime(snap.occurredAt)}
                        >
                          <img
                            src={snap.url}
                            alt={`Snapshot ${formatDateTime(snap.occurredAt)}`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-end justify-center pb-0.5">
                            <span className="text-[9px] text-white/0 group-hover:text-white/90 font-mono leading-none">
                              {new Date(snap.occurredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Expanded snapshot lightbox */}
              {expandedShot && (
                <div
                  className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
                  onClick={() => setExpandedShot(null)}
                >
                  <img
                    src={expandedShot}
                    alt="Snapshot"
                    className="max-w-full max-h-full rounded-lg shadow-2xl"
                    onClick={e => e.stopPropagation()}
                  />
                  <button
                    className="absolute top-4 right-4 text-white/80 hover:text-white text-2xl font-bold"
                    onClick={() => setExpandedShot(null)}
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Event timeline (excluding screenshots) */}
              {nonScreenshotEvents.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <ShieldCheck className="h-10 w-10 text-green-500 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No violations detected</p>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Event Timeline</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                      {nonScreenshotEvents.map((evt: any) => (
                        <div key={evt.id} className={cn('flex items-start gap-3 p-2.5 rounded-md border text-sm', SEVERITY_COLOR[evt.severity])}>
                          <EventIcon type={evt.type} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{evt.type.replace(/_/g, ' ')}</span>
                              <Badge variant="outline" className="text-xs py-0">{evt.severity}</Badge>
                            </div>
                            {evt.description && <p className="text-xs mt-0.5 opacity-80">{evt.description}</p>}
                          </div>
                          <span className="text-xs shrink-0 opacity-70">{formatDateTime(evt.occurredAt)}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}
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
