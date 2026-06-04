import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ShieldCheck, Loader2, ChevronLeft, ChevronRight, Search, Download } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  SSO_LOGIN: 'outline',
  SETTINGS_UPDATED: 'secondary',
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
  SSO_LOGIN: 'SSO login',
  SETTINGS_UPDATED: 'Settings updated',
}

const PAGE_SIZE = 50

function exportAuditCSV(logs: any[]) {
  const headers = ['Timestamp', 'Action', 'Performed By', 'Role', 'Entity Type', 'Test', 'Candidate', 'Details']
  const rows = logs.map(log => {
    const meta = log.metadata as Record<string, any> | null
    return [
      new Date(log.createdAt).toLocaleString(),
      ACTION_LABEL[log.action] ?? log.action,
      `${log.user.firstName} ${log.user.lastName}`,
      log.user.role,
      log.entityType,
      meta?.testTitle ?? '',
      meta?.candidateEmail ?? '',
      Object.entries(meta ?? {})
        .filter(([k]) => !['testTitle', 'candidateEmail'].includes(k))
        .map(([k, v]) => `${k}: ${v}`)
        .join('; '),
    ]
  })
  const bom = '﻿'
  const csv = bom + [headers, ...rows]
    .map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function AuditLogPage() {
  const [entityType, setEntityType] = useState('')
  const [action, setAction] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)

  const buildParams = useCallback((overridePage?: number, limit?: number) => {
    const params = new URLSearchParams({
      page: String(overridePage ?? page),
      limit: String(limit ?? PAGE_SIZE),
    })
    if (entityType) params.set('entityType', entityType)
    if (action) params.set('action', action)
    return params
  }, [page, entityType, action])

  const { data, isLoading } = useQuery({
    queryKey: ['audit', entityType, action, page],
    queryFn: () => api.get(`/audit?${buildParams()}`).then(r => r.data.data),
  })

  const logs: any[] = data?.logs ?? []
  const total: number = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // Client-side search filter (name/email/test)
  const filtered = search.trim()
    ? logs.filter(log => {
        const meta = log.metadata as Record<string, any> | null
        const haystack = [
          log.user.firstName, log.user.lastName, log.user.email,
          meta?.testTitle, meta?.candidateEmail, log.action,
        ].join(' ').toLowerCase()
        return haystack.includes(search.toLowerCase())
      })
    : logs

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await api.get(`/audit?${buildParams(1, 2000)}`)
      exportAuditCSV(res.data.data.logs)
    } finally {
      setExporting(false)
    }
  }

  const reset = () => { setEntityType(''); setAction(''); setSearch(''); setPage(1) }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Audit Log
          </h1>
          <p className="text-muted-foreground">{total} events recorded</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
          {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email or test…"
            className="pl-9 h-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={entityType}
          onChange={e => { setEntityType(e.target.value); setPage(1) }}
        >
          <option value="">All categories</option>
          <option value="invitation">Invitations</option>
          <option value="candidate">Candidates</option>
          <option value="test">Tests</option>
          <option value="user">SSO / Auth</option>
          <option value="settings">Settings</option>
        </select>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={action}
          onChange={e => { setAction(e.target.value); setPage(1) }}
        >
          <option value="">All actions</option>
          {Object.entries(ACTION_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        {(entityType || action || search) && (
          <Button variant="ghost" size="sm" onClick={reset}>Clear</Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Activity {filtered.length !== logs.length && `(${filtered.length} of ${logs.length} shown)`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No audit events found.</div>
          ) : (
            <div className="divide-y">
              {filtered.map((log: any) => {
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
                        <span className="font-medium">{log.user.firstName} {log.user.lastName}</span>
                        <span className="text-muted-foreground text-xs ml-1.5 capitalize">
                          ({log.user.role.toLowerCase().replace('_', ' ')})
                        </span>
                      </p>
                      {meta && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {meta.testTitle && <span className="mr-2">Test: <span className="text-gray-700">{meta.testTitle}</span></span>}
                          {meta.candidateEmail && <span className="mr-2">Candidate: <span className="text-gray-700">{meta.candidateEmail}</span></span>}
                          {meta.attemptNumber && <span className="mr-2">Attempt #{meta.attemptNumber}</span>}
                          {meta.provider && <span className="mr-2">via <span className="text-gray-700">{meta.provider}</span></span>}
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
              <p className="text-sm text-muted-foreground">Page {page} of {totalPages} ({total} total)</p>
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
