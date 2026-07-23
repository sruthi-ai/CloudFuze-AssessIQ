import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { BarChart3, Search, Loader2, ChevronRight, Trash2, Download, ArrowUpDown, Sparkles, X as XIcon } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { formatDateTime } from '@/lib/utils'

const STATUS_VARIANT: Record<string, any> = {
  SUBMITTED: 'success', IN_PROGRESS: 'warning', TIMED_OUT: 'destructive', NOT_STARTED: 'secondary',
  DISQUALIFIED: 'destructive',
}

function riskLevel(eventCount: number): { label: string; variant: any } {
  if (eventCount === 0) return { label: 'None', variant: 'secondary' }
  if (eventCount <= 3) return { label: 'Low', variant: 'outline' }
  if (eventCount <= 8) return { label: 'Medium', variant: 'warning' }
  return { label: 'High', variant: 'destructive' }
}

// Round to a clean number: whole if integer, else one decimal (AI-graded audio
// can yield fractional marks like 3.5).
function fmtMarks(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

function exportCSV(sessions: any[]) {
  const headers = ['Candidate', 'Email', 'Test', 'Status', 'Score', 'Score %', 'Pass', 'Submitted', 'Malpractice']
  const rows = sessions.map(s => [
    `${s.candidate.firstName} ${s.candidate.lastName}`,
    s.candidate.email,
    s.test.title,
    s.status,
    s.score ? `${fmtMarks(s.score.earnedPoints)}/${fmtMarks(s.score.totalPoints)}` : '',
    s.score ? Math.round(s.score.percentage) : '',
    s.score?.passed === true ? 'Pass' : s.score?.passed === false ? 'Fail' : '',
    s.submittedAt ? new Date(s.submittedAt).toLocaleString() : '',
    s._count?.proctoringEvents ?? 0,
  ])
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `results-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

type SortKey = 'submittedAt' | 'score' | 'candidate'
type SortDir = 'asc' | 'desc'

type ResultFilters = {
  search: string; statusFilter: string; testFilter: string
  dateFrom: string; dateTo: string; minScore: string; maxScore: string
}

// Shared by the on-screen table and CSV export, so "export all" (no selection)
// always matches what's actually visible under the current filters instead of
// silently exporting the tenant's entire unfiltered result set.
function filterSessions(list: any[], f: ResultFilters): any[] {
  const fromMs = f.dateFrom ? new Date(f.dateFrom + 'T00:00:00').getTime() : null
  const toMs = f.dateTo ? new Date(f.dateTo + 'T23:59:59.999').getTime() : null
  const minPct = f.minScore !== '' ? Number(f.minScore) : null
  const maxPct = f.maxScore !== '' ? Number(f.maxScore) : null

  return list.filter((s: any) => {
    const q = f.search.toLowerCase()
    const matchSearch = !q ||
      s.candidate.email.toLowerCase().includes(q) ||
      `${s.candidate.firstName} ${s.candidate.lastName}`.toLowerCase().includes(q) ||
      s.test.title.toLowerCase().includes(q)
    const matchStatus = !f.statusFilter || s.status === f.statusFilter
    const matchTest = !f.testFilter || s.test?.id === f.testFilter

    let matchDate = true
    if (fromMs !== null || toMs !== null) {
      const t = s.submittedAt ? new Date(s.submittedAt).getTime() : null
      matchDate = t !== null && (fromMs === null || t >= fromMs) && (toMs === null || t <= toMs)
    }

    let matchScore = true
    if (minPct !== null || maxPct !== null) {
      const pct = s.score?.percentage
      matchScore = pct != null && (minPct === null || pct >= minPct) && (maxPct === null || pct <= maxPct)
    }

    return matchSearch && matchStatus && matchTest && matchDate && matchScore
  })
}

export function ResultsPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [testFilter, setTestFilter] = useState('')   // test id
  const [dateFrom, setDateFrom] = useState('')   // yyyy-mm-dd (inclusive)
  const [dateTo, setDateTo] = useState('')       // yyyy-mm-dd (inclusive)
  const [minScore, setMinScore] = useState('')   // percentage 0-100
  const [maxScore, setMaxScore] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('submittedAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const queryClient = useQueryClient()

  // testId/status are pushed to the server so switching to a specific test always
  // returns that test's own complete result set — previously this fetched a flat,
  // tenant-wide "most recent 200" snapshot with every filter applied client-side
  // afterward, so a test whose results had aged out of that top-200 window (busy
  // tenants cross that fast — multiple tests each with dozens+ sessions) looked
  // like its older results had vanished, when they were just never fetched.
  const { data, isLoading } = useQuery({
    queryKey: ['results', testFilter, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '2000' })
      if (testFilter) params.set('testId', testFilter)
      if (statusFilter) params.set('status', statusFilter)
      return api.get(`/results?${params.toString()}`).then(r => r.data.data)
    },
  })

  // Independent of the (now filtered) results query above, so the dropdown
  // always lists every test regardless of which one is currently selected.
  const { data: testsForFilter } = useQuery({
    queryKey: ['tests-for-results-filter'],
    queryFn: () => api.get('/tests?limit=500').then(r => r.data.data.tests as { id: string; title: string }[]),
  })

  const deleteMutation = useMutation({
    mutationFn: (sessionId: string) => api.delete(`/results/${sessionId}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['results'] }); setConfirmDelete(null) },
  })

  // Grade all pending, or only a selected subset when sessionIds is passed.
  const gradeMutation = useMutation({
    mutationFn: (sessionIds?: string[]) =>
      api.post('/results/ai-grade-all', sessionIds ? { sessionIds } : {}).then(r => r.data),
    onSuccess: (res: any) => {
      const d = res?.data ?? res
      queryClient.invalidateQueries({ queryKey: ['results'] })
      setSelectedIds(new Set())
      const topErrors: string[] = d?.topErrors ?? []
      if (d?.warning) {
        toast({ title: 'Nothing was graded', description: d.warning, variant: 'destructive' })
      } else if (d?.answersFailed > 0 && topErrors.length > 0) {
        // Show the actual reason grading failed — no server log access needed.
        toast({
          title: `${d.answersFailed} answer(s) failed to grade`,
          description: `${d?.answersGraded ?? 0} graded OK. Reason: ${topErrors[0]}${topErrors.length > 1 ? ` (+${topErrors.length - 1} other error type(s))` : ''}`,
          variant: 'destructive',
        })
      } else {
        toast({ title: 'AI grading complete', description: `Graded ${d?.answersGraded ?? 0} answer(s) across ${d?.sessionsProcessed ?? 0} session(s)${d?.answersFailed ? `, ${d.answersFailed} failed` : ''}. Scores now include spoken/written marks.` })
      }
    },
    onError: () => toast({ title: 'AI grading failed', description: 'Check that a valid OpenAI key with credits is set on the server.', variant: 'destructive' }),
  })

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sessions = useMemo(() => {
    let list = filterSessions(data?.sessions ?? [], { search, statusFilter, testFilter, dateFrom, dateTo, minScore, maxScore })

    list = [...list].sort((a: any, b: any) => {
      let av: any, bv: any
      if (sortKey === 'submittedAt') { av = a.submittedAt ? new Date(a.submittedAt).getTime() : 0; bv = b.submittedAt ? new Date(b.submittedAt).getTime() : 0 }
      else if (sortKey === 'score') { av = a.score?.percentage ?? -1; bv = b.score?.percentage ?? -1 }
      else { av = `${a.candidate.firstName} ${a.candidate.lastName}`.toLowerCase(); bv = `${b.candidate.firstName} ${b.candidate.lastName}`.toLowerCase() }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [data, search, statusFilter, testFilter, dateFrom, dateTo, minScore, maxScore, sortKey, sortDir])

  // All of the tenant's tests, for the test filter dropdown — fetched
  // independently of the (now testId-filtered) results query above, so
  // selecting one test doesn't collapse the dropdown down to just itself.
  const testOptions = useMemo(() => {
    return (testsForFilter ?? []).map(t => [t.id, t.title] as [string, string]).sort((a, b) => a[1].localeCompare(b[1]))
  }, [testsForFilter])

  function SortTh({ label, col }: { label: string; col: SortKey }) {
    return (
      <th
        className="text-left px-4 py-3 font-medium text-gray-600 cursor-pointer select-none hover:text-gray-900"
        onClick={() => toggleSort(col)}
      >
        <span className="flex items-center gap-1">
          {label}
          <ArrowUpDown className={`h-3 w-3 ${sortKey === col ? 'text-primary' : 'text-gray-400'}`} />
        </span>
      </th>
    )
  }

  // Only submitted/timed-out sessions can be graded — those are selectable.
  const gradable = sessions.filter((s: any) => s.status === 'SUBMITTED' || s.status === 'TIMED_OUT')
  const allGradableSelected = gradable.length > 0 && gradable.every((s: any) => selectedIds.has(s.id))
  const toggleOne = (id: string) => setSelectedIds(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const toggleAll = () => setSelectedIds(prev =>
    gradable.length > 0 && gradable.every((s: any) => prev.has(s.id)) ? new Set() : new Set(gradable.map((s: any) => s.id))
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Results</h1>
          <p className="text-muted-foreground">All candidate assessment sessions</p>
        </div>
        <div className="flex items-center gap-2">
        {selectedIds.size > 0 && (
          <Button variant="default" size="sm" disabled={gradeMutation.isPending} onClick={() => gradeMutation.mutate(Array.from(selectedIds))}
            title="AI-grade only the selected candidates' spoken/written answers. Final score = existing marks + AI marks.">
            {gradeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
            AI grade selected ({selectedIds.size})
          </Button>
        )}
        {sessions.length > 0 && (
          <Button variant="outline" size="sm" disabled={gradeMutation.isPending} onClick={() => gradeMutation.mutate(undefined)}
            title="Run AI grading on every submitted session with answers still pending (spoken/written). Uses OpenAI credits.">
            {gradeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Grade all pending
          </Button>
        )}
        {sessions.length > 0 && (
          <Button variant="outline" size="sm" disabled={exporting} onClick={async () => {
            // Selection wins if the admin has checked specific rows — export
            // exactly those, from what's already loaded, no re-fetch needed.
            if (selectedIds.size > 0) {
              exportCSV(sessions.filter((s: any) => selectedIds.has(s.id)))
              return
            }
            // No selection: export every result matching the current filters
            // (not just the ones already loaded on screen) — testId/status can
            // be pushed to the server, the rest (search/date/score) only exist
            // client-side so they're re-applied to the larger fetch.
            setExporting(true)
            try {
              const params = new URLSearchParams({ limit: '5000' })
              if (testFilter) params.set('testId', testFilter)
              if (statusFilter) params.set('status', statusFilter)
              const res = await api.get(`/results?${params.toString()}`)
              exportCSV(filterSessions(res.data.data.sessions, { search, statusFilter, testFilter, dateFrom, dateTo, minScore, maxScore }))
            } catch {
              toast({ title: 'Export failed', variant: 'destructive' })
            } finally {
              setExporting(false)
            }
          }}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
            {selectedIds.size > 0 ? `Export selected (${selectedIds.size})` : 'Export CSV'}
          </Button>
        )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by candidate or test..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="TIMED_OUT">Timed Out</option>
          <option value="NOT_STARTED">Not Started</option>
          <option value="DISQUALIFIED">Disqualified</option>
        </select>

        {/* Test filter */}
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm max-w-52"
          value={testFilter}
          onChange={e => setTestFilter(e.target.value)}
          title="Filter by test"
        >
          <option value="">All tests</option>
          {testOptions.map(([id, title]) => (
            <option key={id} value={id}>{title}</option>
          ))}
        </select>

        {/* Date range (on submission date) */}
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span className="whitespace-nowrap">Submitted</span>
          <input type="date" className="h-10 rounded-md border border-input bg-background px-2 text-sm" value={dateFrom}
            max={dateTo || undefined} onChange={e => setDateFrom(e.target.value)} title="From date (inclusive)" />
          <span>–</span>
          <input type="date" className="h-10 rounded-md border border-input bg-background px-2 text-sm" value={dateTo}
            min={dateFrom || undefined} onChange={e => setDateTo(e.target.value)} title="To date (inclusive)" />
        </div>

        {/* Score range (percentage) */}
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span className="whitespace-nowrap">Score %</span>
          <input type="number" min={0} max={100} placeholder="min" value={minScore}
            className="h-10 w-16 rounded-md border border-input bg-background px-2 text-sm"
            onChange={e => setMinScore(e.target.value)} title="Minimum score %" />
          <span>–</span>
          <input type="number" min={0} max={100} placeholder="max" value={maxScore}
            className="h-10 w-16 rounded-md border border-input bg-background px-2 text-sm"
            onChange={e => setMaxScore(e.target.value)} title="Maximum score %" />
        </div>

        {(search || statusFilter || testFilter || dateFrom || dateTo || minScore || maxScore) && (
          <Button variant="ghost" size="sm" onClick={() => {
            setSearch(''); setStatusFilter(''); setTestFilter(''); setDateFrom(''); setDateTo(''); setMinScore(''); setMaxScore('')
          }}>
            <XIcon className="h-4 w-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* Loud, not silent: if the server has more matching rows than we fetched,
          say so — narrow with a test/status filter to pull the complete set for
          just that slice instead of a truncated tenant-wide snapshot. */}
      {data && data.total > (data.sessions?.length ?? 0) && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Showing the latest {data.sessions.length.toLocaleString()} of {data.total.toLocaleString()} matching results.
          Narrow with a test or status filter to see the complete set for that slice.
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              {(search || statusFilter || testFilter || dateFrom || dateTo || minScore || maxScore) ? 'No results match your filters.' : 'No results yet. Invite candidates to take a test.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input type="checkbox" className="rounded cursor-pointer" checked={allGradableSelected}
                    onChange={toggleAll} disabled={gradable.length === 0}
                    title="Select all gradable candidates" />
                </th>
                <SortTh label="Candidate" col="candidate" />
                <th className="text-left px-4 py-3 font-medium text-gray-600">Test</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <SortTh label="Score" col="score" />
                <th className="text-left px-4 py-3 font-medium text-gray-600">Malpractice</th>
                <SortTh label="Submitted" col="submittedAt" />
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y bg-white">
              {sessions.map((s: any) => {
                const risk = riskLevel(s._count?.proctoringEvents ?? 0)
                const canGrade = s.status === 'SUBMITTED' || s.status === 'TIMED_OUT'
                return (
                  <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <input type="checkbox" className="rounded cursor-pointer disabled:opacity-30"
                        checked={selectedIds.has(s.id)} disabled={!canGrade}
                        onChange={() => toggleOne(s.id)}
                        title={canGrade ? 'Select for AI grading' : 'Only submitted sessions can be graded'} />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{s.candidate.firstName} {s.candidate.lastName}</p>
                      <p className="text-xs text-muted-foreground">{s.candidate.email}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{s.test.title}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[s.status] ?? 'secondary'}>{s.status.replace('_', ' ')}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {s.score ? (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{fmtMarks(s.score.earnedPoints)}/{fmtMarks(s.score.totalPoints)}</span>
                          <span className="text-xs text-muted-foreground">({Math.round(s.score.percentage)}%)</span>
                          {s.score.passed !== null && (
                            <Badge variant={s.score.passed ? 'success' : 'destructive'} className="text-xs">
                              {s.score.passed ? 'Pass' : 'Fail'}
                            </Badge>
                          )}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {s.test?.enforceViolations === false ? (
                        <Badge variant="secondary" className="text-xs" title="Advisory proctoring: monitored/recorded but violations not enforced">Monitoring only</Badge>
                      ) : (
                        <Badge variant={risk.variant} className="text-xs">{risk.label}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {s.submittedAt ? formatDateTime(s.submittedAt) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {confirmDelete === s.id ? (
                          <>
                            <span className="text-xs text-gray-500 mr-1">Delete?</span>
                            <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(s.id)}>
                              {deleteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Yes'}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setConfirmDelete(null)}>Cancel</Button>
                          </>
                        ) : (
                          <>
                            <Button variant="ghost" size="sm" asChild>
                              <Link to={`/admin/results/${s.id}`}>View <ChevronRight className="h-3.5 w-3.5 ml-1" /></Link>
                            </Button>
                            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => setConfirmDelete(s.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t bg-gray-50 text-xs text-muted-foreground">
            {sessions.length} result{sessions.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  )
}
