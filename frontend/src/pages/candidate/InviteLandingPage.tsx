import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Brain, Clock, Monitor, Shield, AlertCircle, Loader2, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { api, getErrorMessage } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { formatDuration } from '@/lib/utils'

export function InviteLandingPage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [systemChecked, setSystemChecked] = useState(false)
  const [checking, setChecking] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['invite', token],
    queryFn: () => api.get(`/sessions/invite/${token}`).then(r => r.data.data),
    retry: false,
  })

  // Inject brand color CSS variable when data loads; revert on unmount
  const brandColor = data?.test?.tenant?.primaryColor ?? '#6366f1'
  useEffect(() => {
    if (!data) return
    document.documentElement.style.setProperty('--brand-primary', brandColor)
    return () => {
      document.documentElement.style.removeProperty('--brand-primary')
    }
  }, [data, brandColor])

  const startMutation = useMutation({
    mutationFn: () => api.post('/sessions/start', { token, userAgent: navigator.userAgent }),
    onSuccess: res => {
      const sessionId = res.data.data.sessionId
      navigate(`/take/${token}/test`, { state: { sessionId, inviteData: data } })
    },
    onError: err => toast({ title: 'Unable to start', description: getErrorMessage(err), variant: 'destructive' }),
  })

  const runSystemCheck = async () => {
    setChecking(true)
    try {
      // Check camera
      if (data?.test?.proctoring) {
        await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      }
      setSystemChecked(true)
      toast({ title: 'System check passed', description: 'Your camera and microphone are working.' })
    } catch {
      toast({
        title: 'Camera/mic access required',
        description: 'Please allow camera and microphone access for this proctored assessment.',
        variant: 'destructive',
      })
    } finally {
      setChecking(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="py-12">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Link not available</h2>
            <p className="text-muted-foreground">
              {getErrorMessage(error) || 'This assessment link is invalid, expired, or has already been used.'}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { test, candidate, invitation } = data
  const proctoring = test.proctoring
  const readyToStart = !proctoring || systemChecked

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: `linear-gradient(135deg, ${brandColor}10 0%, #ffffff 100%)` }}
    >
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            {test.tenant.logoUrl ? (
              <img src={test.tenant.logoUrl} alt={test.tenant.name} className="h-8 object-contain" />
            ) : (
              <div
                className="rounded-lg p-1.5 flex items-center justify-center h-8 w-8 text-white font-bold text-sm"
                style={{ backgroundColor: brandColor }}
              >
                {test.tenant.name?.charAt(0)?.toUpperCase() ?? <Brain className="h-5 w-5 text-white" />}
              </div>
            )}
            <span className="font-semibold text-gray-700">{test.tenant.name}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{test.title}</h1>
          <p className="text-muted-foreground mt-1">Hello, {candidate.firstName}! You've been invited to take this assessment.</p>
        </div>

        {/* Test info */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <Clock className="h-5 w-5 mx-auto mb-1" style={{ color: brandColor }} />
              <p className="font-semibold">{formatDuration(test.duration)}</p>
              <p className="text-xs text-muted-foreground">Duration</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Monitor className="h-5 w-5 mx-auto mb-1" style={{ color: brandColor }} />
              <p className="font-semibold">{test.questionCount}</p>
              <p className="text-xs text-muted-foreground">Questions</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Shield className="h-5 w-5 mx-auto mb-1" style={{ color: brandColor }} />
              <p className="font-semibold">{proctoring ? 'Yes' : 'No'}</p>
              <p className="text-xs text-muted-foreground">Proctored</p>
            </CardContent>
          </Card>
        </div>

        {/* Instructions */}
        {test.instructions && (
          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold mb-2">Instructions</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{test.instructions}</p>
            </CardContent>
          </Card>
        )}

        {/* Proctoring notice */}
        {proctoring && (
          <Card className="border-orange-200 bg-orange-50">
            <CardContent className="p-4">
              <h3 className="font-semibold text-orange-900 mb-2 flex items-center gap-2">
                <Shield className="h-4 w-4" />
                This is a proctored assessment
              </h3>
              <ul className="text-sm text-orange-800 space-y-1">
                <li>• Your webcam and screen will be recorded</li>
                <li>• Tab switching and copy-paste are monitored</li>
                <li>• Stay in full screen for the entire test</li>
                <li>• Make sure you're in a quiet, well-lit space</li>
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Sections */}
        {test.sections.length > 1 && (
          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold mb-3">Sections</h3>
              <div className="space-y-2">
                {test.sections.map((s: any, i: number) => (
                  <div key={s.id} className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground w-5">{i + 1}.</span>
                    <span>{s.title}</span>
                    <Badge variant="secondary" className="ml-auto">{s.questionCount}q</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* CTA */}
        <div className="space-y-3">
          {proctoring && !systemChecked && (
            <Button variant="outline" className="w-full" onClick={runSystemCheck} disabled={checking}>
              {checking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Monitor className="h-4 w-4 mr-2" />}
              Run System Check (Camera + Mic)
            </Button>
          )}
          <Button
            className="w-full border-0 hover:opacity-90 transition-opacity"
            size="lg"
            disabled={!readyToStart || startMutation.isPending}
            onClick={() => startMutation.mutate()}
            style={{ backgroundColor: brandColor, color: '#ffffff' }}
          >
            {startMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {data.existingSessionId && data.sessionStatus === 'IN_PROGRESS' ? 'Continue Assessment' : 'Start Assessment'}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
          {proctoring && !systemChecked && (
            <p className="text-xs text-center text-muted-foreground">Run the system check to enable the start button</p>
          )}
        </div>
      </div>
    </div>
  )
}
