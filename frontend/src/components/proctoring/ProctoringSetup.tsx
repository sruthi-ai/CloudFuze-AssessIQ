import { useEffect, useState } from 'react'
import { Camera, Mic, CheckCircle, XCircle, Loader2, AlertCircle, Shield, RefreshCw, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface ProctoringSetupProps {
  attachVideoRef: (el: HTMLVideoElement | null) => void
  webcamActive: boolean
  micActive: boolean
  faceCount: number
  onReady: () => void
  onRequestScreenShare?: () => Promise<boolean>
  screenSharePermission?: 'idle' | 'granted' | 'denied'
}

export function ProctoringSetup({
  attachVideoRef, webcamActive, micActive, faceCount, onReady,
  onRequestScreenShare, screenSharePermission = 'idle',
}: ProctoringSetupProps) {
  const [canStart, setCanStart] = useState(false)
  const [cameraBlocked, setCameraBlocked] = useState(false)
  const [screenShareLoading, setScreenShareLoading] = useState(false)

  useEffect(() => {
    if (!('permissions' in navigator)) return
    navigator.permissions.query({ name: 'camera' as PermissionName }).then(result => {
      setCameraBlocked(result.state === 'denied')
      result.addEventListener('change', () => setCameraBlocked(result.state === 'denied'))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (webcamActive) setCameraBlocked(false)
  }, [webcamActive])

  useEffect(() => {
    if (!webcamActive) return
    const t = setTimeout(() => setCanStart(true), 3000)
    return () => clearTimeout(t)
  }, [webcamActive])

  const faceStatus: 'loading' | 'ok' | 'none' | 'multiple' =
    !webcamActive || faceCount === -1 ? 'loading' :
    faceCount === 0 ? 'none' :
    faceCount === 1 ? 'ok' : 'multiple'

  const handleScreenShare = async () => {
    if (!onRequestScreenShare) return
    setScreenShareLoading(true)
    await onRequestScreenShare()
    setScreenShareLoading(false)
  }

  const screenShareEnabled = !!onRequestScreenShare

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-xl space-y-5">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 mb-3">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Proctoring Setup</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Verify your camera and environment before beginning.
          </p>
        </div>

        {/* Camera blocked — hard stop */}
        {cameraBlocked && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center space-y-3">
            <XCircle className="h-8 w-8 text-red-500 mx-auto" />
            <div>
              <p className="font-semibold text-red-700">Camera access is blocked</p>
              <p className="text-sm text-red-600 mt-1">
                You must allow camera access to take this proctored assessment.
              </p>
            </div>
            <ol className="text-sm text-left text-red-700 space-y-1 list-decimal list-inside">
              <li>Click the <strong>camera icon</strong> in your browser's address bar</li>
              <li>Select <strong>"Allow"</strong> for camera and microphone</li>
              <li>Reload this page</li>
            </ol>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4 mr-2" />Reload page
            </Button>
          </div>
        )}

        {/* Camera preview */}
        <Card className="overflow-hidden">
          <div className="relative bg-gray-900 aspect-video">
            <video
              ref={attachVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            {!webcamActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 gap-2">
                <Camera className="h-8 w-8" />
                <p className="text-sm">Requesting camera access…</p>
              </div>
            )}
            {webcamActive && (
              <div className={cn(
                'absolute top-2 left-2 px-2 py-1 rounded text-xs font-semibold',
                faceStatus === 'ok' ? 'bg-green-500/80 text-white' :
                faceStatus === 'none' ? 'bg-red-500/80 text-white' :
                faceStatus === 'multiple' ? 'bg-orange-500/80 text-white' :
                'bg-black/40 text-white',
              )}>
                {faceStatus === 'ok' ? '✓ Face detected' :
                 faceStatus === 'none' ? '⚠ No face — look at camera' :
                 faceStatus === 'multiple' ? `⚠ ${faceCount} faces — ensure you're alone` :
                 '⋯ Detecting face…'}
              </div>
            )}
          </div>
        </Card>

        {/* Check list */}
        <div className="grid grid-cols-2 gap-3">
          <CheckItem
            ok={webcamActive}
            loading={!webcamActive}
            icon={<Camera className="h-4 w-4" />}
            label="Camera access"
          />
          <CheckItem
            ok={micActive}
            loading={webcamActive && !micActive}
            warn={webcamActive && !micActive}
            icon={<Mic className="h-4 w-4" />}
            label="Microphone access"
            note={webcamActive && !micActive ? 'Mic unavailable (allowed)' : undefined}
          />
          <CheckItem
            ok={faceStatus === 'ok'}
            loading={faceStatus === 'loading'}
            warn={faceStatus === 'none' || faceStatus === 'multiple'}
            icon={<span className="text-base leading-none">👤</span>}
            label={faceStatus === 'multiple' ? 'Multiple faces' : 'Face visible'}
            note={
              faceStatus === 'none' ? 'Look directly at the camera' :
              faceStatus === 'multiple' ? 'Ensure you\'re alone in frame' :
              undefined
            }
          />
          <CheckItem
            ok
            icon={<Shield className="h-4 w-4" />}
            label="Secure session"
          />
        </div>

        {/* Screen share step (optional but strongly encouraged) */}
        {screenShareEnabled && (
          <div className={cn(
            'rounded-lg border p-4 space-y-3',
            screenSharePermission === 'granted'
              ? 'border-green-200 bg-green-50'
              : screenSharePermission === 'denied'
              ? 'border-orange-200 bg-orange-50'
              : 'border-blue-200 bg-blue-50'
          )}>
            <div className="flex items-start gap-3">
              <Monitor className={cn(
                'h-5 w-5 shrink-0 mt-0.5',
                screenSharePermission === 'granted' ? 'text-green-600' :
                screenSharePermission === 'denied' ? 'text-orange-500' : 'text-blue-600'
              )} />
              <div className="flex-1">
                <p className={cn(
                  'text-sm font-semibold',
                  screenSharePermission === 'granted' ? 'text-green-700' :
                  screenSharePermission === 'denied' ? 'text-orange-700' : 'text-blue-700'
                )}>
                  {screenSharePermission === 'granted'
                    ? '✓ Screen recording active'
                    : screenSharePermission === 'denied'
                    ? 'Screen share declined'
                    : 'Screen share required'}
                </p>
                <p className={cn(
                  'text-xs mt-0.5',
                  screenSharePermission === 'granted' ? 'text-green-600' :
                  screenSharePermission === 'denied' ? 'text-orange-600' : 'text-blue-600'
                )}>
                  {screenSharePermission === 'granted'
                    ? 'Your screen is being recorded for this assessment.'
                    : screenSharePermission === 'denied'
                    ? 'You may proceed without screen share, but this will be flagged.'
                    : 'Share your entire screen so we can verify your environment.'}
                </p>
              </div>
            </div>
            {screenSharePermission !== 'granted' && (
              <Button
                size="sm"
                variant={screenSharePermission === 'denied' ? 'outline' : 'default'}
                onClick={handleScreenShare}
                disabled={screenShareLoading}
                className="w-full"
              >
                {screenShareLoading
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Requesting…</>
                  : <><Monitor className="h-4 w-4 mr-2" />
                    {screenSharePermission === 'denied' ? 'Try Again' : 'Share My Screen'}
                  </>}
              </Button>
            )}
          </div>
        )}

        <p className="text-xs text-center text-muted-foreground">
          Sit in a well-lit, quiet space. Your face must remain visible throughout the assessment.
        </p>

        <Button
          className="w-full"
          size="lg"
          onClick={onReady}
          disabled={!canStart || cameraBlocked}
        >
          {cameraBlocked ? (
            <><XCircle className="h-4 w-4 mr-2" />Camera access required</>
          ) : !webcamActive ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" />Setting up camera…</>
          ) : !canStart ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" />Preparing proctoring…</>
          ) : (
            'Begin Assessment →'
          )}
        </Button>
      </div>
    </div>
  )
}

function CheckItem({
  ok, loading, warn, icon, label, note,
}: {
  ok: boolean
  loading?: boolean
  warn?: boolean
  icon: React.ReactNode
  label: string
  note?: string
}) {
  return (
    <div className={cn(
      'flex items-center gap-3 p-3 rounded-lg border bg-white',
      ok && !warn && 'border-green-200 bg-green-50',
      warn && 'border-orange-200 bg-orange-50',
    )}>
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-tight">{label}</p>
        {note && <p className="text-xs text-orange-600 leading-tight mt-0.5">{note}</p>}
      </div>
      <span className="shrink-0">
        {loading
          ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          : warn
          ? <AlertCircle className="h-4 w-4 text-orange-500" />
          : ok
          ? <CheckCircle className="h-4 w-4 text-green-500" />
          : <XCircle className="h-4 w-4 text-red-500" />}
      </span>
    </div>
  )
}
