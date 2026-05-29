import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import {
  BarChart3, TrendingUp, Download, Webhook, Loader2,
  Users, ClipboardList, CheckCircle2, Trophy, Medal,
  AlertTriangle, Clock, Ban,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

const PIE_COLORS = ['#10b981', '#ef4444']
const RANGE_OPTIONS = [
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
  { label: '90 days', value: '90d' },
  { label: 'All time', value: 'all' },
]

export function AnalyticsPage() {
  const [range, setRange] = useState<string>('30d')
  const [selectedTestId, setSelectedTestId] = useState<string>('')

  const { data: overview, isLoading: loadingOverview } = useQuery({
    queryKey: ['analytics-overview', range],
    queryFn: () => api.get(`/analytics/overview?range=${range}`).then(r => r.data.data),
  })

  const { data: topCandidates } = useQuery({
    queryKey: ['analytics-top-candidates', range],
    queryFn: () => api.get(`/analytics/top-candidates?range=${range}`).then(r => r.data.data),
  })

  const { data: trend } = useQuery({
    queryKey: ['analytics-trend'],
    queryFn: () => api.get('/analytics/pass-rate-trend').then(r => r.data.data),
  })

  const { data: testsData } = useQuery({
    queryKey: ['tests-all'],
    queryFn: () => api.get('/tests?limit=100').then(r => r.data.data),
  })

  const { data: testAnalytics, isLoading: loadingTest } = useQuery({
    queryKey: ['analytics-test', selectedTestId],
    queryFn: () => api.get(`/analytics/tests/${selectedTestId}`).then(r => r.data.data),
    enabled: !!selectedTestId,
  })

  const handleExport = () => {
    if (!selectedTestId) return
    const token = localStorage.getItem('accessToken')
    const base = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
    window.open(`${base}/analytics/tests/${selectedTestId}/export?token=${token}`, '_blank')
  }

  if (loadingOverview) {
    return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
            <p className="text-muted-foreground text-sm">Insights across all tests and candidates</p>
          </div>
        </div>
        {/* Date range selector */}
        <div className="flex items-center gap-1 rounded-lg border bg-background p-1">
          {RANGE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setRange(opt.value)}
              className={cn(
                'px-3 py-1 text-sm rounded-md transition-colors',
                range === opt.value
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Overview KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            icon: ClipboardList, label: 'Tests', color: 'text-indigo-600',
            value: overview?.tests.total ?? 0,
            sub: `${overview?.tests.published ?? 0} published`,
          },
          {
            icon: Users, label: 'Candidates', color: 'text-blue-600',
            value: overview?.candidates.total ?? 0,
            sub: 'total registered',
          },
          {
            icon: CheckCircle2, label: 'Completion', color: 'text-green-600',
            value: `${overview?.sessions.completionRate ?? 0}%`,
            sub: `${overview?.sessions.completed ?? 0} completed`,
          },
          {
            icon: Trophy, label: 'Pass Rate', color: 'text-amber-600',
            value: `${overview?.scores.passRate ?? 0}%`,
            sub: `avg ${overview?.scores.avgPercentage ?? 0}% score`,
          },
        ].map(item => (
          <Card key={item.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">{item.label}</span>
                <item.icon className={cn('h-4 w-4', item.color)} />
              </div>
              <p className={cn('text-3xl font-bold', item.color)}>{item.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{item.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Disqualification alert */}
      {(overview?.sessions?.disqualified ?? 0) > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <Ban className="h-4 w-4 shrink-0" />
          <span>
            <strong>{overview.sessions.disqualified}</strong> candidate{overview.sessions.disqualified > 1 ? 's' : ''} disqualified
            for proctoring violations in this period —{' '}
            <Link to="/admin/results?status=DISQUALIFIED" className="underline underline-offset-2 font-medium">view sessions</Link>
          </span>
        </div>
      )}

      {/* Invitation alerts */}
      {(overview?.invitations?.expiringSoon ?? 0) > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            <strong>{overview.invitations.expiringSoon}</strong> invitation{overview.invitations.expiringSoon > 1 ? 's' : ''} expiring
            within 48 hours —{' '}
            <Link to="/admin/candidates" className="underline underline-offset-2 font-medium">view candidates</Link>
          </span>
        </div>
      )}

      {/* Charts row: trend + pass/fail overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pass-rate trend — 2/3 width */}
        {trend && trend.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4" />Pass Rate Trend (12 weeks)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => `${v}%`} />
                  <Line type="monotone" dataKey="passRate" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} name="Pass Rate" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Pending invitations summary — 1/3 width */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />Invitation Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Pending</span>
              <span className="font-semibold text-gray-900">{overview?.invitations?.pending ?? 0}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Expiring in 48h</span>
              <span className={cn('font-semibold', (overview?.invitations?.expiringSoon ?? 0) > 0 ? 'text-amber-600' : 'text-gray-900')}>
                {overview?.invitations?.expiringSoon ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Sessions total</span>
              <span className="font-semibold text-gray-900">{overview?.sessions?.total ?? 0}</span>
            </div>
            <div className="pt-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Completion</span>
                <span>{overview?.sessions?.completionRate ?? 0}%</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-green-500 transition-all"
                  style={{ width: `${overview?.sessions?.completionRate ?? 0}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Candidates Leaderboard */}
      {topCandidates && topCandidates.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Medal className="h-4 w-4 text-amber-500" />Top Candidates
              <span className="text-xs font-normal text-muted-foreground">by average score</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {topCandidates.map((c: any, i: number) => (
                <div key={c.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                  <span className={cn(
                    'w-6 text-center text-sm font-bold shrink-0',
                    i === 0 ? 'text-amber-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-400' : 'text-muted-foreground'
                  )}>
                    #{i + 1}
                  </span>
                  <Link
                    to={`/admin/candidates/${c.id}`}
                    className="flex-1 min-w-0 hover:underline"
                  >
                    <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                  </Link>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-gray-900">{c.avgScore}%</p>
                    <p className="text-xs text-muted-foreground">{c.attempts} attempt{c.attempts !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="w-20 shrink-0">
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={cn('h-full rounded-full', c.avgScore >= 70 ? 'bg-green-500' : c.avgScore >= 50 ? 'bg-amber-500' : 'bg-red-500')}
                        style={{ width: `${c.avgScore}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-test analytics */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Test Analytics</CardTitle>
              <CardDescription>Score distribution and question insights for a specific test</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={selectedTestId}
                onChange={e => setSelectedTestId(e.target.value)}
              >
                <option value="">Select a test...</option>
                {testsData?.tests?.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
              {selectedTestId && (
                <Button variant="outline" size="sm" onClick={handleExport}>
                  <Download className="h-4 w-4 mr-1" />CSV
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!selectedTestId && (
            <p className="text-sm text-muted-foreground text-center py-8">Select a test to view analytics</p>
          )}
          {loadingTest && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>}
          {testAnalytics && (
            <div className="space-y-6">
              {/* KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  { label: 'Total Sessions', value: testAnalytics.totalSessions },
                  { label: 'Completed', value: testAnalytics.completed },
                  { label: 'Pass Rate', value: `${testAnalytics.passRate}%` },
                  { label: 'Avg Score', value: `${testAnalytics.avgScore}%` },
                  { label: 'Disqualified', value: testAnalytics.disqualified ?? 0, red: (testAnalytics.disqualified ?? 0) > 0 },
                ].map(kpi => (
                  <div key={kpi.label} className={cn('rounded-lg border p-3 text-center', (kpi as any).red ? 'bg-red-50 border-red-200' : 'bg-gray-50')}>
                    <p className={cn('text-xl font-bold', (kpi as any).red ? 'text-red-600' : 'text-gray-900')}>{kpi.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{kpi.label}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Score distribution */}
                {testAnalytics.scoreDistribution?.length > 0 && (
                  <div className="lg:col-span-2">
                    <h3 className="text-sm font-medium text-gray-700 mb-3">Score Distribution</h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={testAnalytics.scoreDistribution}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="range" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" name="Candidates" fill="#6366f1" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Pass/Fail pie */}
                {testAnalytics.completed > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-3">Pass vs Fail</h3>
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Passed', value: testAnalytics.passed },
                            { name: 'Failed', value: testAnalytics.completed - testAnalytics.passed },
                          ]}
                          cx="50%" cy="50%"
                          innerRadius={40} outerRadius={70}
                          dataKey="value"
                        >
                          {PIE_COLORS.map((color, i) => <Cell key={i} fill={color} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-col gap-2 mt-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="h-3 w-3 rounded-full bg-green-500 shrink-0" />
                        <span className="text-muted-foreground">Passed</span>
                        <span className="ml-auto font-bold text-green-600">{testAnalytics.passed}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="h-3 w-3 rounded-full bg-red-500 shrink-0" />
                        <span className="text-muted-foreground">Failed</span>
                        <span className="ml-auto font-bold text-red-600">{testAnalytics.completed - testAnalytics.passed}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Avg time: {testAnalytics.avgTimeMinutes} min</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Proctoring violation breakdown */}
              {testAnalytics.violationBreakdown?.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Proctoring Violations</h3>
                  <div className="space-y-2">
                    {(() => {
                      const max = Math.max(...testAnalytics.violationBreakdown.map((v: any) => v.count), 1)
                      const VIOLATION_LABEL: Record<string, string> = {
                        TAB_SWITCH: 'Tab switched', WINDOW_BLUR: 'Window lost focus', FULLSCREEN_EXIT: 'Exited fullscreen',
                        COPY_PASTE: 'Copy/paste attempt', RIGHT_CLICK: 'Right-click', WEBCAM_BLOCKED: 'Webcam blocked',
                        MULTIPLE_FACES: 'Multiple faces', NO_FACE_DETECTED: 'No face', NOISE_DETECTED: 'Background noise',
                        DEVTOOLS_OPEN: 'DevTools opened', PHONE_DETECTED: 'Phone detected', HEAD_TURNED: 'Head turned',
                        SCREEN_RECORDING_STOPPED: 'Recording stopped', FACE_OBSTRUCTED: 'Face hidden',
                        SUSPECTED_ASSISTANCE: 'Suspected assistance', IDENTITY_MISMATCH: 'Identity mismatch',
                        POOR_LIGHTING: 'Poor lighting', SECURE_BROWSER_BYPASSED: 'Secure browser bypassed',
                      }
                      return testAnalytics.violationBreakdown.map((v: any) => (
                        <div key={v.type} className="flex items-center gap-3 text-xs">
                          <span className="w-36 shrink-0 text-muted-foreground truncate">{VIOLATION_LABEL[v.type] ?? v.type.replace(/_/g, ' ')}</span>
                          <div className="flex-1 h-5 rounded bg-gray-100 overflow-hidden">
                            <div
                              className="h-full rounded bg-orange-400 transition-all"
                              style={{ width: `${Math.round((v.count / max) * 100)}%` }}
                            />
                          </div>
                          <span className="w-8 text-right font-semibold text-gray-700 shrink-0">{v.count}</span>
                        </div>
                      ))
                    })()}
                  </div>
                </div>
              )}

              {/* Hardest questions */}
              {testAnalytics.questionDifficulty?.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Question Difficulty Breakdown</h3>
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Question</th>
                          <th className="text-center px-3 py-2 font-medium text-muted-foreground text-xs">Attempts</th>
                          <th className="text-center px-3 py-2 font-medium text-muted-foreground text-xs">Avg Score</th>
                          <th className="text-center px-3 py-2 font-medium text-muted-foreground text-xs hidden sm:table-cell">Avg Time</th>
                          <th className="text-center px-3 py-2 font-medium text-muted-foreground text-xs">Difficulty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {testAnalytics.questionDifficulty.map((q: any, i: number) => (
                          <tr key={i} className="border-b last:border-0 hover:bg-gray-50/50">
                            <td className="px-3 py-2 max-w-xs">
                              <p className="truncate text-gray-900">{q.title}</p>
                              <p className="text-xs text-muted-foreground">{q.type.replace(/_/g, ' ')}</p>
                            </td>
                            <td className="px-3 py-2 text-center text-muted-foreground">{q.attempts}</td>
                            <td className="px-3 py-2 text-center">
                              <span className={cn(
                                'font-semibold',
                                q.avgScore >= 70 ? 'text-green-600' : q.avgScore >= 50 ? 'text-amber-600' : 'text-red-600'
                              )}>
                                {q.avgScore}%
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center text-muted-foreground hidden sm:table-cell">
                              {q.avgTimeSecs > 0 ? `${q.avgTimeSecs}s` : '—'}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-xs',
                                  q.difficulty === 'HARD' ? 'border-red-300 text-red-700 bg-red-50' :
                                  q.difficulty === 'MEDIUM' ? 'border-amber-300 text-amber-700 bg-amber-50' :
                                  'border-green-300 text-green-700 bg-green-50'
                                )}
                              >
                                {q.difficulty}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ATS Webhooks */}
      <AtsWebhooks />
    </div>
  )
}

function AtsWebhooks() {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ url: '', events: 'session.submitted', secret: '' })
  const [saving, setSaving] = useState(false)

  const { data: webhooks, refetch } = useQuery({
    queryKey: ['webhooks'],
    queryFn: () => api.get('/analytics/webhooks').then(r => r.data.data),
  })

  const save = async () => {
    if (!form.url) return
    setSaving(true)
    try {
      await api.post('/analytics/webhooks', {
        url: form.url,
        events: form.events.split(',').map(e => e.trim()),
        secret: form.secret || undefined,
      })
      refetch()
      setShowForm(false)
      setForm({ url: '', events: 'session.submitted', secret: '' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Webhook className="h-4 w-4" />ATS Webhooks</CardTitle>
            <CardDescription>Send session results to Greenhouse, Lever, or any ATS via webhook</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowForm(v => !v)}>Add Webhook</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {showForm && (
          <div className="rounded-lg border p-4 space-y-3 bg-gray-50">
            <div className="space-y-1">
              <label className="text-xs font-medium">Endpoint URL</label>
              <input
                className="flex h-9 w-full rounded-md border border-input bg-white px-3 text-sm"
                placeholder="https://hooks.yourATS.com/assessiq"
                value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Events (comma-separated)</label>
              <input
                className="flex h-9 w-full rounded-md border border-input bg-white px-3 text-sm"
                placeholder="session.submitted, session.scored"
                value={form.events} onChange={e => setForm(f => ({ ...f, events: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Secret (optional, for HMAC)</label>
              <input
                className="flex h-9 w-full rounded-md border border-input bg-white px-3 text-sm"
                placeholder="webhook-signing-secret"
                value={form.secret} onChange={e => setForm(f => ({ ...f, secret: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={saving || !form.url}>
                {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {webhooks?.length === 0 && !showForm && (
          <p className="text-sm text-muted-foreground text-center py-4">No webhooks configured yet</p>
        )}

        {webhooks?.map((w: any) => (
          <div key={w.id} className="flex items-center gap-3 p-3 rounded-lg border text-sm">
            <div className="flex-1 min-w-0">
              <p className="font-mono text-xs truncate">{w.url}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{w.events.join(', ')}</p>
            </div>
            <span className="text-xs text-green-600 font-medium">Active</span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
