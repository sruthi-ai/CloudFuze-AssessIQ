import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, Link } from 'react-router-dom'
import {
  Users, Send, Search, Loader2, Copy, Check, Trash2, Ban, UserCheck,
  ChevronDown, ChevronRight, RefreshCw, XCircle, ChevronLeft, Upload,
  Download, AlertCircle, CheckCircle2, SkipForward,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api, getErrorMessage } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'

const STATUS_VARIANT: Record<string, any> = {
  PENDING: 'secondary', SENT: 'secondary', OPENED: 'warning',
  STARTED: 'warning', COMPLETED: 'success', EXPIRED: 'destructive', CANCELLED: 'outline',
}

const PAGE_SIZE = 50

export function CandidatesPage() {
  const [searchParams] = useSearchParams()
  const prefillTestId = searchParams.get('testId') ?? ''
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showInvite, setShowInvite] = useState(!!prefillTestId)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const qc = useQueryClient()

  const { data: candidatesData, isLoading } = useQuery({
    queryKey: ['candidates', search, page],
    queryFn: () => api.get(`/candidates?search=${encodeURIComponent(search)}&limit=${PAGE_SIZE}&page=${page}`).then(r => r.data.data),
  })

  const { data: testsData } = useQuery({
    queryKey: ['tests-published'],
    queryFn: () => api.get('/tests?status=PUBLISHED&limit=100').then(r => r.data.data),
  })

  const [inviteForm, setInviteForm] = useState({
    testId: prefillTestId,
    candidateLines: '',
    expiresInDays: 7,
    message: '',
  })
  const [inviteStep, setInviteStep] = useState<'form' | 'results'>('form')
  const [inviteResults, setInviteResults] = useState<Array<{ email: string; status: string; reason?: string }>>([])

  // Parse + validate rows in real-time from the textarea/CSV
  const parsedPreview = useMemo(() => {
    if (!inviteForm.candidateLines.trim()) return []
    // Strip UTF-8 BOM (added by Excel), normalise line endings
    const cleaned = inviteForm.candidateLines.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    return cleaned.split('\n')
      .filter(l => l.trim())
      .map(line => {
        // Simple quoted-field CSV parser — handles "Smith, John" style fields
        const parts: string[] = []
        let cur = '', inQ = false
        for (let i = 0; i <= line.length; i++) {
          const c = line[i]
          if (c === '"') { inQ = !inQ }
          else if ((c === ',' || i === line.length) && !inQ) { parts.push(cur.trim()); cur = '' }
          else { cur += c ?? '' }
        }
        const email = parts[0] ?? ''
        let firstName = parts[1] ?? ''
        let lastName = parts[2] ?? ''
        const organization = parts[3] ?? ''
        if (!firstName) {
          const local = email.split('@')[0] ?? ''
          const words = local.replace(/[._-]/g, ' ').split(' ').filter(Boolean)
          firstName = words[0] ? words[0].charAt(0).toUpperCase() + words[0].slice(1) : 'Candidate'
          lastName = words[1] ? words[1].charAt(0).toUpperCase() + words[1].slice(1) : ''
        }
        const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        return { email, firstName, lastName, organization, isValid }
      })
  }, [inviteForm.candidateLines])

  const validCount = parsedPreview.filter(r => r.isValid).length
  const invalidCount = parsedPreview.length - validCount

  const downloadTemplate = () => {
    const csv = 'email,firstName,lastName,organization\njohn.smith@example.com,John,Smith,Acme Corp\njane.doe@example.com,Jane,Doe,\n'
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'candidates_template.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const downloadFailures = () => {
    const failed = inviteResults.filter(r => r.status === 'error')
    const csv = ['email,reason', ...failed.map(r => `${r.email},"${(r.reason ?? '').replace(/"/g, "'")}"`)].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'failed_invitations.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const closeInviteModal = () => {
    setShowInvite(false)
    setInviteStep('form')
    setInviteResults([])
    setInviteForm({ testId: '', candidateLines: '', expiresInDays: 7, message: '' })
  }

  const inviteMutation = useMutation({
    mutationFn: () => {
      const lines = inviteForm.candidateLines.split('\n').filter(l => l.trim())
      const candidates = lines.map(line => {
        const parts = line.split(',').map(s => s.trim())
        const email = parts[0] ?? ''
        let firstName = parts[1] ?? ''
        let lastName = parts[2] ?? ''
        const organization = parts[3] ?? undefined
        if (!firstName) {
          const localPart = email.split('@')[0] ?? 'Candidate'
          const nameParts = localPart.replace(/[._-]/g, ' ').split(' ').filter(Boolean)
          firstName = nameParts[0] ? nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1) : 'Candidate'
          lastName = nameParts[1] ? nameParts[1].charAt(0).toUpperCase() + nameParts[1].slice(1) : ''
        }
        return { email, firstName, lastName, ...(organization ? { organization } : {}) }
      })
      return api.post('/candidates/invite', {
        testId: inviteForm.testId,
        candidates,
        expiresInDays: inviteForm.expiresInDays,
        message: inviteForm.message || undefined,
      })
    },
    onSuccess: (res) => {
      const summary: Array<{ email: string; status: string; reason?: string }> = res.data.data.summary
      setInviteResults(summary)
      setInviteStep('results')
      qc.invalidateQueries({ queryKey: ['candidates'] })
    },
    onError: err => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/candidates/${id}`),
    onSuccess: () => {
      toast({ title: 'Candidate deleted' })
      setConfirmDelete(null)
      qc.invalidateQueries({ queryKey: ['candidates'] })
    },
    onError: err => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  })

  const suspendMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/candidates/${id}`, { isActive }),
    onSuccess: (_, vars) => {
      toast({ title: vars.isActive ? 'Candidate activated' : 'Candidate suspended' })
      qc.invalidateQueries({ queryKey: ['candidates'] })
    },
    onError: err => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  })

  const resendMutation = useMutation({
    mutationFn: (invitationId: string) =>
      api.post(`/candidates/invitations/${invitationId}/resend`, {}),
    onSuccess: () => {
      toast({ title: 'Invitation email resent' })
      qc.invalidateQueries({ queryKey: ['candidates'] })
    },
    onError: err => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  })

  const cancelInvitationMutation = useMutation({
    mutationFn: (invitationId: string) =>
      api.delete(`/candidates/invitations/${invitationId}`),
    onSuccess: () => {
      toast({ title: 'Invitation cancelled' })
      qc.invalidateQueries({ queryKey: ['candidates'] })
    },
    onError: err => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  })

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/take/${token}`
    navigator.clipboard.writeText(url)
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(null), 2000)
  }

  const candidates = candidatesData?.candidates ?? []
  const total: number = candidatesData?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Candidates</h1>
          <p className="text-muted-foreground">{candidatesData?.total ?? 0} candidates</p>
        </div>
        <Button onClick={() => setShowInvite(true)}>
          <Send className="h-4 w-4 mr-2" />
          Invite Candidates
        </Button>
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col">
            <CardHeader className="shrink-0 pb-3">
              <div className="flex items-center justify-between">
                <CardTitle>{inviteStep === 'results' ? 'Invitation Results' : 'Invite Candidates'}</CardTitle>
                <button onClick={closeInviteModal} className="text-muted-foreground hover:text-foreground p-1 rounded">
                  <XCircle className="h-5 w-5" />
                </button>
              </div>
            </CardHeader>

            <CardContent className="overflow-y-auto flex-1 space-y-4">
              {inviteStep === 'form' ? (
                <>
                  {/* Test selector */}
                  <div className="space-y-1.5">
                    <Label>Select Test *</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={inviteForm.testId}
                      onChange={e => setInviteForm(f => ({ ...f, testId: e.target.value }))}
                    >
                      <option value="">Select a published test...</option>
                      {testsData?.tests?.map((t: any) => (
                        <option key={t.id} value={t.id}>{t.title}</option>
                      ))}
                    </select>
                  </div>

                  {/* Candidates input */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-3">
                        <Label>Candidates</Label>
                        {parsedPreview.length > 0 && (
                          <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded-full',
                            invalidCount > 0 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                          )}>
                            {parsedPreview.length} rows{invalidCount > 0 ? ` · ${invalidCount} invalid` : ''}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={downloadTemplate}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                        >
                          <Download className="h-3 w-3" />
                          Template
                        </button>
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            accept=".csv,.txt"
                            className="hidden"
                            onChange={e => {
                              const file = e.target.files?.[0]
                              if (!file) return
                              const reader = new FileReader()
                              reader.onload = ev => {
                                const text = ev.target?.result as string
                                const lines = text.split(/\r?\n/).filter(l => l.trim())
                                const start = /email|first|name/i.test(lines[0] ?? '') ? 1 : 0
                                setInviteForm(f => ({ ...f, candidateLines: lines.slice(start).join('\n') }))
                              }
                              reader.readAsText(file)
                              e.target.value = ''
                            }}
                          />
                          <span className="flex items-center gap-1 text-xs text-primary hover:underline">
                            <Upload className="h-3 w-3" />
                            Import CSV
                          </span>
                        </label>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      One per line: <code className="bg-gray-100 px-0.5 rounded">email, First, Last, Organization</code>
                    </p>
                    <textarea
                      rows={4}
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      placeholder={`sruthi@cloudfuze.com\njane@example.com, Jane, Smith, ABC College`}
                      value={inviteForm.candidateLines}
                      onChange={e => setInviteForm(f => ({ ...f, candidateLines: e.target.value }))}
                    />

                    {/* Live parsed preview */}
                    {parsedPreview.length > 0 && (
                      <div className="rounded-md border overflow-hidden">
                        <div className="bg-gray-50 px-3 py-1.5 text-xs font-medium text-muted-foreground border-b flex items-center gap-2">
                          Preview
                          {invalidCount > 0 && (
                            <span className="text-amber-600 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              {invalidCount} row{invalidCount > 1 ? 's' : ''} with invalid email will be skipped
                            </span>
                          )}
                        </div>
                        <div className="max-h-40 overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead className="bg-gray-50 border-b sticky top-0">
                              <tr>
                                <th className="text-left px-3 py-1.5 text-muted-foreground font-medium w-8">#</th>
                                <th className="text-left px-2 py-1.5 text-muted-foreground font-medium">Email</th>
                                <th className="text-left px-2 py-1.5 text-muted-foreground font-medium">First</th>
                                <th className="text-left px-2 py-1.5 text-muted-foreground font-medium">Last</th>
                                <th className="text-left px-2 py-1.5 text-muted-foreground font-medium">Org</th>
                              </tr>
                            </thead>
                            <tbody>
                              {parsedPreview.map((row, i) => (
                                <tr key={i} className={cn('border-b last:border-0', !row.isValid && 'bg-red-50')}>
                                  <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                                  <td className={cn('px-2 py-1.5 font-mono', !row.isValid && 'text-red-600 font-semibold')}>
                                    {row.email || <span className="italic text-red-400">empty</span>}
                                    {!row.isValid && <AlertCircle className="h-3 w-3 inline ml-1 text-red-500" />}
                                  </td>
                                  <td className="px-2 py-1.5">{row.firstName}</td>
                                  <td className="px-2 py-1.5">{row.lastName}</td>
                                  <td className="px-2 py-1.5 text-muted-foreground">{row.organization}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Settings row */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Link expires in (days)</Label>
                      <Input
                        type="number" min="1" max="90"
                        value={inviteForm.expiresInDays}
                        onChange={e => setInviteForm(f => ({ ...f, expiresInDays: parseInt(e.target.value) }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Custom message (optional)</Label>
                    <textarea
                      rows={2}
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      placeholder="Add a personal note to the invite email..."
                      value={inviteForm.message}
                      onChange={e => setInviteForm(f => ({ ...f, message: e.target.value }))}
                    />
                  </div>

                  <div className="flex gap-3 pt-1">
                    <Button
                      onClick={() => inviteMutation.mutate()}
                      disabled={inviteMutation.isPending || !inviteForm.testId || validCount === 0}
                    >
                      {inviteMutation.isPending
                        ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        : <Send className="h-4 w-4 mr-2" />}
                      {inviteMutation.isPending
                        ? `Sending ${validCount} invitation${validCount !== 1 ? 's' : ''}…`
                        : `Send ${validCount > 0 ? validCount : ''} Invitation${validCount !== 1 ? 's' : ''}`}
                    </Button>
                    <Button variant="outline" onClick={closeInviteModal}>Cancel</Button>
                  </div>
                </>
              ) : (
                /* Results step */
                (() => {
                  const sent = inviteResults.filter(r => r.status === 'invited').length
                  const skipped = inviteResults.filter(r => r.status === 'skipped').length
                  const failed = inviteResults.filter(r => r.status === 'error')
                  return (
                    <div className="space-y-4">
                      {/* Summary cards */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-lg border bg-green-50 border-green-200 p-3 text-center">
                          <CheckCircle2 className="h-5 w-5 text-green-600 mx-auto mb-1" />
                          <p className="text-2xl font-bold text-green-700">{sent}</p>
                          <p className="text-xs text-green-600">Sent</p>
                        </div>
                        <div className="rounded-lg border bg-gray-50 border-gray-200 p-3 text-center">
                          <SkipForward className="h-5 w-5 text-gray-400 mx-auto mb-1" />
                          <p className="text-2xl font-bold text-gray-600">{skipped}</p>
                          <p className="text-xs text-muted-foreground">Already invited</p>
                        </div>
                        <div className={cn('rounded-lg border p-3 text-center', failed.length > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200')}>
                          <AlertCircle className={cn('h-5 w-5 mx-auto mb-1', failed.length > 0 ? 'text-red-500' : 'text-gray-400')} />
                          <p className={cn('text-2xl font-bold', failed.length > 0 ? 'text-red-600' : 'text-gray-600')}>{failed.length}</p>
                          <p className={cn('text-xs', failed.length > 0 ? 'text-red-500' : 'text-muted-foreground')}>Failed</p>
                        </div>
                      </div>

                      {/* Failed rows detail */}
                      {failed.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-red-700">Failed invitations</p>
                            <button
                              onClick={downloadFailures}
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                            >
                              <Download className="h-3 w-3" />
                              Download CSV
                            </button>
                          </div>
                          <div className="rounded-md border overflow-hidden max-h-52 overflow-y-auto">
                            <table className="w-full text-xs">
                              <thead className="bg-red-50 border-b sticky top-0">
                                <tr>
                                  <th className="text-left px-3 py-1.5 text-muted-foreground font-medium">Email</th>
                                  <th className="text-left px-3 py-1.5 text-muted-foreground font-medium">Reason</th>
                                </tr>
                              </thead>
                              <tbody>
                                {failed.map((r, i) => (
                                  <tr key={i} className="border-b last:border-0 bg-red-50/50">
                                    <td className="px-3 py-1.5 font-mono text-red-700">{r.email}</td>
                                    <td className="px-3 py-1.5 text-muted-foreground">{r.reason ?? 'Unknown error'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      <div className="flex gap-3 pt-1">
                        <Button onClick={closeInviteModal}>Done</Button>
                        {failed.length > 0 && (
                          <Button variant="outline" onClick={() => {
                            setInviteStep('form')
                            setInviteForm(f => ({ ...f, candidateLines: failed.map(r => r.email).join('\n') }))
                          }}>
                            Retry failed ({failed.length})
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })()
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle className="text-red-600">Delete Candidate?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                This will permanently delete the candidate and all their invitations and session data. This cannot be undone.
              </p>
              <div className="flex gap-3">
                <Button
                  variant="destructive"
                  onClick={() => deleteMutation.mutate(confirmDelete)}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                  Delete
                </Button>
                <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search candidates..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : candidates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">No candidates yet. Invite your first candidates to get started.</p>
            <Button onClick={() => setShowInvite(true)}><Send className="h-4 w-4 mr-2" />Invite Candidates</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {candidates.map((c: any) => {
            const isExpanded = expandedId === c.id
            const invitations: any[] = c.invitations ?? []
            return (
              <Card key={c.id} className={c.isActive === false ? 'opacity-60' : ''}>
                <CardContent className="p-4">
                  {/* Candidate row */}
                  <div className="flex items-center gap-3">
                    <button
                      className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      onClick={() => setExpandedId(isExpanded ? null : c.id)}
                      title={isExpanded ? 'Collapse' : 'Show invitations'}
                    >
                      {isExpanded
                        ? <ChevronDown className="h-4 w-4" />
                        : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                      {c.firstName[0]}{c.lastName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/admin/candidates/${c.id}`}
                          className="font-medium text-sm hover:text-primary transition-colors"
                        >
                          {c.firstName} {c.lastName}
                        </Link>
                        {c.isActive === false && (
                          <Badge variant="destructive" className="text-xs py-0">Suspended</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{c.email}</p>
                      {c.organization && (
                        <p className="text-xs text-muted-foreground/70">{c.organization}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0 text-xs text-muted-foreground mr-2">
                      <p>{c._count.invitations} invite{c._count.invitations !== 1 ? 's' : ''}</p>
                      <p>{c._count.sessions} session{c._count.sessions !== 1 ? 's' : ''}</p>
                    </div>
                    {/* Action buttons */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost" size="sm"
                        className="h-8 w-8 p-0"
                        title={c.isActive === false ? 'Activate' : 'Suspend'}
                        onClick={() => suspendMutation.mutate({ id: c.id, isActive: c.isActive === false })}
                        disabled={suspendMutation.isPending}
                      >
                        {c.isActive === false
                          ? <UserCheck className="h-4 w-4 text-green-600" />
                          : <Ban className="h-4 w-4 text-amber-500" />}
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        className="h-8 w-8 p-0"
                        title="Delete candidate"
                        onClick={() => setConfirmDelete(c.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>

                  {/* Invitations expanded */}
                  {isExpanded && (
                    <div className="mt-3 border-t pt-3 space-y-2">
                      {invitations.length === 0 ? (
                        <p className="text-xs text-muted-foreground pl-6">No invitations yet.</p>
                      ) : (
                        invitations.map((inv: any) => (
                          <div key={inv.id} className="flex items-center gap-2 pl-6 text-xs">
                            <span className="text-muted-foreground flex-1 truncate">{inv.test?.title}</span>
                            <Badge variant={STATUS_VARIANT[inv.status] ?? 'secondary'} className="text-xs py-0">{inv.status}</Badge>
                            <div className="flex items-center gap-1 shrink-0">
                              {/* Copy link */}
                              <button
                                onClick={() => copyLink(inv.token)}
                                className="text-muted-foreground hover:text-primary transition-colors p-1"
                                title="Copy invite link"
                              >
                                {copiedToken === inv.token ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                              </button>
                              {/* Resend */}
                              {inv.status !== 'CANCELLED' && inv.status !== 'COMPLETED' && (
                                <button
                                  onClick={() => resendMutation.mutate(inv.id)}
                                  disabled={resendMutation.isPending}
                                  className="text-muted-foreground hover:text-primary transition-colors p-1"
                                  title="Resend email"
                                >
                                  {resendMutation.isPending
                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    : <RefreshCw className="h-3.5 w-3.5" />}
                                </button>
                              )}
                              {/* Cancel */}
                              {!['CANCELLED', 'COMPLETED', 'EXPIRED'].includes(inv.status) && (
                                <button
                                  onClick={() => cancelInvitationMutation.mutate(inv.id)}
                                  disabled={cancelInvitationMutation.isPending}
                                  className="text-muted-foreground hover:text-red-500 transition-colors p-1"
                                  title="Cancel invitation"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} &middot; {total} candidates
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline" size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
