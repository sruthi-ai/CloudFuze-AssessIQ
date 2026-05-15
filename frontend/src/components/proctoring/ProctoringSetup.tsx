import { useEffect, useState } from 'react'
import { Camera, Mic, CheckCircle, XCircle, Loader2, AlertCircle, Shield, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface ProctoringSetupProps {
  attachVideoRef: (el: HTMLVideoElement | null) => void
  webcamActive: boolean
  micActive: boolean
  faceCount: number // -1=loading/detecting, 0=no face, 1=ok, 2+=multiple
  onReady: () => void
}

export function ProctoringSetup({ attachVideoRef, webcamActive, micActive, faceCount, onReady }: ProctoringSetupProps) {
  const [canStart, setCanStart] = useState(false)
  const [cameraBlocked, setCameraBlocked] = useState(false)

  // Detect if camera permission was explicitly denied
  useEffect(() => {
    if (!('permissions' in navigator)) return
    navigator.permissions.query({ name: 'camera' as PermissionName }).then(result => {
      setCameraBlocked(result.state === 'denied')
      result.addEventListener('change', () => setCameraBlocked(result.state === 'denied'))
    }).catch(() => {})
  }, [])

  // If webcam goes active, clear blocked state
  useEffect(() => {
    if (webcamActive) setCameraBlocked(false)
  }, [webcamActive])

  // Allow start once webcam is active, with a 3 s grace period for models to load
  useEffect(() => {
    if (!webcamActive) return
    const t = setTimeout(() => setCanStart(true), 3000)
    return () => clearTimeout(t)
  }, [webcamActive])

  const faceStatus: 'loading' | 'ok' | 'none' | 'multiple' =
    !webcamActive || faceCount === -1 ? 'loading' :
    faceCount === 0 ? 'none' :
    faceCount === 1 ? 'ok' : 'multiple'

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
