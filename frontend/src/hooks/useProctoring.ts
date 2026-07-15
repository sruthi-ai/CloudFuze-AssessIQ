import { useEffect, useRef, useCallback, useState } from 'react'
import { toast } from '@/hooks/use-toast'

export type ProctoringEventType =
  | 'TAB_SWITCH' | 'WINDOW_BLUR' | 'FULLSCREEN_EXIT' | 'COPY_PASTE'
  | 'RIGHT_CLICK' | 'WEBCAM_BLOCKED' | 'SCREENSHOT_TAKEN' | 'DEVTOOLS_OPEN'
  | 'PHONE_DETECTED' | 'SCREEN_RECORDING_STOPPED' | 'CUSTOM'

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
  onTabReturn?: () => void  // called when candidate returns from a tab switch
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

// Proctoring is intentionally minimal: periodic watermarked webcam snapshots for
// the record, plus cheap zero-cost DOM signals (tab/window/fullscreen/copy-paste/
// devtools). There is deliberately NO client-side ML (face/pose/gaze/phone/
// lighting detection) — those loops ran continuously on the candidate's machine
// alongside SEB and the audio recorder, false-flagged normal behaviour as
// "violations", and their CPU/GPU load plausibly contended with MediaRecorder
// during Listening/JAM, contributing to dropped audio on lower-end laptops.
export function useProctoring({ sessionId, token, enabled, candidateName, onViolation, onTabReturn }: UseProctoringOptions) {
  const queueRef = useRef<QueuedEvent[]>([])
  const violationCountRef = useRef<Record<string, number>>({})
  const flushTimerRef = useRef<number | null>(null)
  const webcamStreamRef = useRef<MediaStream | null>(null)
  const lastWindowBlurRef = useRef<number>(0)
  const tabHiddenRef = useRef<boolean>(false)
  const stoppingRef = useRef<boolean>(false)
  const onTabReturnRef = useRef(onTabReturn)
  useEffect(() => { onTabReturnRef.current = onTabReturn }, [onTabReturn])

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const screenshotRef = useRef<number | null>(null)

  const [webcamActive, setWebcamActive] = useState(false)
  const [micActive, setMicActive] = useState(false)

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

  const flushRef = useRef(flush)
  useEffect(() => { flushRef.current = flush }, [flush])

  // pushImmediate: enqueue + flush within 50 ms so the backend gets it right away
  const pushImmediate = useCallback((
    type: ProctoringEventType,
    description?: string,
    metadata?: Record<string, unknown>
  ) => {
    pushEventRef.current(type, description, metadata)
    setTimeout(() => flushRef.current(), 50)
  }, [])

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
    } catch { /* best-effort — a dropped snapshot upload shouldn't interrupt the exam */ }
  }, [sessionId, token])

  // Capture an immediate snapshot (used alongside a tab-switch event, for the record)
  const captureViolationSnapshot = useCallback(() => {
    const video = videoRef.current
    if (!video || video.readyState < 2 || video.videoWidth === 0) return
    const W = Math.min(video.videoWidth, 480)
    const H = Math.round(W * video.videoHeight / video.videoWidth)
    const canvas = document.createElement('canvas')
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, W, H)
    const ts = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })
    const label = `${candidateName ?? 'Candidate'} | ${ts} | ${sessionId.substring(0, 8)}`
    drawWatermark(ctx, W, H, label)
    canvas.toBlob(blob => { if (blob) uploadSnapshot(blob) }, 'image/jpeg', 0.7)
  }, [candidateName, sessionId, uploadSnapshot])

  // ── Webcam: keep it live and take a periodic snapshot for the record ───────
  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    const startScreenshots = () => {
      // Every 45s is plenty for a spot-check record; at 5s this generated ~2,000
      // uploads per candidate over a 3-hour exam — real disk/network load across
      // a 150-200 candidate batch, all landing on the same server as everything else.
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
        const ts = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })
        const label = `${candidateName ?? 'Candidate'} | ${ts} | ${sessionId.substring(0, 8)}`
        drawWatermark(ctx, W, H, label)

        canvas.toBlob(blob => {
          if (!blob) return
          uploadSnapshot(blob)
          pushEventRef.current('SCREENSHOT_TAKEN', 'Periodic webcam snapshot captured')
        }, 'image/jpeg', 0.7)
      }, 45_000)
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
        if (stream.getAudioTracks().length > 0) setMicActive(true)
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
      if (screenshotRef.current) { clearInterval(screenshotRef.current); screenshotRef.current = null }
      setWebcamActive(false)
      setMicActive(false)
    }
  }, [enabled, candidateName, sessionId, uploadSnapshot]) // stable: uses refs for callbacks

  // ── Mobile / touch device detection (cheap user-agent check, no camera inference) ──
  useEffect(() => {
    if (!enabled) return
    const ua = navigator.userAgent
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
      || (navigator.maxTouchPoints > 1 && window.screen.width < 1024)
    if (isMobile) {
      pushEventRef.current('PHONE_DETECTED', 'Test opened on a mobile or touch device', {
        userAgent: ua,
        screenWidth: window.screen.width,
        touchPoints: navigator.maxTouchPoints,
      })
      // Flush immediately — don't wait for the 15s batch timer
      setTimeout(() => flushRef.current?.(), 100)
    }
  }, [enabled])

  // ── Tab / window / fullscreen detection ─────────────────────────────────────

  useEffect(() => {
    if (!enabled) return
    const handler = () => {
      if (document.hidden) {
        // Document became hidden — tab switch
        tabHiddenRef.current = true
        lastWindowBlurRef.current = Date.now()
        captureViolationSnapshot()
        pushImmediate('TAB_SWITCH', 'Candidate switched or minimized the browser tab')
      } else {
        // Returned to the tab
        if (tabHiddenRef.current) {
          tabHiddenRef.current = false
          onTabReturnRef.current?.()
        }
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [enabled, pushEvent, captureViolationSnapshot])

  useEffect(() => {
    if (!enabled) return
    const handler = () => {
      // Skip if a TAB_SWITCH was just logged (they overlap) or if debounce window active
      if (tabHiddenRef.current) return
      const now = Date.now()
      if (now - lastWindowBlurRef.current < 5000) return
      lastWindowBlurRef.current = now
      pushEvent('WINDOW_BLUR', 'Browser window lost focus')
    }
    window.addEventListener('blur', handler)
    return () => window.removeEventListener('blur', handler)
  }, [enabled, pushEvent])

  useEffect(() => {
    if (!enabled) return
    const handler = () => {
      if (stoppingRef.current) return
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
    stoppingRef.current = true
    webcamStreamRef.current?.getTracks().forEach(t => t.stop())
    if (screenshotRef.current) { clearInterval(screenshotRef.current); screenshotRef.current = null }
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {})
    await flush()
  }, [flush])

  return {
    pushEvent,
    pushImmediate,
    flush,
    stopProctoring,
    requestFullscreen,
    attachVideoRef,
    captureViolationSnapshot,
    violationCounts: violationCountRef.current,
    webcamActive,
    micActive,
  }
}
