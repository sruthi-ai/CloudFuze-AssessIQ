import { useEffect, useState, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  MonitorPlay, RefreshCw, Clock, ShieldAlert, FileText,
  AlertTriangle, Loader2, Radio, Bell, BellOff, Wifi, WifiOff,
  TabletSmartphone, Eye, Copy, Code2, CameraOff, Users, UserX,
  Volume2, Smartphone, Navigation, EyeOff, X, Maximize2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { api } from '@/lib/api'
import { cn, formatSeconds } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'

interface LiveSession {
  sessionId: string
  startedAt: string
  timeoutAt: string | null
  candidate: { id: string; firstName: string; lastName: string; email: string }
  test: { id: string; title: string }
  recentEvents: Array<{ id: string; type: string; severity: string; occurredAt: string; description: string | null }>
  totalEvents: number
  riskScore: number
  latestSnapshot: { id: string; occurredAt: string } | null
}

interface AlertPayload {
  type: 'VIOLATION' | 'CONNECTED' | 'HEARTBEAT'
  sessionId?: string
  severity?: string
  eventType?: string
  description?: string | null
  occurredAt?: string
  candidate?: { firstName: string; lastName: string; email: string }
  test?: { id: string; title: string }
  riskScore?: number
}

const EVENT_LABELS: Record<string, string> = {
  TAB_SWITCH: 'Tab switched',
  WINDOW_BLUR: 'Window lost focus',
  FULLSCREEN_EXIT: 'Exited fullscreen',
  COPY_PASTE: 'Copy / paste attempt',
  WEBCAM_BLOCKED: 'Webcam blocked',
  MULTIPLE_FACES: 'Multiple faces',
  NO_FACE_DETECTED: 'No face visible',
  DEVTOOLS_OPEN: 'DevTools opened',
  PHONE_DETECTED: 'Phone detected',
  HEAD_TURNED: 'Head turned away',
  SCREEN_RECORDING_STOPPED: 'Screen recording stopped',
  NOISE_DETECTED: 'Background noise',
  RIGHT_CLICK: 'Right-click',
  FACE_OBSTRUCTED: 'Face partially hidden',
  SUSPECTED_ASSISTANCE: 'Suspected off-camera help',
  IDENTITY_MISMATCH: 'Identity mismatch',
}

function EventTypeIcon({ type }: { type: string }) {
  const cls = 'h-3.5 w-3.5 shrink-0'
  switch (type) {
    case 'TAB_SWITCH': return <TabletSmartphone className={cls} />
    case 'COPY_PASTE': return <Copy className={cls} />
    case 'DEVTOOLS_OPEN': return <Code2 className={cls} />
    case 'WEBCAM_BLOCKED': return <CameraOff className={cls} />
    case 'MULTIPLE_FACES': return <Users className={cls} />
    case 'NO_FACE_DETECTED': return <UserX className={cls} />
    case 'NOISE_DETECTED': return <Volume2 className={cls} />
    case 'PHONE_DETECTED': return <Smartphone className={cls} />
    case 'HEAD_TURNED': return <Navigation className={cls} />
    case 'FACE_OBSTRUCTED': return <EyeOff className={cls} />
    case 'SUSPECTED_ASSISTANCE': return <ShieldAlert className={cls} />
    case 'IDENTITY_MISMATCH': return <ShieldAlert className={cls} />
    default: return <AlertTriangle className={cls} />
  }
}

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: 'text-red-700 bg-red-100 border-red-200',
  HIGH: 'text-orange-700 bg-orange-100 border-orange-200',
  MEDIUM: 'text-yellow-700 bg-yellow-100 border-yellow-200',
  LOW: 'text-blue-700 bg-blue-100 border-blue-200',
}

