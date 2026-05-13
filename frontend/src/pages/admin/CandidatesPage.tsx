import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  Users, Send, Search, Loader2, Copy, Check, Trash2, Ban, UserCheck,
  ChevronDown, ChevronRight, RefreshCw, XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api, getErrorMessage } from '@/lib/api'
import { toast } from '@/hooks/use-toast'

const STATUS_VARIANT: Record<string, any> = {
  PENDING: 'secondary', SENT: 'secondary', OPENED: 'warning',
  STARTED: 'warning', COMPLETED: 'success', EXPIRED: 'destructive', CANCELLED: 'outline',
}

export function CandidatesPage() {
  const [searchParams] = useSearchParams()
  const prefillTestId = searchParams.get('testId') ?? ''
  const [search, setSearch] = useState('')
  const [showInvite, setShowInvite] = useState(!!prefillTestId)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const qc = useQueryClient()

  const { data: candidatesData, isLoading } = useQuery({
    queryKey: ['candidates', search],
    queryFn: () => api.get(`/candidates?search=${search}&limit=100`).then(r => r.data.data),
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

  const inviteMutation = useMutation({
    mutationFn: () => {
      const lines = inviteForm.candidateLines.split('\n').filter(l => l.trim())
      const candidates = lines.map(line => {
        const parts = line.split(',').map(s => s.trim())
        const email = parts[0] ?? ''
        let firstName = parts[1] ?? ''
        let lastName = parts[2] ?? ''
        if (!firstName) {
          const localPart = email.split('@')[0] ?? 'Candidate'
          const nameParts = localPart.replace(/[._-]/g, ' ').split(' ').filter(Boolean)
          firstName = nameParts[0] ? nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1) : 'Candidate'
          lastName = nameParts[1] ? nameParts[1].charAt(0).toUpperCase() + nameParts[1].slice(1) : ''
        }
        return { email, firstName, lastName }
      })
      return api.post('/candidates/invite', {
        testId: inviteForm.testId,
        candidates,
        expiresInDays: inviteForm.expiresInDays,
        message: inviteForm.message || undefined,
      })
    },
    onSuccess: (res) => {
      const summary = res.data.data.summary
      const sent = summary.filter((s: any) => s.status === 'invited').length
      const skipped = summary.filter((s: any) => s.status === 'skipped').length
      toast({ title: `${sent} invitation${sent !== 1 ? 's' : ''} sent${skipped > 0 ? `, ${skipped} skipped (already invited)` : ''}` })
      qc.invalidateQueries({ queryKey: ['candidates'] })
      setShowInvite(false)
      setInviteForm({ testId: '', candidateLines: '', expiresInDays: 7, message: '' })
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
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>Invite Candidates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
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
              <div className="space-y-2">
                <Label>Candidates (one per line)</Label>
                <p className="text-xs text-muted-foreground">One email per line. Optionally: <code className="bg-gray-100 px-0.5 rounded">email, First Name, Last Name</code></p>
                <textarea
                  rows={5}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder={`sruthi@cloudfuze.com\njane@example.com, Jane, Smith`}
                  value={inviteForm.candidateLines}
                  onChange={e => setInviteForm(f => ({ ...f, candidateLines: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Link expires in (days)</Label>
                  <Input
                    type="number" min="1" max="90"
                    value={inviteForm.expiresInDays}
                    onChange={e => setInviteForm(f => ({ ...f, expiresInDays: parseInt(e.target.value) }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Custom message (optional)</Label>
                <textarea
                  rows={2}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Add a personal note to the invite email..."
                  value={inviteForm.message}
                  onChange={e => setInviteForm(f => ({ ...f, message: e.target.value }))}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <Button
                  onClick={() => inviteMutation.mutate()}
                  disabled={inviteMutation.isPending || !inviteForm.testId || !inviteForm.candidateLines.trim()}
                >
                  {inviteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                  Send Invitations
                </Button>
                <Button variant="outline" onClick={() => setShowInvite(false)}>Cancel</Button>
              </div>
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
        <Input className="pl-9" placeholder="Search candidates..." value={search} onChange={e => setSearch(e.target.value)} />
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
                        <p className="font-medium text-sm">{c.firstName} {c.lastName}</p>
                        {c.isActive === false && (
                          <Badge variant="destructive" className="text-xs py-0">Suspended</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{c.email}</p>
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
    </div>
  )
}
