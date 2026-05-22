import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { BarChart3, Search, Loader2, ChevronRight, Trash2, Download, ArrowUpDown } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { formatDateTime } from '@/lib/utils'

const STATUS_VARIANT: Record<string, any> = {
  SUBMITTED: 'success', IN_PROGRESS: 'warning', TIMED_OUT: 'destructive', NOT_STARTED: 'secondary',
}

function riskLevel(eventCount: number): { label: string; variant: any } {
  if (eventCount === 0) return { label: 'None', variant: 'secondary' }
  if (eventCount <= 3) return { label: 'Low', variant: 'outline' }
  if (eventCount <= 8) return { label: 'Medium', variant: 'warning' }
  return { label: 'High', variant: 'destructive' }
}

function exportCSV(sessions: any[]) {
  const headers = ['Candidate', 'Email', 'Test', 'Status', 'Score %', 'Pass', 'Submitted', 'Risk Events']
  const rows = sessions.map(s => [
    `${s.candidate.firstName} ${s.candidate.lastName}`,
    s.candidate.email,
    s.test.title,
    s.status,
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

export function ResultsPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('submittedAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['results'],
    queryFn: () => api.get('/results?limit=200').then(r => r.data.data),
  })

  const deleteMutation = useMutation({
    mutationFn: (sessionId: string) => api.delete(`/results/${sessionId}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['results'] }); setConfirmDelete(null) },
  })

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sessions = useMemo(() => {
    let list = (data?.sessions ?? []).filter((s: any) => {
      const q = search.toLowerCase()
      const matchSearch = !search ||
        s.candidate.email.toLowerCase().includes(q) ||
        `${s.candidate.firstName} ${s.candidate.lastName}`.toLowerCase().includes(q) ||
        s.test.title.toLowerCase().includes(q)
      const matchStatus = !statusFilter || s.status === statusFilter
      return matchSearch && matchStatus
    })

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
  }, [data, search, statusFilter, sortKey, sortDir])

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Results</h1>
          <p className="text-muted-foreground">All candidate assessment sessions</p>
        </div>
        {sessions.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => exportCSV(sessions)}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
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
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              {search || statusFilter ? 'No results match your filters.' : 'No results yet. Invite candidates to take a test.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <SortTh label="Candidate" col="candidate" />
                <th className="text-left px-4 py-3 font-medium text-gray-600">Test</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <SortTh label="Score" col="score" />
                <th className="text-left px-4 py-3 font-medium text-gray-600">Risk</th>
                <SortTh label="Submitted" col="submittedAt" />
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y bg-white">
              {sessions.map((s: any) => {
                const risk = riskLevel(s._count?.proctoringEvents ?? 0)
                return (
                  <tr key={s.id} className="hover:bg-gray-50 transition-colors">
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
                          <span className="font-semibold">{Math.round(s.score.percentage)}%</span>
                          {s.score.passed !== null && (
                            <Badge variant={s.score.passed ? 'success' : 'destructive'} className="text-xs">
                              {s.score.passed ? 'Pass' : 'Fail'}
                            </Badge>
                          )}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={risk.variant} className="text-xs">{risk.label}</Badge>
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
