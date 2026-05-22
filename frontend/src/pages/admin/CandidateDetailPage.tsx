import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Loader2, Mail, Building2, Calendar, BarChart3 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { formatDateTime, formatDate } from '@/lib/utils'

const STATUS_VARIANT: Record<string, any> = {
  SUBMITTED: 'success', IN_PROGRESS: 'warning', TIMED_OUT: 'destructive', NOT_STARTED: 'secondary',
}

function riskLevel(n: number): { label: string; variant: any } {
  if (n === 0) return { label: 'None', variant: 'secondary' }
  if (n <= 3) return { label: 'Low', variant: 'outline' }
  if (n <= 8) return { label: 'Medium', variant: 'warning' }
  return { label: 'High', variant: 'destructive' }
}

export function CandidateDetailPage() {
  const { candidateId } = useParams()

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
    return (
      <div className="text-center py-12 text-muted-foreground">Candidate not found.</div>
    )
  }

  const completedSessions = (candidate.sessions ?? []).filter((s: any) => s.status === 'SUBMITTED')
  const avgScore = completedSessions.length
    ? completedSessions.reduce((sum: number, s: any) => sum + (s.score?.percentage ?? 0), 0) / completedSessions.length
    : null

  return (
    <div className="space-y-6 max-w-3xl">
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
            {candidate.suspended && <Badge variant="destructive">Suspended</Badge>}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Stats</h2>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-2xl font-bold">{candidate.sessions?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground">Sessions</p>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assessment History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!candidate.sessions?.length ? (
            <div className="p-6 text-center">
              <BarChart3 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No sessions yet.</p>
            </div>
          ) : (
            <div className="divide-y">
              {candidate.sessions.map((s: any) => {
                const risk = riskLevel(s._count?.proctoringEvents ?? 0)
                return (
                  <Link
                    key={s.id}
                    to={`/admin/results/${s.id}`}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.test.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.submittedAt ? formatDateTime(s.submittedAt) : 'Not submitted'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={STATUS_VARIANT[s.status] ?? 'secondary'} className="text-xs">
                        {s.status.replace('_', ' ')}
                      </Badge>
                      {s.score && (
                        <>
                          <span className="text-sm font-semibold">{Math.round(s.score.percentage)}%</span>
                          <Badge variant={s.score.passed ? 'success' : 'destructive'} className="text-xs">
                            {s.score.passed ? 'Pass' : 'Fail'}
                          </Badge>
                        </>
                      )}
                      <Badge variant={risk.variant} className="text-xs">{risk.label}</Badge>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