// Polls latest-snapshot-image. intervalMs controls how frequently; use 2000 for expanded view.
function LiveSnapshot({
  sessionId, snapshot, intervalMs = 5_000, className = 'h-28',
}: {
  sessionId: string
  snapshot: { id: string; occurredAt: string } | null
  intervalMs?: number
  className?: string
}) {
  const [src, setSrc] = useState<string | null>(null)
  const [noSnapshot, setNoSnapshot] = useState(!snapshot)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const prevSrc = useRef<string | null>(null)

  useEffect(() => {
    let active = true

    const fetchLatest = () => {
      const token = localStorage.getItem('accessToken')
      fetch(`/api/proctoring/${sessionId}/latest-snapshot-image?t=${Date.now()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then(r => {
          if (r.status === 404) { if (active) setNoSnapshot(true); return Promise.reject(null) }
          if (!r.ok) return Promise.reject(null)
          return r.blob()
        })
        .then(blob => {
          if (!active || !blob) return
          setNoSnapshot(false)
          if (prevSrc.current) URL.revokeObjectURL(prevSrc.current)
          const url = URL.createObjectURL(blob)
          prevSrc.current = url
          setSrc(url)
          setUpdatedAt(new Date())
        })
        .catch(() => {})
    }

    fetchLatest()
    const interval = setInterval(fetchLatest, intervalMs)

    return () => {
      active = false
      clearInterval(interval)
      if (prevSrc.current) { URL.revokeObjectURL(prevSrc.current); prevSrc.current = null }
    }
  }, [sessionId, intervalMs])

  if (noSnapshot && !src) return (
    <div className={cn('w-full rounded bg-gray-100 flex flex-col items-center justify-center gap-1 text-gray-400', className)}>
      <CameraOff className="h-5 w-5" />
      <span className="text-[10px]">No snapshot yet</span>
    </div>
  )
  if (!src) return <div className={cn('w-full rounded bg-gray-200 animate-pulse', className)} />
  return (
    <div className="relative">
      <img src={src} alt="Latest webcam snapshot" className={cn('w-full object-cover rounded', className)} />
      {updatedAt && (
        <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded font-mono">
          {updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      )}
    </div>
  )
}

// Slide-in panel showing expanded live snapshot + full violations for a candidate
function CandidatePanel({ session, onClose }: { session: LiveSession; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" onClick={onClose} />
      {/* Panel */}
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">
              {session.candidate.firstName} {session.candidate.lastName}
            </p>
            <p className="text-xs text-muted-foreground truncate">{session.candidate.email}</p>
          </div>
          <button onClick={onClose} className="ml-2 p-1 rounded hover:bg-gray-200">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Live snapshot — 2s polling, full-width */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5 text-xs font-medium text-gray-500 uppercase tracking-wide">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              Live feed · refreshes every 2s
            </div>
            <LiveSnapshot sessionId={session.sessionId} snapshot={session.latestSnapshot} intervalMs={2_000} className="h-56 rounded-lg" />
          </div>

          {/* Test info */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-gray-50 rounded-lg px-3 py-2">
            <FileText className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{session.test.title}</span>
            <span className="ml-auto shrink-0 flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              <TimeLeft timeoutAt={session.timeoutAt} />
            </span>
          </div>

          {/* Risk */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Malpractice score</span>
              <span>{session.totalEvents} event{session.totalEvents !== 1 ? 's' : ''}</span>
            </div>
            <RiskBar score={session.riskScore} />
          </div>

          {/* All recent violations */}
          {session.recentEvents.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Violations</p>
              {session.recentEvents.map(ev => (
                <div key={ev.id} className={cn(
                  'flex items-start gap-2 px-3 py-2 rounded-lg border text-xs',
                  SEVERITY_COLOR[ev.severity] ?? 'bg-gray-50 border-gray-200 text-gray-700'
                )}>
                  <div className="mt-0.5 shrink-0"><EventTypeIcon type={ev.type} /></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium leading-tight">{EVENT_LABELS[ev.type] ?? ev.type.replace(/_/g, ' ')}</p>
                    {ev.description && <p className="opacity-70 mt-0.5 leading-tight">{ev.description}</p>}
                  </div>
                  <span className="ml-auto text-[10px] font-mono opacity-60 shrink-0">
                    {new Date(ev.occurredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-3">
          <Link
            to={`/admin/results/${session.sessionId}`}
            className="flex items-center justify-center gap-1.5 w-full text-sm text-primary hover:underline font-medium"
          >
            <Eye className="h-4 w-4" />Full session report →
          </Link>
        </div>
      </div>
    </div>
  )
}

function RiskBar({ score }: { score: number }) {
  const color = score >= 60 ? 'bg-red-500' : score >= 30 ? 'bg-orange-400' : 'bg-green-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-500', color)} style={{ width: `${score}%` }} />
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

// ── SSE hook ─────────────────────────────────────────────────────────────────
function useAlertStream(onAlert: (a: AlertPayload) => void) {
  const [connected, setConnected] = useState(false)
  const esRef = useRef<EventSource | null>(null)
  const onAlertRef = useRef(onAlert)
  useEffect(() => { onAlertRef.current = onAlert }, [onAlert])

  useEffect(() => {
    const token = localStorage.getItem('accessToken')
    if (!token) return

    // EventSource can't set custom headers — pass JWT as query param for SSE only
    const es = new EventSource(`/api/proctoring/live/alerts?jwt=${encodeURIComponent(token)}`)
    esRef.current = es

    es.onopen = () => setConnected(true)
    es.onerror = () => setConnected(false)
    es.onmessage = (e) => {
      try {
        const payload: AlertPayload = JSON.parse(e.data)
        if (payload.type === 'CONNECTED') { setConnected(true); return }
        onAlertRef.current(payload)
      } catch {}
    }

    return () => { es.close(); setConnected(false) }
  }, [])

  return connected
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function LiveMonitorPage() {
  const qc = useQueryClient()
  const [alertFeed, setAlertFeed] = useState<(AlertPayload & { id: string })[]>([])
  const [alertsEnabled, setAlertsEnabled] = useState(true)
  const [flashingSessions, setFlashingSessions] = useState<Set<string>>(new Set())
  const [expandedSession, setExpandedSession] = useState<LiveSession | null>(null)

  const { data: sessions = [], isLoading, refetch, isFetching } = useQuery<LiveSession[]>({
    queryKey: ['live-monitor'],
    queryFn: () => api.get('/proctoring/active').then(r => r.data.data),
    refetchInterval: 15_000,
  })

  const handleAlert = useCallback((alert: AlertPayload) => {
    if (!alertsEnabled) return
    const id = `${Date.now()}-${Math.random()}`
    setAlertFeed(prev => [{ ...alert, id }, ...prev].slice(0, 50))

    if (alert.sessionId) {
      setFlashingSessions(s => new Set(s).add(alert.sessionId!))
      setTimeout(() => setFlashingSessions(s => {
        const n = new Set(s); n.delete(alert.sessionId!); return n
      }), 3000)
      // Refresh the sessions list to get updated risk score
      qc.invalidateQueries({ queryKey: ['live-monitor'] })
    }

    if (alert.severity === 'CRITICAL' || alert.severity === 'HIGH') {
      toast({
        title: `⚠ ${EVENT_LABELS[alert.eventType ?? ''] ?? alert.eventType} — ${alert.candidate?.firstName} ${alert.candidate?.lastName}`,
        description: `${alert.test?.title} · ${alert.description ?? ''}`,
        variant: alert.severity === 'CRITICAL' ? 'destructive' : 'default',
      })
    }
  }, [alertsEnabled, qc])

  const connected = useAlertStream(handleAlert)

  // Keep expandedSession data fresh when the query refetches
  const expandedSessionId = expandedSession?.sessionId
  const expandedSessionFresh = expandedSessionId
    ? (sessions.find(s => s.sessionId === expandedSessionId) ?? expandedSession)
    : null

  return (
    <div className="space-y-6">
      {/* Expanded candidate panel */}
      {expandedSessionFresh && (
        <CandidatePanel session={expandedSessionFresh} onClose={() => setExpandedSession(null)} />
      )}
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Radio className="h-5 w-5 text-red-500 animate-pulse" />
            Live Monitor
          </h1>
          <p className="text-muted-foreground text-sm flex items-center gap-1.5 mt-0.5">
            {connected
              ? <><Wifi className="h-3.5 w-3.5 text-green-500" /><span className="text-green-600 font-medium">Live</span> — alerts stream in real time</>
              : <><WifiOff className="h-3.5 w-3.5 text-red-400" /><span className="text-red-500">Disconnected</span> — reconnecting…</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline" size="sm"
            onClick={() => setAlertsEnabled(v => !v)}
            className={cn(!alertsEnabled && 'text-muted-foreground')}
          >
            {alertsEnabled
              ? <><Bell className="h-4 w-4 mr-2 text-primary" />Alerts on</>
              : <><BellOff className="h-4 w-4 mr-2" />Alerts off</>}
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn('h-4 w-4 mr-2', isFetching && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* ── Session cards ── */}
        <div className="xl:col-span-2 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center space-y-3">
                <MonitorPlay className="h-12 w-12 text-muted-foreground mx-auto" />
                <p className="font-medium text-gray-700">No active sessions</p>
                <p className="text-sm text-muted-foreground">Sessions appear here when candidates are taking assessments.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {sessions.map(s => {
                const isFlashing = flashingSessions.has(s.sessionId)
                return (
                  <Card key={s.sessionId} className={cn(
                    'border transition-all duration-300',
                    isFlashing ? 'border-orange-400 shadow-orange-200 shadow-md ring-2 ring-orange-300' :
                    s.riskScore >= 60 ? 'border-red-300 bg-red-50/40' :
                    s.riskScore >= 30 ? 'border-orange-200' : 'border-gray-200'
                  )}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <CardTitle className="text-base leading-tight flex items-center gap-2">
                            {s.candidate.firstName} {s.candidate.lastName}
                            {isFlashing && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 animate-pulse">
                                <AlertTriangle className="h-3 w-3" />Alert
                              </span>
                            )}
                          </CardTitle>
                          <CardDescription className="truncate text-xs">{s.candidate.email}</CardDescription>
                        </div>
                        {s.riskScore >= 60 && (
                          <Badge variant="destructive" className="shrink-0 gap-1">
                            <ShieldAlert className="h-3 w-3" />High risk
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Live snapshot thumbnail — click to open expanded panel */}
                      <button
                        className="w-full text-left group relative"
                        onClick={() => setExpandedSession(s)}
                        title="Click to open live view"
                      >
                        <LiveSnapshot sessionId={s.sessionId} snapshot={s.latestSnapshot} />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 rounded">
                          <span className="flex items-center gap-1 bg-white/90 text-xs font-medium px-2 py-1 rounded shadow">
                            <Maximize2 className="h-3 w-3" />Expand
                          </span>
                        </div>
                      </button>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <FileText className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate flex-1">{s.test.title}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />Time left:
                        </div>
                        <TimeLeft timeoutAt={s.timeoutAt} />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Malpractice score</span>
                          <span>{s.totalEvents} event{s.totalEvents !== 1 ? 's' : ''}</span>
                        </div>
                        <RiskBar score={s.riskScore} />
                      </div>
                      {s.recentEvents.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-gray-600">Recent flags</p>
                          {s.recentEvents.slice(0, 3).map(ev => (
                            <div key={ev.id} className="flex items-center gap-2 text-xs">
                              <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0', SEVERITY_COLOR[ev.severity] ?? 'bg-gray-100 text-gray-600 border')}>
                                {ev.severity}
                              </span>
                              <span className="truncate text-gray-600">{EVENT_LABELS[ev.type] ?? ev.type.replace(/_/g, ' ').toLowerCase()}</span>
                              <span className="ml-auto text-muted-foreground shrink-0">
                                {new Date(ev.occurredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      <Link
                        to={`/admin/results/${s.sessionId}`}
                        className="flex items-center justify-center gap-1 w-full text-xs text-primary hover:underline pt-1"
                      >
                        <Eye className="h-3 w-3" />View full session
                      </Link>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Live alert feed ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              Alert Feed
              {alertFeed.length > 0 && (
                <span className="bg-primary text-primary-foreground text-xs rounded-full px-1.5 py-0.5 font-mono">
                  {alertFeed.length}
                </span>
              )}
            </h2>
            {alertFeed.length > 0 && (
              <button
                onClick={() => setAlertFeed([])}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>

          {alertFeed.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center space-y-2">
              <Bell className="h-6 w-6 text-muted-foreground mx-auto" />
              <p className="text-xs text-muted-foreground">
                {connected ? 'Waiting for violations…' : 'Connecting to alert stream…'}
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {alertFeed.map(alert => (
                <div
                  key={alert.id}
                  className={cn(
                    'rounded-lg border p-3 text-xs space-y-1.5 transition-all',
                    SEVERITY_COLOR[alert.severity ?? 'MEDIUM'] ?? 'bg-gray-50 border-gray-200'
                  )}
                >
                  <div className="flex items-center gap-1.5 font-semibold">
                    <EventTypeIcon type={alert.eventType ?? ''} />
                    {EVENT_LABELS[alert.eventType ?? ''] ?? alert.eventType}
                    <span className="ml-auto text-[10px] font-normal opacity-60">
                      {alert.occurredAt ? new Date(alert.occurredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
                    </span>
                  </div>
                  <p className="font-medium opacity-90">
                    {alert.candidate?.firstName} {alert.candidate?.lastName}
                  </p>
                  <p className="opacity-70 truncate">{alert.test?.title}</p>
                  {alert.description && (
                    <p className="opacity-60 italic">{alert.description}</p>
                  )}
                  {alert.sessionId && (
                    <Link
                      to={`/admin/results/${alert.sessionId}`}
                      className="inline-flex items-center gap-1 hover:underline opacity-80"
                    >
                      <Eye className="h-3 w-3" />View session
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
