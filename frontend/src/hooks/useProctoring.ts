import { useEffect, useRef, useCallback, useState } from 'react'
import { toast } from '@/hooks/use-toast'

export type ProctoringEventType =
  | 'TAB_SWITCH' | 'WINDOW_BLUR' | 'FULLSCREEN_EXIT' | 'COPY_PASTE'
  | 'RIGHT_CLICK' | 'WEBCAM_BLOCKED' | 'MULTIPLE_FACES' | 'NO_FACE_DETECTED'
  | 'NOISE_DETECTED' | 'SCREENSHOT_TAKEN' | 'DEVTOOLS_OPEN' | 'PHONE_DETECTED'
  | 'HEAD_TURNED' | 'SCREEN_RECORDING_STOPPED' | 'CUSTOM'
  | 'FACE_OBSTRUCTED' | 'SUSPECTED_ASSISTANCE'

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
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const noiseCheckRef = useRef<number | null>(null)
  const faceCheckRef = useRef<number | null>(null)
  const screenshotRef = useRef<number | null>(null)
  const phoneCheckRef = useRef<number | null>(null)

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
    } catch {}
  }, [sessionId, token])

  // Capture an immediate snapshot (used on high-severity violations)
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

    const startPhoneDetection = () => {
      // Delay start so it doesn't compete with face model loading
      setTimeout(async () => {
        if (cancelled) return
        try {
          const { initPhoneDetection, detectPhone } = await import('@/lib/phoneDetection')
          const loaded = await initPhoneDetection()
          if (!loaded || cancelled) return

          let consecutivePhone = 0

          phoneCheckRef.current = window.setInterval(async () => {
            if (cancelled || !videoRef.current) return
            const found = await detectPhone(videoRef.current)
            if (!found) { consecutivePhone = 0; return }
            consecutivePhone++
            if (consecutivePhone >= 2) {
              captureViolationSnapshot()
              pushImmediate('PHONE_DETECTED', 'Mobile phone detected in webcam view')
              consecutivePhone = 0
            }
          }, 15_000)
        } catch {}
      }, 8000) // 8s head-start for face detection to load first
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
          let consecutiveMultiFace = 0
          let consecutivePartialFace = 0
          // Rolling window: track gaze directions to detect repeated off-camera attention
          const gazeHistory: Array<{ dir: string; ts: number }> = []
          const GAZE_WINDOW_MS = 3 * 60 * 1000

          const check = async () => {
            if (cancelled || !videoRef.current) return
            const { count, headPose, partialFace } = await detectFacesWithPose(videoRef.current)
            if (cancelled) return

            // count === -1 means video frame wasn't ready — skip this tick entirely
            if (count === -1) return

            setFaceCount(count)

            if (count === 0) {
              consecutiveNoFace++
              consecutiveMultiFace = 0
              consecutivePartialFace = 0
              if (consecutiveNoFace >= 2) {
                captureViolationSnapshot()
                pushImmediate('NO_FACE_DETECTED', 'No face visible in webcam for extended period')
                consecutiveNoFace = 0
              }
            } else {
              consecutiveNoFace = 0
              if (count > 1) {
                consecutiveMultiFace++
                if (consecutiveMultiFace >= 2) {
                  captureViolationSnapshot()
                  pushImmediate('MULTIPLE_FACES', `${count} faces detected in webcam`, { faceCount: count })
                  consecutiveMultiFace = 0
                }
              } else {
                consecutiveMultiFace = 0
              }

              // Partial face: face bounding box near/past the frame edge for 3 consecutive checks (~9s)
              if (partialFace) {
                consecutivePartialFace++
                if (consecutivePartialFace >= 3) {
                  captureViolationSnapshot()
                  pushImmediate('FACE_OBSTRUCTED', 'Face partially outside camera frame — possible deliberate positioning', { partialFace: true })
                  consecutivePartialFace = 0
                }
              } else {
                consecutivePartialFace = 0
              }
            }

            // Head pose: yaw > 0.35 (~20°) or pitch out of range = gaze deviation
            if (headPose && (Math.abs(headPose.yaw) > 0.35 || headPose.pitch < -0.4 || headPose.pitch > 0.4)) {
              consecutiveHeadTurn++
              if (consecutiveHeadTurn >= 2) {
                const dir = Math.abs(headPose.yaw) > 0.35
                  ? (headPose.yaw > 0 ? 'right' : 'left')
                  : headPose.pitch > 0.4 ? 'down' : 'up'
                captureViolationSnapshot()
                pushImmediate('HEAD_TURNED', `Candidate looking ${dir} (yaw=${headPose.yaw.toFixed(2)}, pitch=${headPose.pitch.toFixed(2)})`, {
                  yaw: headPose.yaw,
                  pitch: headPose.pitch,
                  direction: dir,
                })
                consecutiveHeadTurn = 0

                // Gaze pattern: if the same direction appears 3+ times in a 3-min rolling window,
                // it suggests a stationary off-camera reference (person, notes, phone on desk).
                const now = Date.now()
                // Evict entries older than the window
                while (gazeHistory.length > 0 && now - gazeHistory[0].ts > GAZE_WINDOW_MS) {
                  gazeHistory.shift()
                }
                gazeHistory.push({ dir, ts: now })
                const sameDirCount = gazeHistory.filter(g => g.dir === dir).length
                if (sameDirCount >= 3) {
                  pushImmediate(
                    'SUSPECTED_ASSISTANCE',
                    `Repeated gaze toward ${dir} (${sameDirCount}× in 3 min) — possible off-camera assistance`,
                    { direction: dir, count: sameDirCount }
                  )
                  gazeHistory.length = 0 // reset so it doesn't fire again until another streak builds
                }
              }
            } else {
              consecutiveHeadTurn = 0
            }
          }

          await check()
          if (!cancelled) {
            faceCheckRef.current = window.setInterval(check, 3_000)
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
      }, 10_000)
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
        startPhoneDetection()
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
      if (phoneCheckRef.current) { clearInterval(phoneCheckRef.current); phoneCheckRef.current = null }
      setWebcamActive(false)
      setMicActive(false)
      setFaceCount(-1)
    }
  }, [enabled]) // stable: uses refs for callbacks

  // ── Mobile / touch device detection ─────────────────────────────────────────
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
    audioCtxRef.current?.close().catch(() => {})
    if (noiseCheckRef.current) { clearInterval(noiseCheckRef.current); noiseCheckRef.current = null }
    if (faceCheckRef.current) { clearInterval(faceCheckRef.current); faceCheckRef.current = null }
    if (screenshotRef.current) { clearInterval(screenshotRef.current); screenshotRef.current = null }
    if (phoneCheckRef.current) { clearInterval(phoneCheckRef.current); phoneCheckRef.current = null }
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
    faceCount,
  }
}
