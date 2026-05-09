import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Search, MoreHorizontal, Eye, Pencil, Archive, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { api, getErrorMessage } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { formatDate, formatDuration } from '@/lib/utils'

const statusVariant: Record<string, any> = {
  DRAFT: 'secondary',
  PUBLISHED: 'success',
  ARCHIVED: 'outline',
}

export function TestsPage() {
  const [search, setSearch] = useState('')
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['tests'],
    queryFn: () => api.get('/tests?limit=100').then(r => r.data.data),
  })

  const publishMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/tests/${id}/status`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tests'] }); toast({ title: 'Test updated' }) },
    onError: err => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  })

  const tests = (data?.tests ?? []).filter((t: any) =>
    t.title.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tests</h1>
          <p className="text-muted-foreground">Manage your assessments</p>
        </div>
        <Button asChild>
          <Link to="/admin/tests/new">
            <Plus className="h-4 w-4 mr-2" />
            New Test
          </Link>
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search tests..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading tests...</div>
      ) : tests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">No tests yet. Create your first assessment.</p>
            <Button asChild><Link to="/admin/tests/new"><Plus className="h-4 w-4 mr-2" />Create Test</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {tests.map((test: any) => (
            <Card key={test.id} className="hover:border-primary/40 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link to={`/admin/tests/${test.id}`} className="font-semibold text-gray-900 hover:text-primary transition-colors">
                        {test.title}
                      </Link>
                      <Badge variant={statusVariant[test.status]}>{test.status}</Badge>
                      {test.domain && <Badge variant="outline">{test.domain}</Badge>}
                    </div>
                    {test.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{test.description}</p>}
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>{formatDuration(test.duration)}</span>
                      <span>{test._count?.sections ?? 0} sections</span>
                      <span>{test._count?.invitations ?? 0} invited</span>
                      <span>{test._count?.sessions ?? 0} sessions</span>
                      <span>Created {formatDate(test.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/admin/tests/${test.id}`}>
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        Edit
                      </Link>
                    </Button>
                    {test.status === 'DRAFT' && (
                      <Button size="sm" onClick={() => publishMutation.mutate({ id: test.id, status: 'PUBLISHED' })}>
                        <Send className="h-3.5 w-3.5 mr-1" />
                        Publish
                      </Button>
                    )}
                    {test.status === 'PUBLISHED' && (
                      <Button variant="outline" size="sm" onClick={() => publishMutation.mutate({ id: test.id, status: 'ARCHIVED' })}>
                        <Archive className="h-3.5 w-3.5 mr-1" />
                        Archive
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
