import { useQuery } from '@tanstack/react-query'
import { ClipboardList, Users, CheckCircle, TrendingUp, ArrowRight, ChevronRight } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { formatDateTime } from '@/lib/utils'

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function StatCard({ icon: Icon, label, value, sub, to }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; to: string
}) {
  const navigate = useNavigate()
  return (
    <Card className="cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all" onClick={() => navigate(to)}>
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
  SUBMITTED: 'success', IN_PROGRESS: 'warning', NOT_STARTED: 'secondary', TIMED_OUT: 'destructive',
}

export function DashboardPage() {
  const user = useAuthStore(s => s.user)
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/results/dashboard/stats').then(r => r.data.data),
  })

  const completionRate = data?.sessions.total
    ? Math.round((data.sessions.completed / data.sessions.total) * 100)
    : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{getGreeting()}, {user?.firstName} 👋</h1>
        <p className="text-muted-foreground">Here's what's happening today.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={ClipboardList} label="Total Tests" value={data?.tests.total ?? '—'} sub={`${data?.tests.published ?? 0} published`} to="/admin/tests" />
        <StatCard icon={Users} label="Candidates" value={data?.candidates.total ?? '—'} to="/admin/candidates" />
        <StatCard icon={CheckCircle} label="Completed" value={data?.sessions.completed ?? '—'} sub={`of ${data?.sessions.total ?? 0} sessions`} to="/admin/results" />
        <StatCard icon={TrendingUp} label="Completion Rate" value={completionRate !== null ? `${completionRate}%` : '—'} to="/admin/analytics" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { to: '/admin/tests/new', bg: 'bg-indigo-100', ic: 'text-indigo-600', Icon: ClipboardList, title: 'Create a test', sub: 'Build your assessment' },
          { to: '/admin/candidates', bg: 'bg-emerald-100', ic: 'text-emerald-600', Icon: Users, title: 'Invite candidates', sub: 'Send test links by email' },
          { to: '/admin/results', bg: 'bg-orange-100', ic: 'text-orange-600', Icon: TrendingUp, title: 'View results', sub: 'Review submissions' },
        ].map(({ to, bg, ic, Icon, title, sub }) => (
          <Link key={to} to={to}>
            <Card className="hover:border-primary/50 transition-colors cursor-pointer">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`h-10 w-10 rounded-md ${bg} flex items-center justify-center`}>
                  <Icon className={`h-5 w-5 ${ic}`} />
                </div>
                <div>
                  <p className="font-medium text-sm">{title}</p>
                  <p className="text-xs text-muted-foreground">{sub}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent Activity</CardTitle>
          <Button variant="ghost" size="sm" asChild><Link to="/admin/results">View all</Link></Button>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-center text-muted-foreground text-sm">Loading...</div>
          ) : !data?.recentSessions?.length ? (
            <div className="p-6 text-center space-y-3">
              <p className="text-muted-foreground text-sm">No sessions yet.</p>
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground flex-wrap">
                <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">1 · Create a test</span>
                <ArrowRight className="h-3 w-3" />
                <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">2 · Invite candidates</span>
                <ArrowRight className="h-3 w-3" />
                <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">3 · Review results</span>
              </div>
            </div>
          ) : (
            <div className="divide-y">
              {data.recentSessions.map((s: any) => (
                <Link key={s.id} to={`/admin/results/${s.id}`} className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{s.candidate.firstName} {s.candidate.lastName}</p>
                    <p className="text-xs text-muted-foreground truncate">{s.test.title}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {s.score && <p className="text-sm font-semibold">{Math.round(s.score.percentage)}%</p>}
                    <Badge variant={statusColors[s.status] ?? 'secondary'} className="text-xs mt-0.5">
                      {s.status.replace('_', ' ')}
                    </Badge>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
