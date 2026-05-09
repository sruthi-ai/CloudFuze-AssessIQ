import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  Settings, Building2, Mail, Palette, Shield, Loader2,
  Eye, EyeOff, CheckCircle2, AlertCircle, Send
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api, getErrorMessage } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

type Tab = 'company' | 'email' | 'appearance'

interface TenantSettings {
  name: string
  slug: string
  logoUrl: string | null
  primaryColor: string
  plan: string
  createdAt: string
  emailProvider: 'resend' | 'smtp' | 'none'
  resendApiKeySet: boolean
  smtpHost: string | null
  smtpPort: number | null
  smtpUser: string | null
  smtpFrom: string | null
  smtpSecure: boolean
  smtpPassSet: boolean
  defaultExpiryDays: number
}

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>('company')
  const [showResendKey, setShowResendKey] = useState(false)
  const [showSmtpPass, setShowSmtpPass] = useState(false)
  const [testEmailAddress, setTestEmailAddress] = useState('')

  const { data: settings, isLoading, refetch } = useQuery<TenantSettings>({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then(r => r.data.data),
  })

  // Company form
  const [companyForm, setCompanyForm] = useState({ name: '', logoUrl: '', primaryColor: '' })
  const [companyDirty, setCompanyDirty] = useState(false)

  // Email form
  const [emailForm, setEmailForm] = useState({
    emailProvider: 'none' as 'resend' | 'smtp' | 'none',
    resendApiKey: '',
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpPass: '',
    smtpFrom: '',
    smtpSecure: false,
    defaultExpiryDays: 7,
  })
  const [emailDirty, setEmailDirty] = useState(false)

  // Sync form when settings load
  const [initialized, setInitialized] = useState(false)
  if (settings && !initialized) {
    setCompanyForm({
      name: settings.name,
      logoUrl: settings.logoUrl ?? '',
      primaryColor: settings.primaryColor ?? '#6366f1',
    })
    setEmailForm(f => ({
      ...f,
      emailProvider: settings.emailProvider,
      smtpHost: settings.smtpHost ?? '',
      smtpPort: settings.smtpPort ?? 587,
      smtpUser: settings.smtpUser ?? '',
      smtpFrom: settings.smtpFrom ?? '',
      smtpSecure: settings.smtpSecure ?? false,
      defaultExpiryDays: settings.defaultExpiryDays ?? 7,
    }))
    setInitialized(true)
  }

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.patch('/settings', data),
    onSuccess: () => {
      toast({ title: 'Settings saved' })
      setCompanyDirty(false)
      setEmailDirty(false)
      refetch()
    },
    onError: err => toast({ title: 'Save failed', description: getErrorMessage(err), variant: 'destructive' }),
  })

  const testEmailMutation = useMutation({
    mutationFn: (email: string) => api.post('/settings/test-email', { email }),
    onSuccess: (res) => toast({ title: res.data.data.message }),
    onError: err => toast({ title: 'Test failed', description: getErrorMessage(err), variant: 'destructive' }),
  })

  const saveCompany = () => {
    saveMutation.mutate({
      name: companyForm.name,
      logoUrl: companyForm.logoUrl || null,
      primaryColor: companyForm.primaryColor,
    })
  }

  const saveEmail = () => {
    const payload: Record<string, unknown> = {
      emailProvider: emailForm.emailProvider,
      smtpHost: emailForm.smtpHost || null,
      smtpPort: emailForm.smtpPort,
      smtpUser: emailForm.smtpUser || null,
      smtpFrom: emailForm.smtpFrom || null,
      smtpSecure: emailForm.smtpSecure,
      defaultExpiryDays: emailForm.defaultExpiryDays,
    }
    if (emailForm.resendApiKey) payload.resendApiKey = emailForm.resendApiKey
    if (emailForm.smtpPass) payload.smtpPass = emailForm.smtpPass
    saveMutation.mutate(payload)
  }

  const tabs = [
    { id: 'company' as Tab, label: 'Company Profile', icon: Building2 },
    { id: 'email' as Tab, label: 'Email / SMTP', icon: Mail },
    { id: 'appearance' as Tab, label: 'Appearance', icon: Palette },
  ]

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-muted-foreground">Manage your workspace configuration</p>
        </div>
      </div>

      {/* Plan badge */}
      <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm">
        <Shield className="h-4 w-4 text-primary" />
        <span className="text-gray-700">Current plan: <strong className="text-primary capitalize">{settings?.plan?.toLowerCase()}</strong></span>
        <span className="ml-auto text-muted-foreground">Workspace: <code className="bg-gray-100 px-1 rounded">{settings?.slug}</code></span>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Company Profile */}
      {tab === 'company' && (
        <Card>
          <CardHeader>
            <CardTitle>Company Profile</CardTitle>
            <CardDescription>This information appears in invitation emails and the candidate test portal</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Company Name *</Label>
              <Input
                value={companyForm.name}
                onChange={e => { setCompanyForm(f => ({ ...f, name: e.target.value })); setCompanyDirty(true) }}
                placeholder="Acme Corp"
              />
            </div>
            <div className="space-y-2">
              <Label>Logo URL</Label>
              <Input
                value={companyForm.logoUrl}
                onChange={e => { setCompanyForm(f => ({ ...f, logoUrl: e.target.value })); setCompanyDirty(true) }}
                placeholder="https://your-company.com/logo.png"
              />
              <p className="text-xs text-muted-foreground">Publicly accessible URL to your company logo (PNG/SVG recommended)</p>
              {companyForm.logoUrl && (
                <img src={companyForm.logoUrl} alt="Logo preview" className="h-10 object-contain rounded border p-1 bg-gray-50" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
              )}
            </div>
            <div className="space-y-2">
              <Label>Primary Color</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={companyForm.primaryColor}
                  onChange={e => { setCompanyForm(f => ({ ...f, primaryColor: e.target.value })); setCompanyDirty(true) }}
                  className="h-9 w-16 rounded border cursor-pointer"
                />
                <Input
                  value={companyForm.primaryColor}
                  onChange={e => { setCompanyForm(f => ({ ...f, primaryColor: e.target.value })); setCompanyDirty(true) }}
                  placeholder="#6366f1"
                  className="w-32 font-mono"
                />
              </div>
            </div>
            <Button onClick={saveCompany} disabled={saveMutation.isPending || !companyDirty}>
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Profile
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Email Settings */}
      {tab === 'email' && (
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Email Provider</CardTitle>
              <CardDescription>Configure how AssessIQ sends invitation emails to candidates</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Provider selector */}
              <div className="space-y-2">
                <Label>Email Provider</Label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: 'none', label: 'None (log only)', desc: 'Invites logged to console' },
                    { value: 'resend', label: 'Resend', desc: 'Recommended — modern API' },
                    { value: 'smtp', label: 'Custom SMTP', desc: 'Any SMTP server' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => { setEmailForm(f => ({ ...f, emailProvider: opt.value as any })); setEmailDirty(true) }}
                      className={cn(
                        'p-3 rounded-lg border-2 text-left transition-colors',
                        emailForm.emailProvider === opt.value
                          ? 'border-primary bg-primary/5'
                          : 'border-gray-200 hover:border-gray-300'
                      )}
                    >
                      <p className="font-medium text-sm">{opt.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Resend config */}
              {emailForm.emailProvider === 'resend' && (
                <div className="space-y-4 p-4 rounded-lg bg-gray-50 border">
                  <div className="space-y-2">
                    <Label>Resend API Key</Label>
                    <div className="relative">
                      <Input
                        type={showResendKey ? 'text' : 'password'}
                        value={emailForm.resendApiKey}
                        onChange={e => { setEmailForm(f => ({ ...f, resendApiKey: e.target.value })); setEmailDirty(true) }}
                        placeholder={settings?.resendApiKeySet ? '••••••••••••••••••••• (set — leave blank to keep)' : 're_xxxxxxxxxxxxxxxx'}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowResendKey(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-gray-900"
                      >
                        {showResendKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {settings?.resendApiKeySet && (
                      <p className="text-xs flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="h-3 w-3" /> API key is set. Enter a new value to replace it.
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Get your API key from <a href="https://resend.com" target="_blank" rel="noreferrer" className="underline">resend.com</a>. Free tier allows 3,000 emails/month.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>From Address</Label>
                    <Input
                      value={emailForm.smtpFrom}
                      onChange={e => { setEmailForm(f => ({ ...f, smtpFrom: e.target.value })); setEmailDirty(true) }}
                      placeholder="AssessIQ <noreply@yourdomain.com>"
                    />
                    <p className="text-xs text-muted-foreground">Must be a verified sender domain in Resend</p>
                  </div>
                </div>
              )}

              {/* SMTP config */}
              {emailForm.emailProvider === 'smtp' && (
                <div className="space-y-4 p-4 rounded-lg bg-gray-50 border">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2 col-span-2 sm:col-span-1">
                      <Label>SMTP Host</Label>
                      <Input
                        value={emailForm.smtpHost}
                        onChange={e => { setEmailForm(f => ({ ...f, smtpHost: e.target.value })); setEmailDirty(true) }}
                        placeholder="smtp.gmail.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Port</Label>
                      <Input
                        type="number"
                        value={emailForm.smtpPort}
                        onChange={e => { setEmailForm(f => ({ ...f, smtpPort: parseInt(e.target.value) || 587 })); setEmailDirty(true) }}
                        placeholder="587"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Username</Label>
                      <Input
                        value={emailForm.smtpUser}
                        onChange={e => { setEmailForm(f => ({ ...f, smtpUser: e.target.value })); setEmailDirty(true) }}
                        placeholder="you@company.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Password</Label>
                      <div className="relative">
                        <Input
                          type={showSmtpPass ? 'text' : 'password'}
                          value={emailForm.smtpPass}
                          onChange={e => { setEmailForm(f => ({ ...f, smtpPass: e.target.value })); setEmailDirty(true) }}
                          placeholder={settings?.smtpPassSet ? '••••••••• (set)' : 'App password'}
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSmtpPass(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                        >
                          {showSmtpPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>From Address</Label>
                    <Input
                      value={emailForm.smtpFrom}
                      onChange={e => { setEmailForm(f => ({ ...f, smtpFrom: e.target.value })); setEmailDirty(true) }}
                      placeholder="AssessIQ <noreply@company.com>"
                    />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={emailForm.smtpSecure}
                      onChange={e => { setEmailForm(f => ({ ...f, smtpSecure: e.target.checked })); setEmailDirty(true) }}
                      className="rounded"
                    />
                    <span className="text-sm">Use TLS/SSL (port 465)</span>
                  </label>
                </div>
              )}

              {/* Invite defaults */}
              <div className="space-y-2">
                <Label>Default invite expiry (days)</Label>
                <Input
                  type="number"
                  min={1}
                  max={90}
                  value={emailForm.defaultExpiryDays}
                  onChange={e => { setEmailForm(f => ({ ...f, defaultExpiryDays: parseInt(e.target.value) || 7 })); setEmailDirty(true) }}
                  className="w-32"
                />
                <p className="text-xs text-muted-foreground">How many days before an invite link expires</p>
              </div>

              <Button onClick={saveEmail} disabled={saveMutation.isPending || !emailDirty}>
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save Email Settings
              </Button>
            </CardContent>
          </Card>

          {/* Test email card */}
          {emailForm.emailProvider !== 'none' && (
            <Card>
              <CardHeader>
                <CardTitle>Test Email Configuration</CardTitle>
                <CardDescription>Send a test email to verify your settings work</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-3">
                  <Input
                    type="email"
                    value={testEmailAddress}
                    onChange={e => setTestEmailAddress(e.target.value)}
                    placeholder="recipient@example.com"
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    onClick={() => testEmailMutation.mutate(testEmailAddress)}
                    disabled={testEmailMutation.isPending}
                  >
                    {testEmailMutation.isPending
                      ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      : <Send className="h-4 w-4 mr-2" />}
                    Send Test
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Leave blank to send to your account email</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Appearance */}
      {tab === 'appearance' && (
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Customize how your brand appears to candidates</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Brand Color</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={companyForm.primaryColor}
                  onChange={e => { setCompanyForm(f => ({ ...f, primaryColor: e.target.value })); setCompanyDirty(true) }}
                  className="h-10 w-20 rounded border cursor-pointer"
                />
                <Input
                  value={companyForm.primaryColor}
                  onChange={e => { setCompanyForm(f => ({ ...f, primaryColor: e.target.value })); setCompanyDirty(true) }}
                  placeholder="#6366f1"
                  className="w-36 font-mono"
                />
              </div>
              <p className="text-xs text-muted-foreground">Used as the accent color in the candidate-facing test portal</p>
            </div>

            <div className="space-y-2">
              <Label>Logo URL</Label>
              <Input
                value={companyForm.logoUrl}
                onChange={e => { setCompanyForm(f => ({ ...f, logoUrl: e.target.value })); setCompanyDirty(true) }}
                placeholder="https://your-company.com/logo.png"
              />
              {companyForm.logoUrl && (
                <div className="mt-2 p-3 rounded-lg border bg-gray-50 flex items-center gap-3">
                  <img src={companyForm.logoUrl} alt="Logo" className="h-8 object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  <span className="text-xs text-muted-foreground">Preview</span>
                </div>
              )}
            </div>

            {/* Preview card */}
            <div className="rounded-lg border-2 border-dashed border-gray-200 p-4">
              <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wide">Candidate portal preview</p>
              <div className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  {companyForm.logoUrl
                    ? <img src={companyForm.logoUrl} alt="" className="h-6 object-contain" />
                    : <div className="h-6 w-6 rounded" style={{ backgroundColor: companyForm.primaryColor }} />
                  }
                  <span className="font-semibold text-sm">{companyForm.name || 'Your Company'}</span>
                </div>
                <div className="h-2 rounded-full mb-2" style={{ backgroundColor: companyForm.primaryColor, width: '60%' }} />
                <div className="h-2 rounded-full bg-gray-100" style={{ width: '40%' }} />
                <button
                  className="mt-3 px-3 py-1.5 rounded text-white text-xs font-medium"
                  style={{ backgroundColor: companyForm.primaryColor }}
                >
                  Start Assessment
                </button>
              </div>
            </div>

            <Button onClick={saveCompany} disabled={saveMutation.isPending || !companyDirty}>
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Appearance
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
