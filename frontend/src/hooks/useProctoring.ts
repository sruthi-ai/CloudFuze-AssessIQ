import { useEffect, useRef, useCallback, useState } from 'react'
import { toast } from '@/hooks/use-toast'

export type ProctoringEventType =
  | 'TAB_SWITCH' | 'WINDOW_BLUR' | 'FULLSCREEN_EXIT' | 'COPY_PASTE'
  | 'RIGHT_CLICK' | 'WEBCAM_BLOCKED' | 'MULTIPLE_FACES' | 'NO_FACE_DETECTED'
  | 'NOISE_DETECTED' | 'SCREENSHOT_TAKEN' | 'DEVTOOLS_OPEN' | 'PHONE_DETECTED'
  | 'HEAD_TURNED' | 'SCREEN_RECORDING_STOPPED' | 'CUSTOM'

interface QueuedEvent {
  type: ProctoringEventType
  description?: string
  metadata?: Record<string, unknown>
  occurredAt: string
}

interface UseProctoringOptions {
  sessionId: string
  token: string
  enabled: boolean
  candidateName?: string
  onViolation?: (type: ProctoringEventType, count: number) => void
}

const API_BASE = import.meta.env.VITE_API_URL ?? ''

// Draw a semi-transparent watermark footer on a canvas context
function drawWatermark(ctx: CanvasRenderingContext2D, W: number, H: number, label: string) {
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(0, H - 18, W, 18)
  ctx.fillStyle = '#fff'
  ctx.font = `bold ${Math.max(8, Math.round(W / 42))}px monospace`
  ctx.fillText(label, 4, H - 5)
  ctx.restore()
}

