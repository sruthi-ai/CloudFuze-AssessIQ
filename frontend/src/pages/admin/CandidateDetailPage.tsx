import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2, Mail, Building2, Calendar, BarChart3, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api, getErrorMessage } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { formatDateTime, formatDate } from '@/lib/utils'

const MAX_ATTEMPTS = 3

const INV_STATUS_VARIANT: Record<string, any> = {
  SENT: 'secondary', OPENED: 'outline', STARTED: 'warning',
  COMPLETED: 'success', EXPIRED: 'destructive', CANCELLED: 'destructive', PENDING: 'secondary',
}

const SESSION_STATUS_VARIANT: Record<string, any> = {
  SUBMITTED: 'success', IN_PROGRESS: 'warning', TIMED_OUT: 'destructive', NOT_STARTED: 'secondary',
}

function riskLevel(n: number): { label: string; variant: any } {
  if (n === 0) return { label: 'None', variant: 'secondary' }
  if (n <= 3) return { label: 'Low', variant: 'outline' }
  if (n <= 8) return { label: 'Medium', variant: 'warning' }
  return { label: 'High', variant: 'destructive' }
}

type PrevAttempt = {
  attemptNumber: number
  score: number
  percentage: number
  passed: boolean | null
  submittedAt: string | null
}

