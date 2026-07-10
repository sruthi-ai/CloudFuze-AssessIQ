import { useState } from 'react'
import { ShieldCheck, ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'

const PIN_RE = /^[A-Za-z0-9]{6,10}$/
const URL_RE = /https?:\/\/.+\/take\/([A-Za-z0-9]+)/

export function SecureBrowserStartPage() {
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleStart = async () => {
    const v = value.trim()
    if (!v) { setError('Please enter your invite link or PIN'); return }
    setError('')
    setLoading(true)

    try {
      // Case 1: full invite URL pasted
      const urlMatch = v.match(URL_RE)
      if (urlMatch) {
        window.location.href = `/take/${urlMatch[1]}`
        return
      }

      // Case 2: PIN entered
      const cleanPin = v.toUpperCase().replace(/[^A-Z0-9]/g, '')
      if (PIN_RE.test(cleanPin)) {
        const res = await api.get(`/sessions/by-pin/${cleanPin}`)
        window.location.href = `/take/${res.data.data.token}`
        return
      }

      setError('Enter a valid invite link (URL) or your 8-character PIN')
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Invalid PIN or link — please check and try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">

        {/* Logo / Brand */}
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg">
              <ShieldCheck className="w-10 h-10 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Enter your exam PIN</h1>
          <p className="text-gray-500 text-sm">Type the unique PIN from your invitation email to begin your assessment</p>
        </div>

        {/* Entry form */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Invite link or PIN
            </label>
            <Input
              autoFocus
              value={value}
              onChange={e => { setValue(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleStart()}
              placeholder="Paste your invite link or enter PIN (e.g. ABCD1234)"
              className="h-12 text-base"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          <Button
            onClick={handleStart}
            disabled={loading || !value.trim()}
            className="w-full h-12 text-base bg-indigo-600 hover:bg-indigo-700 gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
            {loading ? 'Loading...' : 'Start Assessment'}
          </Button>
        </div>

        {/* Help */}
        <div className="text-center space-y-1">
          <p className="text-xs text-gray-400">
            Your invite link and PIN were sent to your email by the assessment organiser.
          </p>
          <p className="text-xs text-gray-400">
            Having trouble? Contact your assessment administrator.
          </p>
        </div>
      </div>
    </div>
  )
}
