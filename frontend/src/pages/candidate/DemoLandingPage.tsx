import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Brain, Clock, FlaskConical, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api, getErrorMessage } from '@/lib/api'
import { toast } from '@/hooks/use-toast'

interface TestInfo {
  id: string
  title: string
  description: string | null
  instructions: string | null
  duration: number
  passingScore: number | null
  tenant: { name: string; logoUrl: string | null; primaryColor: string | null }
}

export function DemoLandingPage() {
  const { practiceToken } = useParams<{ practiceToken: string }>()
  const navigate = useNavigate()
  const [name, setName] = useState('')

  const { data: testInfo, isLoading, isError } = useQuery<TestInfo>({
    queryKey: ['demo', practiceToken],
    queryFn: () => api.get(`/demo/${practiceToken}`).then(r => r.data.data),
    retry: false,
  })

  const startMutation = useMutation({
    mutationFn: () => api.post(`/demo/${practiceToken}/start`, { name }),
    onSuccess: res => {
      const { invitationToken, sessionId } = res.data.data
      navigate(`/take/${invitationToken}/test`, {
        state: { sessionId, isPractice: true, practiceName: name.trim() },
        replace: true,
      })
    },
    onError: err => toast({ title: 'Could not start practice', description: getErrorMessage(err), variant: 'destructive' }),
  })

  const brandColor = testInfo?.tenant?.primaryColor ?? '#6366f1'

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-white">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  if (isError || !testInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-white p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center space-y-3">
            <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
            <h2 className="text-lg font-semibold">Practice link not found</h2>
            <p className="text-sm text-muted-foreground">This practice link may be invalid or has been disabled.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-white p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Logo / brand */}
        <div className="flex items-center justify-center gap-2">
          {testInfo.tenant.logoUrl ? (
            <img src={testInfo.tenant.logoUrl} alt={testInfo.tenant.name} className="h-8 object-contain" />
          ) : (
            <div className="rounded-lg p-2" style={{ backgroundColor: brandColor }}>
              <Brain className="h-6 w-6 text-white" />
            </div>
          )}
          <span className="text-xl font-bold text-gray-900">{testInfo.tenant.name}</span>
        </div>

        {/* Practice banner */}
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium"
          style={{ backgroundColor: `${brandColor}15`, color: brandColor, border: `1px solid ${brandColor}40` }}>
          <FlaskConical className="h-4 w-4 flex-shrink-0" />
          Practice Mode — your results won't be recorded or shared
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xl">{testInfo.title}</CardTitle>
            {testInfo.description && (
              <p className="text-sm text-muted-foreground mt-1">{testInfo.description}</p>
            )}
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Meta */}
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                {testInfo.duration} minutes
              </span>
              {testInfo.passingScore && (
                <span className="flex items-center gap-1.5">
                  Passing score: {testInfo.passingScore}%
                </span>
              )}
            </div>

            {testInfo.instructions && (
              <div className="p-3 rounded-lg bg-gray-50 border text-sm text-gray-700 whitespace-pre-line">
                {testInfo.instructions}
              </div>
            )}

            {/* Name input */}
            <div className="space-y-2">
              <Label htmlFor="name">Your name</Label>
              <Input
                id="name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Enter your name to start"
                onKeyDown={e => e.key === 'Enter' && name.trim() && startMutation.mutate()}
                autoFocus
              />
            </div>

            <Button
              className="w-full"
              style={{ backgroundColor: brandColor }}
              disabled={!name.trim() || startMutation.isPending}
              onClick={() => startMutation.mutate()}
            >
              {startMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Start Practice
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              No account needed. Your answers are not saved after the session ends.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
