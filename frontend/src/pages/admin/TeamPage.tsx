import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  UserPlus, MoreHorizontal, ShieldCheck, Eye, Users, Loader2,
  CheckCircle, XCircle, Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { api, getErrorMessage } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { useAuthStore } from '@/stores/auth'
import { cn } from '@/lib/utils'

type UserRole = 'COMPANY_ADMIN' | 'RECRUITER' | 'VIEWER'

interface TeamMember {
  id: string
  email: string
  firstName: string
  lastName: string
  role: UserRole
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
}

const ROLE_META: Record<UserRole, { label: string; color: string; icon: React.ElementType }> = {
  COMPANY_ADMIN: { label: 'Admin', color: 'bg-purple-100 text-purple-800', icon: ShieldCheck },
  RECRUITER:     { label: 'Recruiter', color: 'bg-blue-100 text-blue-800', icon: Users },
  VIEWER:        { label: 'Viewer', color: 'bg-gray-100 text-gray-700', icon: Eye },
}

function RoleBadge({ role }: { role: UserRole }) {
  const m = ROLE_META[role]
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full', m.color)}>
      <m.icon className="h-3 w-3" />
      {m.label}
    </span>
  )
}

export function TeamPage() {
  const queryClient = useQueryClient()
  const currentUser = useAuthStore(s => s.user)
  const [search, setSearch] = useState('')
  const [showInvite, setShowInvite] = useState(false)
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '', password: '', role: 'RECRUITER' as UserRole })

  const { data: members = [], isLoading } = useQuery<TeamMember[]>({
    queryKey: ['team'],
    queryFn: () => api.get('/users').then(r => r.data.data),
  })

  const inviteMutation = useMutation({
    mutationFn: (data: typeof form) => api.post('/users', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team'] })
      setShowInvite(false)
      setForm({ email: '', firstName: '', lastName: '', password: '', role: 'RECRUITER' })
      toast({ title: 'Team member added', description: 'They can now sign in with the credentials you set.' })
    },
    onError: err => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TeamMember> }) => api.patch(`/users/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team'] })
      toast({ title: 'Updated' })
    },
    onError: err => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  })

  const filtered = members.filter(m =>
    [m.email, m.firstName, m.lastName].some(v => v.toLowerCase().includes(search.toLowerCase()))
  )

  const isAdmin = currentUser?.role === 'COMPANY_ADMIN' || currentUser?.role === 'SUPER_ADMIN'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team</h1>
          <p className="text-muted-foreground text-sm">Manage who has access to your workspace</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowInvite(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Add member
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by name or email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No members found.</p>
          ) : (
            <div className="divide-y">
              {filtered.map(member => (
                <div key={member.id} className="flex items-center gap-3 px-6 py-4">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-semibold shrink-0">
                    {member.firstName.charAt(0)}{member.lastName.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-900">{member.firstName} {member.lastName}</p>
                    <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                  </div>
                  <RoleBadge role={member.role} />
                  {member.isActive ? (
                    <span title="Active"><CheckCircle className="h-4 w-4 text-green-500 shrink-0" /></span>
                  ) : (
                    <span title="Suspended"><XCircle className="h-4 w-4 text-red-400 shrink-0" /></span>
                  )}
                  {isAdmin && member.id !== currentUser?.id && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => updateMutation.mutate({ id: member.id, data: { role: 'COMPANY_ADMIN' } })}>
                          Make Admin
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => updateMutation.mutate({ id: member.id, data: { role: 'RECRUITER' } })}>
                          Make Recruiter
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => updateMutation.mutate({ id: member.id, data: { role: 'VIEWER' } })}>
                          Make Viewer
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className={member.isActive ? 'text-red-600' : 'text-green-600'}
                          onClick={() => updateMutation.mutate({ id: member.id, data: { isActive: !member.isActive } })}
                        >
                          {member.isActive ? 'Suspend' : 'Reactivate'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add member dialog */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add team member</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={e => { e.preventDefault(); inviteMutation.mutate(form) }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>First name</Label>
                <Input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label>Last name</Label>
                <Input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <Label>Temporary password</Label>
              <Input
                type="password"
                placeholder="Min 8 characters"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                required
                minLength={8}
              />
              <p className="text-xs text-muted-foreground">They can reset it via "Forgot password" after signing in.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v as UserRole }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="COMPANY_ADMIN">Admin — full access</SelectItem>
                  <SelectItem value="RECRUITER">Recruiter — create tests, invite candidates</SelectItem>
                  <SelectItem value="VIEWER">Viewer — read-only access</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowInvite(false)}>Cancel</Button>
              <Button type="submit" disabled={inviteMutation.isPending}>
                {inviteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Add member
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