function PreviousAttemptsRow({ attempts }: { attempts: PrevAttempt[] }) {
  const [open, setOpen] = useState(false)
  if (!attempts.length) return null
  return (
    <div className="mt-2">
      <button
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-gray-700"
        onClick={() => setOpen(o => !o)}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {attempts.length} previous attempt{attempts.length > 1 ? 's' : ''}
      </button>
      {open && (
        <div className="mt-1.5 space-y-1 ml-4">
          {attempts.map(a => (
            <div key={a.attemptNumber} className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="w-16">Attempt {a.attemptNumber}</span>
              <span className="font-medium text-gray-700">{Math.round(a.percentage)}%</span>
              {a.passed !== null && (
                <Badge variant={a.passed ? 'success' : 'destructive'} className="text-xs py-0">{a.passed ? 'Pass' : 'Fail'}</Badge>
              )}
              {a.submittedAt && <span>{formatDateTime(a.submittedAt)}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RetakeButton({ invitationId, attemptNumber, attemptsAllowed, onSuccess }: {
  invitationId: string
  attemptNumber: number
  attemptsAllowed: number
  onSuccess: () => void
}) {
  const [confirm, setConfirm] = useState(false)
  const effectiveMax = Math.max(attemptsAllowed, MAX_ATTEMPTS)
  const attemptsRemaining = effectiveMax - attemptNumber

  const mutation = useMutation({
    mutationFn: () => api.post(`/candidates/invitations/${invitationId}/retake`, { expiresInDays: 7 }),
    onSuccess: () => {
      toast({ title: 'Re-attempt scheduled', description: 'A new invitation email has been sent to the candidate.' })
      setConfirm(false)
      onSuccess()
    },
    onError: err => {
      toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' })
      setConfirm(false)
    },
  })

  if (attemptsRemaining <= 0) {
    return <span className="text-xs text-muted-foreground">Max attempts reached</span>
  }

  if (confirm) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-600">Send new invite? ({attemptsRemaining - 1} left after)</span>
        <Button size="sm" variant="destructive" className="h-6 text-xs px-2" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirm'}
        </Button>
        <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setConfirm(false)}>Cancel</Button>
      </div>
    )
  }

  return (
    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setConfirm(true)}>
      <RotateCcw className="h-3 w-3" />
      Allow Re-attempt
    </Button>
  )
}

export function CandidateDetailPage() {
  const { candidateId } = useParams()
  const qc = useQueryClient()

  const { data: candidate, isLoading } = useQuery({
    queryKey: ['candidate', candidateId],
    queryFn: () => api.get(`/candidates/${candidateId}`).then(r => r.data.data),
    enabled: !!candidateId,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  if (!candidate) {
    return <div className="text-center py-12 text-muted-foreground">Candidate not found.</div>
  }

  const completedSessions = (candidate.sessions ?? []).filter((s: any) => s.status === 'SUBMITTED')
  const avgScore = completedSessions.length
    ? completedSessions.reduce((sum: number, s: any) => sum + (s.score?.percentage ?? 0), 0) / completedSessions.length
    : null

  const invitations: any[] = candidate.invitations ?? []

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin/candidates"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {candidate.firstName} {candidate.lastName}
          </h1>
          <p className="text-muted-foreground text-sm">Candidate profile</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Profile</h2>
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="truncate">{candidate.email}</span>
            </div>
            {candidate.organization && (
              <div className="flex items-center gap-2 text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>{candidate.organization}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <span>Joined {formatDate(candidate.createdAt)}</span>
            </div>
            {!candidate.isActive && <Badge variant="destructive">Inactive</Badge>}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Stats</h2>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-2xl font-bold">{invitations.length}</p>
                <p className="text-xs text-muted-foreground">Invitations</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{completedSessions.length}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{avgScore !== null ? `${Math.round(avgScore)}%` : '—'}</p>
                <p className="text-xs text-muted-foreground">Avg Score</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Invitations with attempt history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assessments & Attempts</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!invitations.length ? (
            <div className="p-6 text-center">
              <BarChart3 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No invitations yet.</p>
            </div>
          ) : (
            <div className="divide-y">
              {invitations.map((inv: any) => {
                const session = inv.session
                const prevAttempts: PrevAttempt[] = inv.previousAttempts ?? []
                const totalAttempts = prevAttempts.length + (session ? 1 : 0)
                const allowedAttempts = inv.test?.allowedAttempts ?? 1
                const effectiveMax = Math.max(allowedAttempts, MAX_ATTEMPTS)
                const canRetake = ['COMPLETED', 'TIMED_OUT', 'EXPIRED'].includes(inv.status) && inv.attemptNumber < effectiveMax
                const risk = session ? riskLevel(session._count?.proctoringEvents ?? 0) : null

                return (
                  <div key={inv.id} className="px-4 py-4">
                    <div className="flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium">{inv.test?.title ?? 'Unknown test'}</p>
                          <Badge variant={INV_STATUS_VARIANT[inv.status] ?? 'secondary'} className="text-xs">
                            {inv.status.replace('_', ' ')}
                          </Badge>
                          {totalAttempts > 1 && (
                            <span className="text-xs text-muted-foreground">Attempt {inv.attemptNumber} of {effectiveMax}</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Invited {formatDate(inv.createdAt)} · Expires {formatDate(inv.expiresAt)}
                        </p>

                        {/* Current attempt session */}
                        {session && (
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            <Badge variant={SESSION_STATUS_VARIANT[session.status] ?? 'secondary'} className="text-xs">
                              {session.status.replace('_', ' ')}
                            </Badge>
                            {session.score && (
                              <>
                                <span className="text-sm font-semibold">{Math.round(session.score.percentage)}%</span>
                                <Badge variant={session.score.passed ? 'success' : 'destructive'} className="text-xs">
                                  {session.score.passed ? 'Pass' : 'Fail'}
                                </Badge>
                              </>
                            )}
                            {risk && <Badge variant={risk.variant} className="text-xs">{risk.label} risk</Badge>}
                            <Link
                              to={`/admin/results/${session.id}`}
                              className="text-xs text-primary hover:underline"
                            >
                              View result →
                            </Link>
                          </div>
                        )}

                        <PreviousAttemptsRow attempts={prevAttempts} />
                      </div>

                      {canRetake && (
                        <RetakeButton
                          invitationId={inv.id}
                          attemptNumber={inv.attemptNumber}
                          attemptsAllowed={allowedAttempts}
                          onSuccess={() => qc.invalidateQueries({ queryKey: ['candidate', candidateId] })}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
