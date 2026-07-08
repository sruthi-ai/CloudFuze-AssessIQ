import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Upload, Volume2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, getErrorMessage } from '@/lib/api'
import { toast } from '@/hooks/use-toast'

export const TTS_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse']
export const TTS_ACCENTS = [
  'American English', 'British English', 'Australian English',
  'Indian English', 'Canadian English', 'Irish English',
]
export const MAX_SCRIPT_CHARS = 4096

// Fetches an audio asset with the admin's Bearer token and plays it as a blob URL.
export function SecureAudioPreview({ assetId }: { assetId: string }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [err, setErr] = useState(false)
  const prevUrl = useRef<string | null>(null)

  useEffect(() => {
    setObjectUrl(null); setErr(false)
    let active = true
    const token = localStorage.getItem('accessToken')
    fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/audio-assets/${assetId}/media`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => { if (!r.ok) { if (active) setErr(true); throw new Error() } return r.blob() })
      .then(blob => {
        if (!active) return
        if (prevUrl.current) URL.revokeObjectURL(prevUrl.current)
        const url = URL.createObjectURL(blob)
        prevUrl.current = url
        setObjectUrl(url)
      })
      .catch(() => { if (active) setErr(true) })
    return () => {
      active = false
      if (prevUrl.current) { URL.revokeObjectURL(prevUrl.current); prevUrl.current = null }
    }
  }, [assetId])

  if (err) return <p className="text-xs text-red-600">Preview unavailable</p>
  if (!objectUrl) return <div className="h-10 bg-gray-100 animate-pulse rounded" />
  return <audio src={objectUrl} controls className="w-full h-10" />
}

export function AudioPromptEditor({ value, onChange, label = 'Audio prompt (optional — for Listening)' }: {
  value: string | null; onChange: (id: string | null) => void; label?: string
}) {
  const qc = useQueryClient()
  const [mode, setMode] = useState<'none' | 'generate' | 'upload'>('none')
  const [name, setName] = useState('')
  const [script, setScript] = useState('')
  const [voice, setVoice] = useState('alloy')
  const [accent, setAccent] = useState('British English')
  const [playLimit, setPlayLimit] = useState(1)
  const [busy, setBusy] = useState(false)
  const uploadRef = useRef<HTMLInputElement>(null)

  const { data: assets } = useQuery<any[]>({
    queryKey: ['audio-assets'],
    queryFn: () => api.get('/audio-assets').then(r => r.data.data),
  })

  const selected = assets?.find(a => a.id === value)

  const generate = async () => {
    if (!name.trim() || !script.trim()) {
      toast({ title: 'Name and script are required', variant: 'destructive' }); return
    }
    setBusy(true)
    try {
      const res = await api.post('/audio-assets/generate', { name, script, voice, accent, playLimit })
      await qc.invalidateQueries({ queryKey: ['audio-assets'] })
      onChange(res.data.data.id)
      setMode('none'); setName(''); setScript('')
      toast({ title: 'Audio generated' })
    } catch (err) {
      toast({ title: 'Generation failed', description: getErrorMessage(err), variant: 'destructive' })
    } finally { setBusy(false) }
  }

  const upload = async (e: any) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('name', name.trim() || file.name)
      fd.append('playLimit', String(playLimit))
      fd.append('file', file)
      const res = await api.post('/audio-assets/upload', fd)
      await qc.invalidateQueries({ queryKey: ['audio-assets'] })
      onChange(res.data.data.id)
      setMode('none'); setName('')
      toast({ title: 'Audio uploaded' })
    } catch (err) {
      toast({ title: 'Upload failed', description: getErrorMessage(err), variant: 'destructive' })
    } finally { setBusy(false); if (uploadRef.current) uploadRef.current.value = '' }
  }

  return (
    <div className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
      <div className="flex items-center gap-2">
        <Volume2 className="h-4 w-4 text-indigo-600" />
        <Label className="text-sm font-semibold">{label}</Label>
      </div>

      <div className="flex items-center gap-2">
        <select
          className="flex-1 rounded-md border border-input px-3 py-2 text-sm bg-background"
          value={value ?? ''}
          onChange={e => onChange(e.target.value || null)}
        >
          <option value="">No audio</option>
          {assets?.map(a => (
            <option key={a.id} value={a.id}>
              {a.name}{a.accent ? ` (${a.accent})` : ''}{a.playLimit ? ` · ${a.playLimit} play(s)` : ' · unlimited'}
            </option>
          ))}
        </select>
        <Button type="button" variant="outline" size="sm" onClick={() => setMode(mode === 'generate' ? 'none' : 'generate')}>
          <Sparkles className="h-4 w-4 mr-1" /> Generate
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setMode(mode === 'upload' ? 'none' : 'upload')}>
          <Upload className="h-4 w-4 mr-1" /> Upload
        </Button>
      </div>

      {selected && (
        <div className="pt-1">
          <SecureAudioPreview assetId={selected.id} />
        </div>
      )}

      {mode === 'generate' && (
        <div className="space-y-2 border-t border-indigo-200 pt-2">
          <Input placeholder="Asset name (e.g. Conversation 1 — UK)" value={name} onChange={e => setName(e.target.value)} />
          <div>
            <textarea
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
              rows={4}
              maxLength={MAX_SCRIPT_CHARS}
              placeholder="Type the script the narrator will read aloud…"
              value={script}
              onChange={e => setScript(e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground text-right">{script.length} / {MAX_SCRIPT_CHARS}</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-[11px]">Accent</Label>
              <select className="w-full rounded-md border border-input px-2 py-1.5 text-sm bg-background" value={accent} onChange={e => setAccent(e.target.value)}>
                {TTS_ACCENTS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-[11px]">Voice</Label>
              <select className="w-full rounded-md border border-input px-2 py-1.5 text-sm bg-background" value={voice} onChange={e => setVoice(e.target.value)}>
                {TTS_VOICES.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-[11px]">Play limit (0=∞)</Label>
              <Input type="number" min="0" value={playLimit} onChange={e => setPlayLimit(Math.max(0, parseInt(e.target.value) || 0))} className="h-[34px]" />
            </div>
          </div>
          <Button type="button" size="sm" onClick={generate} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
            Generate audio
          </Button>
        </div>
      )}

      {mode === 'upload' && (
        <div className="space-y-2 border-t border-indigo-200 pt-2">
          <Input placeholder="Asset name (optional — defaults to filename)" value={name} onChange={e => setName(e.target.value)} />
          <div className="grid grid-cols-2 gap-2 items-end">
            <div>
              <Label className="text-[11px]">Play limit (0=∞)</Label>
              <Input type="number" min="0" value={playLimit} onChange={e => setPlayLimit(Math.max(0, parseInt(e.target.value) || 0))} className="h-[34px]" />
            </div>
            <input ref={uploadRef} type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/webm" onChange={upload} disabled={busy} className="text-sm" />
          </div>
          {busy && <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Uploading…</p>}
        </div>
      )}
    </div>
  )
}
