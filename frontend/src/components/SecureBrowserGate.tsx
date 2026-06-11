import { ShieldCheck, Monitor, Download, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const DOWNLOAD_BASE = `${import.meta.env.VITE_API_URL ?? ''}/api/downloads/secure-browser`
// GitHub Releases has trusted SmartScreen reputation — prefer it for Windows
const GITHUB_WINDOWS_URL = 'https://github.com/sruthi-ai/assessiq-secure-browser/releases/latest/download/AssessIQ-Secure-Browser-Setup.exe'

export function SecureBrowserGate({ testTitle, tenantName }: { testTitle?: string; tenantName?: string }) {
  const platform = getPlatform()

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-lg w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center">
              <ShieldCheck className="w-8 h-8 text-indigo-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Secure Browser Required</h1>
          {testTitle && <p className="text-gray-600">To take <strong>{testTitle}</strong>, you must use the AssessIQ Secure Browser.</p>}
          {!testTitle && <p className="text-gray-600">This assessment requires the AssessIQ Secure Browser.</p>}
          {tenantName && <p className="text-sm text-gray-500">{tenantName}</p>}
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <p className="text-sm text-gray-700 font-medium">Why is this required?</p>
            <ul className="space-y-2 text-sm text-gray-600">
              {[
                { icon: Monitor, text: 'Blocks other browser tabs and windows' },
                { icon: ShieldCheck, text: 'Prevents screen recording and screenshots' },
                { icon: AlertCircle, text: 'Detects remote desktop and screen-sharing software' },
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
          <p className="text-sm font-medium text-gray-700">Step 1 — Download and install:</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <a href={GITHUB_WINDOWS_URL} className="flex-1" target="_blank" rel="noreferrer">
              <Button variant="outline" className="w-full gap-2">
                <Download className="w-4 h-4" />
                Download for Windows (.exe)
              </Button>
            </a>
            <a href={`${DOWNLOAD_BASE}/mac`} className="flex-1" download>
              <Button variant="outline" className="w-full gap-2">
                <Download className="w-4 h-4" />
                Download for macOS (.dmg)
              </Button>
            </a>
          </div>
          {platform && (
            <p className="text-xs text-center text-indigo-600">Detected platform: {platform}</p>
          )}

          {/* Windows SmartScreen bypass instructions */}
          {platform === 'Windows' && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1">
              <p className="text-xs font-semibold text-amber-800 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                Windows security warning — this is expected
              </p>
              <p className="text-xs text-amber-700">
                Windows may warn "this app isn't commonly downloaded." This is normal for new software.
                To proceed: in the download bar click <strong>Keep</strong> → <strong>Keep anyway</strong>,
                then run the installer and click <strong>More info → Run anyway</strong> if prompted.
              </p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">Step 2 — Open your test:</p>
          <p className="text-sm text-gray-600">
            After installing, open the AssessIQ Secure Browser and paste your test link, or click the button below if the app is already installed:
          </p>
          <a href={getDeepLink()} className="block">
            <Button className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700">
              <ShieldCheck className="w-4 h-4" />
              Open in Secure Browser
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

function getDeepLink() {
  const token = window.location.pathname.split('/take/')[1]?.split('/')[0] ?? ''
  return token ? `assessiq://test/${token}` : 'assessiq://'
}

function getPlatform() {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('win')) return 'Windows'
  if (ua.includes('mac')) return 'macOS'
  if (ua.includes('linux')) return 'Linux'
  return null
}
