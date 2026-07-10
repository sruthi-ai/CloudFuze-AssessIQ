import { ShieldCheck, Monitor, Download, AlertCircle, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const SEB_DOWNLOAD_URL = 'https://safeexambrowser.org/download_en.html'
const CONFIG_BASE = `${import.meta.env.VITE_API_URL ?? ''}/api/downloads/seb`

/**
 * Candidate-facing gate shown when a test requires Safe Exam Browser and the
 * candidate is not currently inside it. The real enforcement is server-side
 * (the backend verifies SEB's Config/Request hash on every exam request); this
 * screen just guides the candidate to install SEB and open the exam config.
 */
export function SebGate({ testTitle, tenantName, token }: { testTitle?: string; tenantName?: string; token: string }) {
  const platform = getPlatform()
  const configUrl = `${CONFIG_BASE}/${encodeURIComponent(token)}`

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-lg w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center">
              <ShieldCheck className="w-8 h-8 text-indigo-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Safe Exam Browser Required</h1>
          {testTitle
            ? <p className="text-gray-600">To take <strong>{testTitle}</strong>, you must use Safe Exam Browser (SEB).</p>
            : <p className="text-gray-600">This assessment must be taken in Safe Exam Browser (SEB).</p>}
          {tenantName && <p className="text-sm text-gray-500">{tenantName}</p>}
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <p className="text-sm text-gray-700 font-medium">What SEB does</p>
            <ul className="space-y-2 text-sm text-gray-600">
              {[
                { icon: Monitor, text: 'Locks your screen to the exam — blocks other apps, tabs and windows' },
                { icon: ShieldCheck, text: 'Prevents screen recording, screenshots and shortcuts' },
                { icon: AlertCircle, text: 'The exam server verifies you are genuinely in SEB — it cannot be faked' },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-indigo-500 shrink-0" />
                  {text}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700">Step 1 — Install Safe Exam Browser (free):</p>
          <a href={SEB_DOWNLOAD_URL} target="_blank" rel="noreferrer" className="block">
            <Button variant="outline" className="w-full gap-2">
              <Download className="w-4 h-4" />
              Download Safe Exam Browser
              <ExternalLink className="w-3.5 h-3.5 opacity-60" />
            </Button>
          </a>
          {platform && <p className="text-xs text-center text-indigo-600">Detected platform: {platform}</p>}
          <p className="text-xs text-gray-500 text-center">Available for Windows and macOS from safeexambrowser.org.</p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">Step 2 — Open your exam:</p>
          <p className="text-sm text-gray-600">
            After installing SEB, click below to download this exam's configuration. Opening the downloaded
            <strong> exam.seb</strong> file launches Safe Exam Browser, where you'll enter the
            <strong> unique PIN</strong> from your invitation email to start your test.
          </p>
          <a href={configUrl} className="block" download>
            <Button className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700">
              <ShieldCheck className="w-4 h-4" />
              Open exam in Safe Exam Browser
            </Button>
          </a>
        </div>

        <p className="text-xs text-center text-gray-400">
          Having trouble? Contact your assessment administrator for support.
        </p>
      </div>
    </div>
  )
}

function getPlatform() {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('win')) return 'Windows'
  if (ua.includes('mac')) return 'macOS'
  if (ua.includes('linux')) return 'Linux'
  return null
}
