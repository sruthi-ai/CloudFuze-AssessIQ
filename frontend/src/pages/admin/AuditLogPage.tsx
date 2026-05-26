import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ShieldCheck, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { formatDateTime } from '@/lib/utils'

const ACTION_VARIANT: Record<string, any> = {
  INVITATION_SENT: 'success',
  INVITATION_RESENT: 'outline',
  INVITATION_CANCELLED: 'destructive',
  RETAKE_GRANTED: 'warning',
  CANDIDATE_DELETED: 'destructive',
  CANDIDATE_SUSPENDED: 'warning',
  CANDIDATE_ACTIVATED: 'success',
  TEST_PUBLISHED: 'success',
  TEST_ARCHIVED: 'secondary',
  TEST_DRAFT: 'secondary',
  TEST_DELETED: 'destructive',
}

const ACTION_LABEL: Record<string, string> = {
  INVITATION_SENT: 'Invitation sent',
  INVITATION_RESENT: 'Invitation resent',
  INVITATION_CANCELLED: 'Invitation cancelled',
  RETAKE_GRANTED: 'Re-attempt granted',
  CANDIDATE_DELETED: 'Candidate deleted',
  CANDIDATE_SUSPENDED: 'Candidate suspended',
  CANDIDATE_ACTIVATED: 'Candidate activated',
  TEST_PUBLISHED: 'Test published',
  TEST_ARCHIVED: 'Test archived',
  TEST_DRAFT: 'Test unpublished',
  TEST_DELETED: 'Test deleted',
}

const ENTITY_TYPES = ['', 'invitation', 'candidate', 'test', 'session']
const PAGE_SIZE = 50

export function AuditLogPage() {
  const [entityType, setEntityType] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['audit', entityType, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) })
      if (entityType) params.set('entityType', entityType)
      return api.get(`/audit?${params}`).then(r => r.data.data)
    },
  })

  const logs = data?.logs ?? []
  const total: number = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Audit Log
          </h1>
          <p className="text-muted-foreground">{total} events recorded</p>
        </div>

        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={entityType}
          onChange={e => { setEntityType(e.target.value); setPage(1) }}
        >
          <option value="">All events</option>
          <option value="invitation">Invitations</option>
          <option value="candidate">Candidates</option>
          <option value="test">Tests</option>
        </select>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Activity</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No audit events found.</div>
          ) : (
            <div className="divide-y">
              {logs.map((log: any) => {
                const meta = log.metadata as Record<string, any> | null
                return (
                  <div key={log.id} className="flex items-start gap-4 px-4 py-3 hover:bg-gray-50">
                    <div className="w-36 shrink-0 pt-0.5">
                      <Badge variant={ACTION_VARIANT[log.action] ?? 'secondary'} className="text-xs">
                        {ACTION_LABEL[log.action] ?? log.action.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900">
                        <span className="font-medium">
                          {log.user.firstName} {log.user.lastName}
                        </span>
                        <span className="text-muted-foreground text-xs ml-1.5 capitalize">
                          ({log.user.role.toLowerCase().replace('_', ' ')})
                        </span>
                      </p>
                      {meta && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {meta.testTitle && <span className="mr-2">Test: <span className="text-gray-700">{meta.testTitle}</span></span>}
                          {meta.candidateEmail && <span className="mr-2">Candidate: <span className="text-gray-700">{meta.candidateEmail}</span></span>}
                          {meta.attemptNumber && <span className="mr-2">Attempt #{meta.attemptNumber}</span>}
                          {meta.score !== undefined && meta.score !== null && <span className="mr-2">Score: <span className="text-gray-700">{Math.round(meta.score)}%</span></span>}
                        </p>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground shrink-0 pt-0.5">{formatDateTime(log.createdAt)}</p>
                  </div>
                )
              })}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                  <ChevronLeft className="h-4 w-4 mr-1" />Previous
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                  Next<ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
