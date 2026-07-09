import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Brain, Clock, Monitor, Shield, AlertCircle, Loader2, ChevronRight, CalendarClock, CalendarX, CreditCard, Camera, RefreshCw, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { api, getErrorMessage } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { formatDuration } from '@/lib/utils'
import { SecureBrowserGate } from '@/components/SecureBrowserGate'
import { SebGate } from '@/components/SebGate'

function useCountdown(target: Date | null) {
  const [remaining, setRemaining] = useState<number | null>(null)
  useEffect(() => {
    if (!target) return
    const tick = () => setRemaining(Math.max(0, Math.floor((target.getTime() - Date.now()) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [target])
  return remaining
}

function fmtCountdown(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

function IdVerificationStep({
  sessionId, token, brandColor, onVerified,
}: {
  sessionId: string; token: string; brandColor: string; onVerified: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [captured, setCaptured] = useState<Blob | null>(null)
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    let active = true
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then(stream => {
        if (!active) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play()
        }
      })
      .catch(() => setCameraError('Camera access is required for ID verification. Please allow camera access and try again.'))
    return () => {
      active = false
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  const capture = async () => {
    const video = videoRef.current
    if (!video) return
    // Check lighting before capturing
    const { measureFrameBrightness, MIN_BRIGHTNESS } = await import('@/lib/frameAnalysis')
    const lum = measureFrameBrightness(video)
    if (lum < MIN_BRIGHTNESS) {
      setCameraError('Photo is too dark — please move to a well-lit area and try again.')
      return
    }
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    canvas.toBlob(blob => {
      if (!blob) return
      if (capturedUrl) URL.revokeObjectURL(capturedUrl)
      setCaptured(blob)
      setCapturedUrl(URL.createObjectURL(blob))
    }, 'image/jpeg', 0.9)
  }

  const retake = () => {
    if (capturedUrl) URL.revokeObjectURL(capturedUrl)
    setCaptured(null)
    setCapturedUrl(null)
  }

  const confirm = async () => {
    if (!captured) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', captured, 'id-photo.jpg')
      await api.post(`/sessions/${sessionId}/id-verify?token=${token}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      onVerified()
    } catch {
      toast({ title: 'Upload failed', description: 'Could not upload your photo. Please try again.', variant: 'destructive' })
    } finally {
      setUploading(false)
    }
  }

  return (
    <Card className="w-full max-w-lg mx-auto">
      <CardContent className="p-6 space-y-4">
        <div className="text-center space-y-1">
          <CreditCard className="h-8 w-8 mx-auto" style={{ color: brandColor }} />
          <h2 className="text-lg font-bold">Identity Verification</h2>
          <p className="text-sm text-muted-foreground">
            Hold your photo ID next to your face and take a clear photo to verify your identity before starting.
          </p>
        </div>

        {cameraError && !capturedUrl ? (
          cameraError.startsWith('Photo is too dark') ? (
            <div className="space-y-3">
              <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive text-center">{cameraError}</div>
              <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
                <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
              </div>
              <canvas ref={canvasRef} className="hidden" />
              <Button className="w-full border-0" style={{ backgroundColor: brandColor }} onClick={() => { setCameraError(null); capture() }}>
                <Camera className="h-4 w-4 mr-2" /> Try Again
              </Button>
            </div>
          ) : (
            <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive text-center">{cameraError}</div>
          )
        ) : capturedUrl ? (
          <div className="space-y-3">
            <img src={capturedUrl} alt="Captured ID verification" className="w-full rounded-lg object-cover max-h-64" />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={retake} disabled={uploading}>
                <RefreshCw className="h-4 w-4 mr-2" /> Retake
              </Button>
              <Button
                className="flex-1 border-0"
                style={{ backgroundColor: brandColor }}
                onClick={confirm}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Confirm & Continue
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
            </div>
            <canvas ref={canvasRef} className="hidden" />
            <Button className="w-full border-0" style={{ backgroundColor: brandColor }} onClick={capture}>
              <Camera className="h-4 w-4 mr-2" /> Take Photo
            </Button>
          </div>
        )}

        <p className="text-xs text-center text-muted-foreground">
          Your photo will be securely stored and reviewed by the assessment organizer.
        </p>
      </CardContent>
    </Card>
  )
}

export function InviteLandingPage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [systemChecked, setSystemChecked] = useState(false)
  const [checking, setChecking] = useState(false)
  const [idVerifySession, setIdVerifySession] = useState<{ sessionId: string } | null>(null)
  const [secureBrowserBlocked, setSecureBrowserBlocked] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['invite', token],
    queryFn: () => api.get(`/sessions/invite/${token}`).then(r => r.data.data),
    retry: false,
    refetchInterval: (q) => {
      const openAt = q.state.data?.test?.openAt
      if (!openAt) return false
      return new Date(openAt) > new Date() ? 15_000 : false
    },
  })

  const openAt = data?.test?.openAt ? new Date(data.test.openAt) : null
  const closeAt = data?.test?.closeAt ? new Date(data.test.closeAt) : null
  const now = new Date()
  const notYetOpen = openAt && openAt > now
  const alreadyClosed = closeAt && closeAt < now && !(data?.existingSessionId && data?.sessionStatus === 'IN_PROGRESS')

  const countdown = useCountdown(notYetOpen ? openAt : null)

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
      const { sessionId, idVerified } = res.data.data
      const needsIdVerify = data?.test?.requireIdVerification && !idVerified
      if (needsIdVerify) {
        setIdVerifySession({ sessionId })
      } else {
        navigate(`/take/${token}/test`, { state: { sessionId, inviteData: data } })
      }
    },
    onError: (err: any) => {
      const status = err?.response?.status
      if (status === 403) {
        const serverMsg: string = err?.response?.data?.error ?? ''
        if (serverMsg.toLowerCase().includes('secure browser')) {
          setSecureBrowserBlocked(true)
        } else {
          toast({ title: 'Network not allowed', description: serverMsg || 'This assessment is restricted to specific IP addresses. Contact the organizer if you believe this is an error.', variant: 'destructive' })
        }
      } else {
        toast({ title: 'Unable to start', description: getErrorMessage(err), variant: 'destructive' })
      }
    },
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

  // After session creation, show ID verification step if required and not yet verified
  if (idVerifySession) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ background: `linear-gradient(135deg, ${brandColor}10 0%, #ffffff 100%)` }}
      >
        <IdVerificationStep
          sessionId={idVerifySession.sessionId}
          token={token!}
          brandColor={brandColor}
          onVerified={() => navigate(`/take/${token}/test`, { state: { sessionId: idVerifySession.sessionId, inviteData: data } })}
        />
      </div>
    )
  }

  // Safe Exam Browser gate (preferred lockdown). SEB's User-Agent contains "SEB".
  const inSeb = /\bSEB\b/.test(navigator.userAgent)
  if (data?.test?.sebRequired && !inSeb) {
    return (
      <SebGate
        testTitle={data?.test?.title}
        tenantName={data?.test?.tenant?.name}
        token={token ?? ''}
      />
    )
  }

  const isSecureBrowser = !!(window as any).__SECURE_BROWSER__
  if (secureBrowserBlocked || (data?.test?.requireSecureBrowser && !isSecureBrowser)) {
    return (
      <SecureBrowserGate
        testTitle={data?.test?.title}
        tenantName={data?.test?.tenant?.name}
      />
    )
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
  const readyToStart = (!proctoring || systemChecked) && !notYetOpen && !alreadyClosed

  // Not-yet-open state
  if (notYetOpen && openAt) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: `linear-gradient(135deg, ${brandColor}10 0%, #ffffff 100%)` }}>
        <Card className="w-full max-w-md text-center">
          <CardContent className="py-12 space-y-4">
            <CalendarClock className="h-14 w-14 mx-auto" style={{ color: brandColor }} />
            <div>
              <h2 className="text-xl font-bold">{test.title}</h2>
              <p className="text-muted-foreground mt-1">Hello, {candidate.firstName}! This assessment is not yet open.</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-6 space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Opens in</p>
              <p className="text-4xl font-mono font-bold tabular-nums" style={{ color: brandColor }}>
                {countdown !== null ? fmtCountdown(countdown) : '...'}
              </p>
              <p className="text-sm text-muted-foreground">
                {openAt.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">This page will refresh automatically when the test opens.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Window closed state
  if (alreadyClosed && closeAt) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: `linear-gradient(135deg, ${brandColor}10 0%, #ffffff 100%)` }}>
        <Card className="w-full max-w-md text-center">
          <CardContent className="py-12 space-y-4">
            <CalendarX className="h-14 w-14 text-muted-foreground mx-auto" />
            <div>
              <h2 className="text-xl font-bold">{test.title}</h2>
              <p className="text-muted-foreground mt-1">The assessment window has closed.</p>
            </div>
            <p className="text-sm text-muted-foreground">
              This test closed on {closeAt.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })}.
            </p>
            <p className="text-xs text-muted-foreground">Please contact the assessment organizer if you believe this is an error.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

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
          <p className="text-muted-foreground mt-1">
            Hello, {candidate.firstName}!{' '}
            {invitation.attemptNumber > 1
              ? `This is your attempt #${invitation.attemptNumber}.`
              : "You've been invited to take this assessment."}
          </p>
        </div>

        {/* Previous attempts */}
        {Array.isArray(invitation.previousAttempts) && invitation.previousAttempts.length > 0 && (
          <Card className="border-gray-200">
            <CardContent className="p-4">
              <h3 className="font-semibold mb-3 text-sm">Previous Attempts</h3>
              <div className="space-y-2">
                {(invitation.previousAttempts as any[]).map((a: any) => (
                  <div key={a.attemptNumber} className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground w-20 shrink-0">Attempt {a.attemptNumber}</span>
                    <span className="font-semibold">{Math.round(a.percentage)}%</span>
                    {a.passed !== null && (
                      <Badge variant={a.passed ? 'success' : 'destructive'} className="text-xs">{a.passed ? 'Pass' : 'Fail'}</Badge>
                    )}
                    {a.submittedAt && (
                      <span className="text-xs text-muted-foreground ml-auto">
                        {new Date(a.submittedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

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

        {/* Scheduling window info */}
        {(openAt || closeAt) && (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="p-4 space-y-1">
              <h3 className="font-semibold text-blue-900 flex items-center gap-2 mb-1">
                <CalendarClock className="h-4 w-4" />
                Assessment window
              </h3>
              {openAt && <p className="text-sm text-blue-800">Opens: {openAt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</p>}
              {closeAt && <p className="text-sm text-blue-800">Closes: {closeAt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</p>}
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
