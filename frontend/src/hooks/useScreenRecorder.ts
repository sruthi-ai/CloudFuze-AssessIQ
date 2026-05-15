import { useRef, useState, useCallback } from 'react'

type PermissionState = 'idle' | 'granted' | 'denied'

interface UseScreenRecorderOptions {
  sessionId: string
  token: string
  enabled: boolean
}

const API_BASE = import.meta.env.VITE_API_URL ?? ''

export function useScreenRecorder({ sessionId, token, enabled }: UseScreenRecorderOptions) {
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const [permission, setPermission] = useState<PermissionState>('idle')
  const [uploading, setUploading] = useState(false)

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
        videoBitsPerSecond: 250_000, // 250 kbps — low quality for storage efficiency
      })

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.start(15_000) // chunk every 15 seconds
      recorderRef.current = recorder
      setPermission('granted')

      // If user stops sharing from browser chrome
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        setPermission('denied')
        recorderRef.current?.stop()
      })

      return true
    } catch {
      setPermission('denied')
      return false
    }
  }, [enabled])

  const stopAndUpload = useCallback(async (): Promise<void> => {
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
            // Best-effort — don't block test submission
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
    recorderRef.current?.stop()
    streamRef.current?.getTracks().forEach(t => t.stop())
    chunksRef.current = []
  }, [])

  return { requestPermission, stopAndUpload, stopWithoutUpload, permission, uploading }
}