export function useProctoring({ sessionId, token, enabled, candidateName, onViolation }: UseProctoringOptions) {
  const queueRef = useRef<QueuedEvent[]>([])
  const violationCountRef = useRef<Record<string, number>>({})
  const flushTimerRef = useRef<number | null>(null)
  const webcamStreamRef = useRef<MediaStream | null>(null)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const noiseCheckRef = useRef<number | null>(null)
  const faceCheckRef = useRef<number | null>(null)
  const screenshotRef = useRef<number | null>(null)

  const [webcamActive, setWebcamActive] = useState(false)
  const [micActive, setMicActive] = useState(false)
  const [faceCount, setFaceCount] = useState<number>(-1)

  const pushEvent = useCallback((
    type: ProctoringEventType,
    description?: string,
    metadata?: Record<string, unknown>
  ) => {
    if (!enabled) return
    const count = (violationCountRef.current[type] ?? 0) + 1
    violationCountRef.current[type] = count
    queueRef.current.push({ type, description, metadata, occurredAt: new Date().toISOString() })
    onViolation?.(type, count)
  }, [enabled, onViolation])

  const pushEventRef = useRef(pushEvent)
  useEffect(() => { pushEventRef.current = pushEvent }, [pushEvent])

  const flush = useCallback(async () => {
    if (!enabled || queueRef.current.length === 0) return
    const events = [...queueRef.current]
    queueRef.current = []
    try {
      const accessToken = localStorage.getItem('accessToken')
      await fetch(`${API_BASE}/api/proctoring/${sessionId}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ token, events }),
      })
    } catch {
      queueRef.current = [...events, ...queueRef.current]
    }
  }, [enabled, sessionId, token])

  const requestFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
    }
  }, [])

  const attachVideoRef = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el
    if (el && webcamStreamRef.current) el.srcObject = webcamStreamRef.current
  }, [])

  // ── Upload a watermarked webcam snapshot ────────────────────────────────────
  const uploadSnapshot = useCallback(async (blob: Blob) => {
    try {
      const fd = new FormData()
      fd.append('file', blob, 'snapshot.jpg')
      await fetch(`${API_BASE}/api/proctoring/${sessionId}/snapshot?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        body: fd,
      })
    } catch {}
  }, [sessionId, token])

  // ── Webcam + audio + face/head-pose + screenshots ───────────────────────────
  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    const startAudioMonitoring = (stream: MediaStream) => {
      try {
        const audioCtx = new AudioContext()
        audioCtxRef.current = audioCtx
        const analyser = audioCtx.createAnalyser()
        analyserRef.current = analyser
        analyser.fftSize = 256
        audioCtx.createMediaStreamSource(stream).connect(analyser)
        setMicActive(true)

        const buffer = new Uint8Array(analyser.frequencyBinCount)
        let consecutiveNoise = 0
        noiseCheckRef.current = window.setInterval(() => {
          if (cancelled || !analyserRef.current) return
          analyserRef.current.getByteFrequencyData(buffer)
          const rms = Math.sqrt(buffer.reduce((s, v) => s + v * v, 0) / buffer.length) / 255
          if (rms > 0.15) {
            consecutiveNoise++
            if (consecutiveNoise >= 3) {
              pushEventRef.current('NOISE_DETECTED', 'Sustained background noise detected')
              consecutiveNoise = 0
            }
          } else {
            consecutiveNoise = 0
          }
        }, 3000)
      } catch {}
    }

    const startFaceAndPoseDetection = () => {
      setTimeout(async () => {
        if (cancelled) return
        try {
          const { initFaceDetection, detectFacesWithPose } = await import('@/lib/faceDetection')
          const loaded = await initFaceDetection()
          if (!loaded || cancelled) return

          let consecutiveNoFace = 0
          let consecutiveHeadTurn = 0

          const check = async () => {
            if (cancelled || !videoRef.current) return
            const { count, headPose } = await detectFacesWithPose(videoRef.current)
            if (cancelled) return

            setFaceCount(count)

            if (count === 0) {
              consecutiveNoFace++
              if (consecutiveNoFace >= 2) {
                pushEventRef.current('NO_FACE_DETECTED', 'No face visible in webcam for extended period')
                consecutiveNoFace = 0
              }
            } else {
              consecutiveNoFace = 0
              if (count > 1) {
                pushEventRef.current('MULTIPLE_FACES', `${count} faces detected in webcam`)
              }
            }

            // Head pose: yaw > 0.45 = looking significantly left/right
            if (headPose && (Math.abs(headPose.yaw) > 0.45 || headPose.pitch < -0.5)) {
              consecutiveHeadTurn++
              if (consecutiveHeadTurn >= 2) {
                const dir = Math.abs(headPose.yaw) > 0.45
                  ? (headPose.yaw > 0 ? 'right' : 'left')
                  : 'up'
                pushEventRef.current('HEAD_TURNED', `Candidate looking ${dir} (yaw=${headPose.yaw.toFixed(2)})`, {
                  yaw: headPose.yaw,
                  pitch: headPose.pitch,
                  direction: dir,
                })
                consecutiveHeadTurn = 0
              }
            } else {
              consecutiveHeadTurn = 0
            }
          }

          await check()
          if (!cancelled) {
            faceCheckRef.current = window.setInterval(check, 10_000)
          }
        } catch {}
      }, 2500)
    }

    const startScreenshots = () => {
      screenshotRef.current = window.setInterval(() => {
        if (cancelled) return
        const video = videoRef.current
        if (!video || video.readyState < 2 || video.videoWidth === 0) return

        const W = Math.min(video.videoWidth, 480)
        const H = Math.round(W * video.videoHeight / video.videoWidth)
        const canvas = document.createElement('canvas')
        canvas.width = W
        canvas.height = H
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        ctx.drawImage(video, 0, 0, W, H)

        // Draw watermark
        const ts = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })
        const label = `${candidateName ?? 'Candidate'} | ${ts} | ${sessionId.substring(0, 8)}`
        drawWatermark(ctx, W, H, label)

        canvas.toBlob(blob => {
          if (!blob) return
          uploadSnapshot(blob)
          pushEventRef.current('SCREENSHOT_TAKEN', 'Periodic webcam snapshot captured')
        }, 'image/jpeg', 0.7)
      }, 30_000)
    }

    const acquire = () =>
      navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .catch(() => navigator.mediaDevices.getUserMedia({ video: true, audio: false }))

    acquire()
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        webcamStreamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
        setWebcamActive(true)

        if (stream.getAudioTracks().length > 0) startAudioMonitoring(stream)
        startFaceAndPoseDetection()
        startScreenshots()
      })
      .catch(() => {
        if (cancelled) return
        pushEventRef.current('WEBCAM_BLOCKED', 'Webcam/microphone access denied or unavailable')
        toast({
          title: 'Webcam required',
          description: 'Please allow webcam access to continue the proctored test.',
          variant: 'destructive',
        })
      })

    return () => {
      cancelled = true
      webcamStreamRef.current?.getTracks().forEach(t => t.stop())
      webcamStreamRef.current = null
      audioCtxRef.current?.close().catch(() => {})
      audioCtxRef.current = null
      analyserRef.current = null
      if (noiseCheckRef.current) { clearInterval(noiseCheckRef.current); noiseCheckRef.current = null }
      if (faceCheckRef.current) { clearInterval(faceCheckRef.current); faceCheckRef.current = null }
      if (screenshotRef.current) { clearInterval(screenshotRef.current); screenshotRef.current = null }
      setWebcamActive(false)
      setMicActive(false)
      setFaceCount(-1)
    }
  }, [enabled]) // stable: uses refs for callbacks

  // ── Tab / window / fullscreen detection ─────────────────────────────────────

  useEffect(() => {
    if (!enabled) return
    const handler = () => {
      if (document.hidden) {
        pushEvent('TAB_SWITCH', 'Candidate switched or minimized the browser tab')
        toast({ title: 'Warning: Tab switch detected', description: 'This has been logged.', variant: 'destructive' })
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [enabled, pushEvent])

  useEffect(() => {
    if (!enabled) return
    const handler = () => pushEvent('WINDOW_BLUR', 'Browser window lost focus')
    window.addEventListener('blur', handler)
    return () => window.removeEventListener('blur', handler)
  }, [enabled, pushEvent])

  useEffect(() => {
    if (!enabled) return
    const handler = () => {
      if (!document.fullscreenElement) {
        pushEvent('FULLSCREEN_EXIT', 'Candidate exited fullscreen mode')
        toast({ title: 'Warning: Fullscreen required', description: 'Please stay in fullscreen mode.', variant: 'destructive' })
        setTimeout(requestFullscreen, 1500)
      }
    }
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [enabled, pushEvent, requestFullscreen])

  // ── Copy / paste / right-click with clipboard content capture ───────────────

  useEffect(() => {
    if (!enabled) return

    const blockCopy = (e: ClipboardEvent) => {
      e.preventDefault()
      pushEvent('COPY_PASTE', 'Copy action attempted')
    }

    const blockPaste = (e: ClipboardEvent) => {
      e.preventDefault()
      const text = e.clipboardData?.getData('text') ?? ''
      pushEvent('COPY_PASTE', 'Paste action attempted', {
        pastedLength: text.length,
        pastedPreview: text.substring(0, 300),
      })
    }

    const blockRight = (e: MouseEvent) => {
      e.preventDefault()
      pushEvent('RIGHT_CLICK', 'Right-click attempted')
    }

    document.addEventListener('copy', blockCopy)
    document.addEventListener('paste', blockPaste)
    document.addEventListener('contextmenu', blockRight)
    return () => {
      document.removeEventListener('copy', blockCopy)
      document.removeEventListener('paste', blockPaste)
      document.removeEventListener('contextmenu', blockRight)
    }
  }, [enabled, pushEvent])

  // ── DevTools detection ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!enabled) return
    let reported = false
    const check = () => {
      const widthDiff = window.outerWidth - window.innerWidth
      const heightDiff = window.outerHeight - window.innerHeight
      if ((widthDiff > 160 || heightDiff > 160) && !reported) {
        reported = true
        pushEvent('DEVTOOLS_OPEN', 'DevTools may be open (window size heuristic)')
      } else if (widthDiff <= 160 && heightDiff <= 160) {
        reported = false
      }
    }
    const interval = window.setInterval(check, 3000)
    return () => clearInterval(interval)
  }, [enabled, pushEvent])

  // ── Flush timer ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!enabled) return
    flushTimerRef.current = window.setInterval(flush, 15_000)
    return () => {
      if (flushTimerRef.current) { clearInterval(flushTimerRef.current); flushTimerRef.current = null }
    }
  }, [enabled, flush])

  const stopProctoring = useCallback(async () => {
    webcamStreamRef.current?.getTracks().forEach(t => t.stop())
    audioCtxRef.current?.close().catch(() => {})
    if (noiseCheckRef.current) { clearInterval(noiseCheckRef.current); noiseCheckRef.current = null }
    if (faceCheckRef.current) { clearInterval(faceCheckRef.current); faceCheckRef.current = null }
    if (screenshotRef.current) { clearInterval(screenshotRef.current); screenshotRef.current = null }
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {})
    await flush()
  }, [flush])

  return {
    pushEvent,
    flush,
    stopProctoring,
    requestFullscreen,
    attachVideoRef,
    violationCounts: violationCountRef.current,
    webcamActive,
    micActive,
    faceCount,
  }
}
