import { useRef, useState, useCallback } from 'react'

type PermissionState = 'idle' | 'granted' | 'denied'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

export function useAudioRecorder() {
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const [permission, setPermission] = useState<PermissionState>('idle')
  const [recording, setRecording] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const start = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mimeType = ['audio/webm; codecs=opus', 'audio/webm']
        .find(m => MediaRecorder.isTypeSupported(m)) ?? 'audio/webm'

      const recorder = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []
      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.start()
      recorderRef.current = recorder
      setPermission('granted')
      setRecording(true)
      return true
    } catch {
      setPermission('denied')
      return false
    }
  }, [])

  const stopAndUpload = useCallback(async (
    sessionId: string, token: string, questionId: string
  ): Promise<string | null> => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') return null

    return new Promise(resolve => {
      recorder.onstop = async () => {
        const chunks = [...chunksRef.current]
        chunksRef.current = []
        streamRef.current?.getTracks().forEach(t => t.stop())
        setRecording(false)

        if (chunks.length === 0) return resolve(null)

        const blob = new Blob(chunks, { type: 'audio/webm' })
        setPreviewUrl(prev => {
          if (prev) URL.revokeObjectURL(prev)
          return URL.createObjectURL(blob)
        })

        setUploading(true)
        try {
          const fd = new FormData()
          fd.append('file', blob, 'answer.webm')
          const res = await fetch(
            `${API_BASE}/api/sessions/${sessionId}/answers/${questionId}/media?token=${encodeURIComponent(token)}`,
            { method: 'POST', body: fd }
          )
          if (!res.ok) { resolve(null); return }
          const json = await res.json()
          resolve(json?.data?.audioUrl ?? null)
        } catch {
          resolve(null)
        } finally {
          setUploading(false)
        }
      }
      recorder.stop()
    })
  }, [])

  const reset = useCallback(() => {
    setPreviewUrl(prev => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setPermission('idle')
    setRecording(false)
  }, [])

  return { permission, recording, uploading, previewUrl, start, stopAndUpload, reset }
}
