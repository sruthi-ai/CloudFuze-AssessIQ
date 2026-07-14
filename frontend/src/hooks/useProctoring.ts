import { useEffect, useRef, useCallback, useState } from 'react'
import { toast } from '@/hooks/use-toast'

export type ProctoringEventType =
  | 'TAB_SWITCH' | 'WINDOW_BLUR' | 'FULLSCREEN_EXIT' | 'COPY_PASTE'
  | 'RIGHT_CLICK' | 'WEBCAM_BLOCKED' | 'MULTIPLE_FACES' | 'NO_FACE_DETECTED'
  | 'NOISE_DETECTED' | 'SCREENSHOT_TAKEN' | 'DEVTOOLS_OPEN' | 'PHONE_DETECTED'
  | 'HEAD_TURNED' | 'SCREEN_RECORDING_STOPPED' | 'CUSTOM'
  | 'FACE_OBSTRUCTED' | 'SUSPECTED_ASSISTANCE' | 'IDENTITY_MISMATCH' | 'POOR_LIGHTING'

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
  const brightnessCheckRef = useRef<number | null>(null)
  const latestFaceBboxRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null)

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
    } catch { /* best-effort — a dropped snapshot upload shouldn't interrupt the exam */ }
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
        // 2048-point FFT gives ~23 Hz/bin at 48 kHz — enough to isolate speech frequencies
        analyser.fftSize = 2048
        analyser.smoothingTimeConstant = 0.8
        audioCtx.createMediaStreamSource(stream).connect(analyser)
        setMicActive(true)

        const bufLen = analyser.frequencyBinCount  // 1024 bins
        const buffer = new Uint8Array(bufLen)
        const hzPerBin = audioCtx.sampleRate / analyser.fftSize

        // Speech band: 300–3400 Hz (telephone/voice bandwidth)
        const spLo = Math.round(300 / hzPerBin)
        const spHi = Math.round(3400 / hzPerBin)

        // Broadband noise reference: sub-bass (50–200 Hz) + high (5–8 kHz)
        // If the whole room is loud (exam hall hum), both bands rise equally — SNR stays low.
        const nLo1 = Math.round(50 / hzPerBin)
        const nHi1 = Math.round(200 / hzPerBin)
        const nLo2 = Math.round(5000 / hzPerBin)
        const nHi2 = Math.min(Math.round(8000 / hzPerBin), bufLen - 1)

        const bandAvg = (lo: number, hi: number) => {
          let s = 0; for (let i = lo; i <= hi; i++) s += buffer[i]
          return s / (hi - lo + 1) / 255
        }

        const speechWindow: boolean[] = []
        noiseCheckRef.current = window.setInterval(() => {
          if (cancelled || !analyserRef.current) return
          analyserRef.current.getByteFrequencyData(buffer)

          const speech = bandAvg(spLo, spHi)
          const noise = (bandAvg(nLo1, nHi1) + bandAvg(nLo2, nHi2)) / 2

          // Flag when speech band is absolutely present (> 6.5%) AND
          // at least 1.5× louder than ambient noise floor (SNR check).
          const isSpeech = speech > 0.065 && speech > noise * 1.5

          // Background-noise / voice detection is DISABLED: it produced too many
          // false positives from ambient room noise, cluttered proctoring reports,
          // and its frequent event POSTs added avoidable request load. Noise never
          // counted toward disqualification anyway. Left here (no-op) so it can be
          // re-enabled later with better tuning if needed.
          void isSpeech; void speechWindow
        }, 3000)
      } catch { /* mic permission denied or unsupported — noise detection just stays off */ }
    }

    const startPhoneDetection = () => {
      // 3s delay — enough for face model to start loading without blocking it
      setTimeout(async () => {
        if (cancelled) return
        try {
          const { initPhoneDetection, detectPhone } = await import('@/lib/phoneDetection')
          const loaded = await initPhoneDetection()
          if (!loaded || cancelled) return

          let consecutivePhone = 0

          phoneCheckRef.current = window.setInterval(async () => {
            if (cancelled || !videoRef.current) return
            const { detected, highConfidence } = await detectPhone(videoRef.current)
            if (!detected) { consecutivePhone = 0; return }
            consecutivePhone++
            // High-confidence single detection is enough — don't wait for 2nd check
            if (highConfidence || consecutivePhone >= 2) {
              captureViolationSnapshot()
              pushImmediate('PHONE_DETECTED', 'Mobile phone detected in webcam view')
              consecutivePhone = 0
            }
          }, 8_000)
        } catch { /* phone-detection model failed to load — feature just stays off */ }
      }, 3000)
    }

    const startFaceAndPoseDetection = () => {
      setTimeout(async () => {
        if (cancelled) return
        try {
          const { initFaceDetection, detectFacesWithPose } = await import('@/lib/faceDetection')
          const loaded = await initFaceDetection()
          if (!loaded || cancelled) return

          // ── Face re-verification: load recognition model in background ──────
          // Loads after the test starts so it doesn't block the setup screen.
          // Captures a baseline face descriptor from the first 3 good frames,
          // then compares every 60s (every 20th check at 3s interval).
          const baselineDescriptors: Float32Array[] = []
          let baselineAvg: Float32Array | null = null
          let verifyCheckCount = 0
          const VERIFY_EVERY = 20 // every 60s at 3s interval
          const MISMATCH_THRESHOLD = 0.55

          ;(async () => {
            const { initFaceRecognition } = await import('@/lib/faceDetection')
            await initFaceRecognition()
          })()

          let consecutiveNoFace = 0
          let consecutiveHeadTurn = 0
          let consecutiveMultiFace = 0
          let consecutivePartialFace = 0
          // Rolling window: track gaze directions to detect repeated off-camera attention
          const gazeHistory: Array<{ dir: string; ts: number }> = []
          const GAZE_WINDOW_MS = 3 * 60 * 1000

          const check = async () => {
            if (cancelled || !videoRef.current) return
            const { count, headPose, partialFace, faceBbox } = await detectFacesWithPose(videoRef.current)
            if (cancelled) return
            latestFaceBboxRef.current = faceBbox

            // count === -1 means video frame wasn't ready — skip this tick entirely
            if (count === -1) return

            setFaceCount(count)

            if (count === 0) {
              consecutiveNoFace++
              consecutiveMultiFace = 0
              consecutivePartialFace = 0
              if (consecutiveNoFace >= 2) {
                captureViolationSnapshot()
                // Check for a phone in the frame before reporting no-face —
                // if a phone is visible it's a stronger signal than just an absent face.
                const { detectPhone } = await import('@/lib/phoneDetection')
                const phoneResult = videoRef.current ? await detectPhone(videoRef.current) : null
                const phoneVisible = phoneResult?.detected ?? false
                if (phoneVisible) {
                  pushImmediate('PHONE_DETECTED', 'Mobile phone detected in webcam view')
                } else {
                  pushImmediate('NO_FACE_DETECTED', 'No face visible in webcam for extended period')
                }
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

            // ── Face re-verification ──────────────────────────────────────────
            if (count === 1) {
              verifyCheckCount++
              const { getFaceDescriptor, faceDistance } = await import('@/lib/faceDetection')

              // Build baseline from first 3 high-quality frames
              if (baselineDescriptors.length < 3) {
                const desc = await getFaceDescriptor(videoRef.current!)
                if (desc) {
                  baselineDescriptors.push(desc)
                  if (baselineDescriptors.length === 3) {
                    // Average the 3 descriptors for a more stable baseline
                    const avg = new Float32Array(128)
                    for (const d of baselineDescriptors) d.forEach((v, i) => { avg[i] += v / 3 })
                    baselineAvg = avg
                  }
                }
              } else if (baselineAvg && verifyCheckCount % VERIFY_EVERY === 0) {
                const desc = await getFaceDescriptor(videoRef.current!)
                if (desc && !cancelled) {
                  const dist = faceDistance(baselineAvg, desc)
                  if (dist > MISMATCH_THRESHOLD) {
                    captureViolationSnapshot()
                    pushImmediate('IDENTITY_MISMATCH',
                      `Face does not match the person who started the test (distance: ${dist.toFixed(2)})`,
                      { distance: dist, threshold: MISMATCH_THRESHOLD }
                    )
                  }
                }
              }
            }
          }

          await check()
          if (!cancelled) {
            faceCheckRef.current = window.setInterval(check, 3_000)
          }
        } catch { /* face-detection model failed to load — feature just stays off */ }
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
      }, 5_000)

      // Brightness check every 15s — uses face bounding box when available so a bright
      // window behind the candidate (backlighting) is correctly detected as poor lighting.
      let darkFrameCount = 0
      brightnessCheckRef.current = window.setInterval(async () => {
        if (cancelled || !videoRef.current) return
        const { measureFrameBrightness, measureRegionBrightness, MIN_BRIGHTNESS } = await import('@/lib/frameAnalysis')
        const bbox = latestFaceBboxRef.current
        const lum = bbox
          ? measureRegionBrightness(videoRef.current, bbox.x, bbox.y, bbox.width, bbox.height)
          : measureFrameBrightness(videoRef.current)
        if (lum < MIN_BRIGHTNESS) {
          darkFrameCount++
          if (darkFrameCount >= 2) {
            captureViolationSnapshot()
            pushImmediate('POOR_LIGHTING', `Face region too dark — candidate may be backlit or in poor lighting (luminance: ${lum.toFixed(0)})`)
            darkFrameCount = 0
          }
        } else {
          darkFrameCount = 0
        }
      }, 15_000)
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
      if (brightnessCheckRef.current) { clearInterval(brightnessCheckRef.current); brightnessCheckRef.current = null }
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
    if (brightnessCheckRef.current) { clearInterval(brightnessCheckRef.current); brightnessCheckRef.current = null }
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
