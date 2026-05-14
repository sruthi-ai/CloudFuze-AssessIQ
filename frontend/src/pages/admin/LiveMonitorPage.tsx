import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  MonitorPlay, RefreshCw, Clock, ShieldAlert, User, FileText,
  AlertTriangle, CheckCircle, Loader2, Radio,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { api } from '@/lib/api'
import { cn, formatSeconds } from '@/lib/utils'

interface LiveSession {
  sessionId: string
  startedAt: string
  timeoutAt: string | null
  candidate: { id: string; firstName: string; lastName: string; email: string }
  test: { id: string; title: string }
  recentEvents: Array<{ id: string; type: string; severity: string; occurredAt: string; description: string | null }>
  totalEvents: number
  riskScore: number
}

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: 'text-red-700 bg-red-100',
  HIGH: 'text-orange-700 bg-orange-100',
  MEDIUM: 'text-yellow-700 bg-yellow-100',
  LOW: 'text-blue-700 bg-blue-100',
}

function RiskBar({ score }: { score: number }) {
  const color = score >= 60 ? 'bg-red-500' : score >= 30 ? 'bg-orange-400' : 'bg-green-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-mono w-7 text-right">{score}</span>
    </div>
  )
}

function TimeLeft({ timeoutAt }: { timeoutAt: string | null }) {
  const [secs, setSecs] = useState<number | null>(null)

  useEffect(() => {
    if (!timeoutAt) return
    const update = () => setSecs(Math.max(0, Math.floor((new Date(timeoutAt).getTime() - Date.now()) / 1000)))
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [timeoutAt])

  if (secs === null) return <span className="text-muted-foreground text-xs">—</span>
  return (
    <span className={cn('text-xs font-mono', secs < 300 ? 'text-red-600 animate-pulse' : 'text-gray-600')}>
      {formatSeconds(secs)}
    </span>
  )
}

export function LiveMonitorPage() {
  const { data: sessions = [], isLoading, refetch, isFetching } = useQuery<LiveSession[]>({
    queryKey: ['live-monitor'],
    queryFn: () => api.get('/proctoring/active').then(r => r.data.data),
    refetchInterval: 10_000,
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Radio className="h-5 w-5 text-red-500 animate-pulse" />
            Live Monitor
          </h1>
          <p className="text-muted-foreground text-sm">Active assessment sessions — auto-refreshes every 10 seconds</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn('h-4 w-4 mr-2', isFetching && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <MonitorPlay className="h-12 w-12 text-muted-foreground mx-auto" />
            <p className="font-medium text-gray-700">No active sessions</p>
            <p className="text-sm text-muted-foreground">Sessions will appear here when candidates are taking assessments.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sessions.map(s => (
            <Card key={s.sessionId} className={cn(
              'border transition-colors',
              s.riskScore >= 60 ? 'border-red-300 bg-red-50/40' :
              s.riskScore >= 30 ? 'border-orange-200' : 'border-gray-200'
            )}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base leading-tight">
                      {s.candidate.firstName} {s.candidate.lastName}
                    </CardTitle>
                    <CardDescription className="truncate text-xs">{s.candidate.email}</CardDescription>
                  </div>
                  {s.riskScore >= 60 && (
                    <Badge variant="destructive" className="shrink-0 gap-1">
                      <ShieldAlert className="h-3 w-3" />
                      High risk
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Test + timing */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate flex-1">{s.test.title}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    Time left:
                  </div>
                  <TimeLeft timeoutAt={s.timeoutAt} />
                </div>

                {/* Risk score */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Risk score</span>
                    <span>{s.totalEvents} event{s.totalEvents !== 1 ? 's' : ''}</span>
                  </div>
                  <RiskBar score={s.riskScore} />
                </div>

                {/* Recent events */}
                {s.recentEvents.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-gray-600">Recent flags</p>
                    {s.recentEvents.slice(0, 3).map(ev => (
                      <div key={ev.id} className="flex items-center gap-2 text-xs">
                        <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0', SEVERITY_COLOR[ev.severity] ?? 'bg-gray-100 text-gray-600')}>
                          {ev.severity}
                        </span>
                        <span className="truncate text-gray-600">{ev.type.replace(/_/g, ' ').toLowerCase()}</span>
                        <span className="ml-auto text-muted-foreground shrink-0">
                          {new Date(ev.occurredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <Link
                  to={`/admin/results/${s.sessionId}`}
                  className="block w-full text-center text-xs text-primary hover:underline pt-1"
                >
                  View full session →
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
