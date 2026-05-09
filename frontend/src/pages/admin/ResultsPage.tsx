import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { BarChart3, Search, Loader2, ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { formatDateTime } from '@/lib/utils'

const STATUS_VARIANT: Record<string, any> = {
  SUBMITTED: 'success', IN_PROGRESS: 'warning', TIMED_OUT: 'destructive', NOT_STARTED: 'secondary',
}

export function ResultsPage() {
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['results'],
    queryFn: () => api.get('/results?limit=100').then(r => r.data.data),
  })

  const sessions = (data?.sessions ?? []).filter((s: any) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      s.candidate.email.toLowerCase().includes(q) ||
      `${s.candidate.firstName} ${s.candidate.lastName}`.toLowerCase().includes(q) ||
      s.test.title.toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Results</h1>
        <p className="text-muted-foreground">All candidate assessment sessions</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search by candidate or test..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No results yet. Invite candidates to take a test.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Candidate</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Test</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Score</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Submitted</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y bg-white">
              {sessions.map((s: any) => (
                <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium">{s.candidate.firstName} {s.candidate.lastName}</p>
                    <p className="text-xs text-muted-foreground">{s.candidate.email}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{s.test.title}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[s.status] ?? 'secondary'}>
                      {s.status.replace('_', ' ')}
                    </Badge>
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
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {s.submittedAt ? formatDateTime(s.submittedAt) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" size="sm" asChild>
                      <Link to={`/admin/results/${s.id}`}>
                        View <ChevronRight className="h-3.5 w-3.5 ml-1" />
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
