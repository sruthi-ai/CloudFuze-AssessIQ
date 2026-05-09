import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import {
  BarChart3, TrendingUp, Download, Webhook, Loader2,
  Users, ClipboardList, CheckCircle2, Trophy
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

export function AnalyticsPage() {
  const [selectedTestId, setSelectedTestId] = useState<string>('')

  const { data: overview, isLoading: loadingOverview } = useQuery({
    queryKey: ['analytics-overview'],
    queryFn: () => api.get('/analytics/overview').then(r => r.data.data),
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
    const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/analytics/tests/${selectedTestId}/export`
    window.open(url, '_blank')
  }

  if (loadingOverview) {
    return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BarChart3 className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-muted-foreground">Insights across all tests and candidates</p>
        </div>
      </div>

      {/* Overview KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { icon: ClipboardList, label: 'Tests', value: overview?.tests.total ?? 0, sub: `${overview?.tests.published ?? 0} published`, color: 'text-indigo-600' },
          { icon: Users, label: 'Candidates', value: overview?.candidates.total ?? 0, sub: 'total registered', color: 'text-blue-600' },
          { icon: CheckCircle2, label: 'Completion', value: `${overview?.sessions.completionRate ?? 0}%`, sub: `${overview?.sessions.completed ?? 0} completed`, color: 'text-green-600' },
          { icon: Trophy, label: 'Pass Rate', value: `${overview?.scores.passRate ?? 0}%`, sub: `avg ${overview?.scores.avgPercentage ?? 0}% score`, color: 'text-amber-600' },
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

      {/* Pass-rate trend */}
      {trend && trend.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TrendingUp className="h-4 w-4" />Pass Rate Trend (12 weeks)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => `${v}%`} />
                <Line type="monotone" dataKey="passRate" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} name="Pass Rate" />
              </LineChart>
            </ResponsiveContainer>
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
              {/* KPIs for test */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Total Sessions', value: testAnalytics.totalSessions },
                  { label: 'Completed', value: testAnalytics.completed },
                  { label: 'Pass Rate', value: `${testAnalytics.passRate}%` },
                  { label: 'Avg Score', value: `${testAnalytics.avgScore}%` },
                ].map(kpi => (
                  <div key={kpi.label} className="rounded-lg bg-gray-50 border p-3 text-center">
                    <p className="text-xl font-bold text-gray-900">{kpi.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{kpi.label}</p>
                  </div>
                ))}
              </div>

              {/* Score distribution */}
              {testAnalytics.scoreDistribution?.length > 0 && (
                <div>
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
                <div className="grid grid-cols-2 gap-6">
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
                          <Cell fill="#10b981" />
                          <Cell fill="#ef4444" />
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-col justify-center gap-3">
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
                    <div className="text-xs text-muted-foreground">Avg time: {testAnalytics.avgTimeMinutes} min</div>
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
