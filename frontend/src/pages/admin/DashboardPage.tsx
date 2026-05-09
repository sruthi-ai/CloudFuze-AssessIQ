import { useQuery } from '@tanstack/react-query'
import { ClipboardList, Users, CheckCircle, TrendingUp, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { formatDateTime } from '@/lib/utils'

function StatCard({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon className="h-6 w-6 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

const statusColors: Record<string, 'default' | 'success' | 'warning' | 'destructive' | 'secondary'> = {
  SUBMITTED: 'success',
  IN_PROGRESS: 'warning',
  NOT_STARTED: 'secondary',
  TIMED_OUT: 'destructive',
}

export function DashboardPage() {
  const user = useAuthStore(s => s.user)
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/results/dashboard/stats').then(r => r.data.data),
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Good morning, {user?.firstName} 👋
        </h1>
        <p className="text-muted-foreground">Here's what's happening today.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={ClipboardList} label="Total Tests" value={data?.tests.total ?? '—'} sub={`${data?.tests.published ?? 0} published`} />
        <StatCard icon={Users} label="Candidates" value={data?.candidates.total ?? '—'} />
        <StatCard icon={CheckCircle} label="Completed" value={data?.sessions.completed ?? '—'} sub={`of ${data?.sessions.total ?? 0} sessions`} />
        <StatCard icon={TrendingUp} label="Completion Rate" value={data?.sessions.total ? `${Math.round((data.sessions.completed / data.sessions.total) * 100)}%` : '—'} />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link to="/admin/tests/new">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-md bg-indigo-100 flex items-center justify-center">
                <ClipboardList className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <p className="font-medium text-sm">Create a test</p>
                <p className="text-xs text-muted-foreground">Build your assessment</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto" />
            </CardContent>
          </Card>
        </Link>
        <Link to="/admin/candidates">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-md bg-emerald-100 flex items-center justify-center">
                <Users className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="font-medium text-sm">Invite candidates</p>
                <p className="text-xs text-muted-foreground">Send test links by email</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto" />
            </CardContent>
          </Card>
        </Link>
        <Link to="/admin/results">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-md bg-orange-100 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="font-medium text-sm">View results</p>
                <p className="text-xs text-muted-foreground">Review submissions</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto" />
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Recent sessions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent Activity</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/admin/results">View all</Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-center text-muted-foreground text-sm">Loading...</div>
          ) : !data?.recentSessions?.length ? (
            <div className="p-6 text-center text-muted-foreground text-sm">No sessions yet. Invite candidates to get started.</div>
          ) : (
            <div className="divide-y">
              {data.recentSessions.map((s: any) => (
                <div key={s.id} className="flex items-center gap-4 px-6 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {s.candidate.firstName} {s.candidate.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{s.test.title}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {s.score && (
                      <p className="text-sm font-semibold">{Math.round(s.score.percentage)}%</p>
                    )}
                    <Badge variant={statusColors[s.status] ?? 'secondary'} className="text-xs mt-0.5">
                      {s.status.replace('_', ' ')}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
