import { useRef, useState, useCallback } from 'react'

type PermissionState = 'idle' | 'granted' | 'denied'

interface UseScreenRecorderOptions {
  sessionId: string
  token: string
  enabled: boolean
  onStopped?: () => void  // called when candidate closes the share from browser chrome
}

const API_BASE = import.meta.env.VITE_API_URL ?? ''

export function useScreenRecorder({ sessionId, token, enabled, onStopped }: UseScreenRecorderOptions) {
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const screenshotTimerRef = useRef<number | null>(null)
  const screenshotVideoRef = useRef<HTMLVideoElement | null>(null)
  const [permission, setPermission] = useState<PermissionState>('idle')
  const [uploading, setUploading] = useState(false)

  const uploadScreenSnapshot = useCallback(async (blob: Blob) => {
    try {
      const fd = new FormData()
      fd.append('file', blob, 'screen-snapshot.jpg')
      await fetch(
        `${API_BASE}/api/proctoring/${sessionId}/screen-snapshot?token=${encodeURIComponent(token)}`,
        { method: 'POST', body: fd }
      )
    } catch {}
  }, [sessionId, token])

  const startScreenshots = useCallback((stream: MediaStream) => {
    // Create a hidden video element to pull frames from the screen stream
    const video = document.createElement('video')
    video.srcObject = stream
    video.muted = true
    video.playsInline = true
    screenshotVideoRef.current = video
    video.play().catch(() => {})

    screenshotTimerRef.current = window.setInterval(() => {
      if (video.readyState < 2 || video.videoWidth === 0) return
      const W = Math.min(video.videoWidth, 1280)
      const H = Math.round(W * video.videoHeight / video.videoWidth)
      const canvas = document.createElement('canvas')
      canvas.width = W
      canvas.height = H
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(video, 0, 0, W, H)
      canvas.toBlob(blob => { if (blob) uploadScreenSnapshot(blob) }, 'image/jpeg', 0.65)
    }, 30_000)
  }, [uploadScreenSnapshot])

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!enabled) return false
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { displaySurface: 'monitor', frameRate: { ideal: 2, max: 5 } },
        audio: false,
      }) as MediaStream

      streamRef.current = stream

      const mimeType = ['video/webm; codecs=vp9', 'video/webm; codecs=vp8', 'video/webm']
        .find(m => MediaRecorder.isTypeSupported(m)) ?? 'video/webm'

      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 250_000,
      })

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.start(15_000)
      recorderRef.current = recorder
      setPermission('granted')

      // Start periodic screen snapshots
      startScreenshots(stream)

      // If candidate closes the share from browser chrome — fire violation event
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        setPermission('denied')
        recorderRef.current?.stop()
        if (screenshotTimerRef.current) {
          clearInterval(screenshotTimerRef.current)
          screenshotTimerRef.current = null
        }
        screenshotVideoRef.current?.pause()
        screenshotVideoRef.current = null
        onStopped?.()
      })

      return true
    } catch {
      setPermission('denied')
      return false
    }
  }, [enabled, startScreenshots, onStopped])

  const stopAndUpload = useCallback(async (): Promise<void> => {
    if (screenshotTimerRef.current) {
      clearInterval(screenshotTimerRef.current)
      screenshotTimerRef.current = null
    }
    screenshotVideoRef.current?.pause()
    screenshotVideoRef.current = null

    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      streamRef.current?.getTracks().forEach(t => t.stop())
      return
    }

    return new Promise(resolve => {
      recorder.onstop = async () => {
        const chunks = [...chunksRef.current]
        chunksRef.current = []
        streamRef.current?.getTracks().forEach(t => t.stop())

        if (chunks.length > 0) {
          setUploading(true)
          try {
            const blob = new Blob(chunks, { type: 'video/webm' })
            const fd = new FormData()
            fd.append('file', blob, 'recording.webm')
            await fetch(
              `${API_BASE}/api/proctoring/${sessionId}/screen-recording?token=${encodeURIComponent(token)}`,
              { method: 'POST', body: fd }
            )
          } catch {
          } finally {
            setUploading(false)
          }
        }
        resolve()
      }
      recorder.stop()
    })
  }, [sessionId, token])

  const stopWithoutUpload = useCallback(() => {
    if (screenshotTimerRef.current) {
      clearInterval(screenshotTimerRef.current)
      screenshotTimerRef.current = null
    }
    screenshotVideoRef.current?.pause()
    screenshotVideoRef.current = null
    recorderRef.current?.stop()
    streamRef.current?.getTracks().forEach(t => t.stop())
    chunksRef.current = []
  }, [])

  return { requestPermission, stopAndUpload, stopWithoutUpload, permission, uploading }
}
