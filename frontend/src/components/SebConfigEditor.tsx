import { useRef, useState } from 'react'
import { ShieldCheck, Upload, Loader2, ExternalLink, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { api, getErrorMessage } from '@/lib/api'
import { toast } from '@/hooks/use-toast'

interface SebInitial {
  sebRequired?: boolean
  sebConfigKeys?: string[]
  sebBrowserExamKeys?: string[]
  sebConfigFileUrl?: string | null
}

const linesToArr = (s: string) => s.split(/[\n,]/).map(x => x.trim()).filter(Boolean)

/**
 * Admin control for Safe Exam Browser lockdown on a test. Saves the SEB Config
 * Key(s) / Browser Exam Key(s) (which the backend verifies on every exam
 * request) and uploads the .seb config candidates open to launch SEB.
 */
export function SebConfigEditor({ testId, initial }: { testId: string; initial: SebInitial }) {
  const [enabled, setEnabled] = useState(!!initial.sebRequired)
  const [configKeys, setConfigKeys] = useState((initial.sebConfigKeys ?? []).join('\n'))
  const [bek, setBek] = useState((initial.sebBrowserExamKeys ?? []).join('\n'))
  const [savedFile, setSavedFile] = useState(initial.sebConfigFileUrl ?? null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const save = async (nextEnabled = enabled) => {
    setSaving(true)
    try {
      await api.patch(`/tests/${testId}`, {
        sebRequired: nextEnabled,
        sebConfigKeys: linesToArr(configKeys),
        sebBrowserExamKeys: linesToArr(bek),
      })
      toast({ title: 'Safe Exam Browser settings saved' })
    } catch (err) {
      toast({ title: 'Save failed', description: getErrorMessage(err), variant: 'destructive' })
    } finally { setSaving(false) }
  }

  const upload = async (e: any) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.post(`/tests/${testId}/seb-config`, fd)
      setSavedFile(res.data.data.sebConfigFileUrl)
      toast({ title: '.seb config uploaded' })
    } catch (err) {
      toast({ title: 'Upload failed', description: getErrorMessage(err), variant: 'destructive' })
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const toggle = (on: boolean) => { setEnabled(on); save(on) }

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 space-y-3">
      <label className="flex items-center gap-3 cursor-pointer">
        <input type="checkbox" className="rounded" checked={enabled} onChange={e => toggle(e.target.checked)} />
        <span className="text-sm font-medium flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4 text-indigo-600" />
          Require Safe Exam Browser (recommended — real OS-level lockdown, server-verified)
        </span>
      </label>

      {enabled && (
        <div className="ml-6 space-y-3">
          <div className="rounded-md border border-indigo-200 bg-white p-2.5 text-xs text-gray-600 space-y-1">
            <p className="font-semibold text-gray-700">How to set this up (once):</p>
            <ol className="list-decimal ml-4 space-y-0.5">
              <li>Install the <a className="text-indigo-600 underline inline-flex items-center gap-0.5" href="https://safeexambrowser.org/download_en.html" target="_blank" rel="noreferrer">SEB Config Tool <ExternalLink className="h-3 w-3" /></a> (Windows/macOS).</li>
              <li>Create a config with <strong>Start URL</strong> = your exam link, and enable <strong>“Use Browser & Config Keys (send in HTTP header)”</strong>.</li>
              <li>Copy its <strong>Config Key</strong> (and optionally Browser Exam Key) below, and upload the saved <strong>.seb</strong> file so candidates can open it.</li>
            </ol>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Config Key(s) — one per line</Label>
            <textarea
              className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-mono resize-y"
              rows={2}
              placeholder="e.g. 9f2a…  (SHA-256 hex from the SEB Config Tool)"
              value={configKeys}
              onChange={e => setConfigKeys(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Browser Exam Key(s) — optional, one per line</Label>
            <textarea
              className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-mono resize-y"
              rows={2}
              placeholder="Optional — ties the exam to a specific SEB version"
              value={bek}
              onChange={e => setBek(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button type="button" size="sm" onClick={() => save()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Save keys
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
              Upload .seb file
            </Button>
            <input ref={fileRef} type="file" accept=".seb" onChange={upload} className="hidden" />
            {savedFile && (
              <span className="text-xs text-green-700 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> .seb uploaded
              </span>
            )}
          </div>
          <p className="text-[11px] text-amber-700">
            Without a Config Key, the server can only check that SEB is present (weaker). Paste the Config Key for full verification.
          </p>
        </div>
      )}
    </div>
  )
}
