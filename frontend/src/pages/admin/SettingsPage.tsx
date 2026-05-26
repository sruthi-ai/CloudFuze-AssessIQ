import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  Settings, Building2, Mail, Palette, Shield, Loader2,
  Eye, EyeOff, CheckCircle2, AlertCircle, Send, Webhook, FileText, KeyRound,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api, getErrorMessage } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

type Tab = 'company' | 'email' | 'appearance' | 'integrations' | 'templates' | 'sso'

interface TenantSettings {
  name: string
  slug: string
  logoUrl: string | null
  primaryColor: string
  plan: string
  createdAt: string
  emailProvider: 'resend' | 'smtp' | 'graph' | 'none'
  resendApiKeySet: boolean
  smtpHost: string | null
  smtpPort: number | null
  smtpUser: string | null
  smtpFrom: string | null
  smtpSecure: boolean
  smtpPassSet: boolean
  defaultExpiryDays: number
  completionWebhookUrl: string | null
  emailSubject: string | null
  emailHeaderText: string | null
  emailFooterText: string | null
  emailBrandColor: string | null
  emailSignature: string | null
  ssoEnabled: boolean
  samlEntryPoint: string | null
  samlIssuer: string | null
  samlIdpCertSet: boolean
  samlEmailAttr: string | null
  samlFirstNameAttr: string | null
  samlLastNameAttr: string | null
  samlAutoProvision: boolean
  samlDefaultRole: string
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
    emailProvider: 'none' as 'resend' | 'smtp' | 'graph' | 'none',
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

  const [webhookUrl, setWebhookUrl] = useState(settings?.completionWebhookUrl ?? '')
  const [webhookDirty, setWebhookDirty] = useState(false)

  const saveWebhook = () => {
    saveMutation.mutate({ completionWebhookUrl: webhookUrl.trim() || null })
    setWebhookDirty(false)
  }

  const [templateForm, setTemplateForm] = useState({
    emailSubject: '',
    emailHeaderText: '',
    emailFooterText: '',
    emailBrandColor: '',
    emailSignature: '',
  })
  const [templateDirty, setTemplateDirty] = useState(false)

  if (settings && !templateDirty && templateForm.emailSubject === '' && settings.emailSubject) {
    setTemplateForm({
      emailSubject: settings.emailSubject ?? '',
      emailHeaderText: settings.emailHeaderText ?? '',
      emailFooterText: settings.emailFooterText ?? '',
      emailBrandColor: settings.emailBrandColor ?? '',
      emailSignature: settings.emailSignature ?? '',
    })
  }

  const [ssoForm, setSsoForm] = useState({
    ssoEnabled: false,
    samlEntryPoint: '',
    samlIssuer: '',
    samlIdpCert: '',
    samlEmailAttr: '',
    samlFirstNameAttr: '',
    samlLastNameAttr: '',
    samlAutoProvision: false,
    samlDefaultRole: 'VIEWER',
  })
  const [ssoDirty, setSsoDirty] = useState(false)

  if (settings && !ssoDirty && !ssoForm.samlEntryPoint && settings.samlEntryPoint) {
    setSsoForm({
      ssoEnabled: settings.ssoEnabled,
      samlEntryPoint: settings.samlEntryPoint ?? '',
      samlIssuer: settings.samlIssuer ?? '',
      samlIdpCert: '',
      samlEmailAttr: settings.samlEmailAttr ?? '',
      samlFirstNameAttr: settings.samlFirstNameAttr ?? '',
      samlLastNameAttr: settings.samlLastNameAttr ?? '',
      samlAutoProvision: settings.samlAutoProvision,
      samlDefaultRole: settings.samlDefaultRole ?? 'VIEWER',
    })
  }

  const saveSso = () => {
    const payload: Record<string, unknown> = {
      ssoEnabled: ssoForm.ssoEnabled,
      samlEntryPoint: ssoForm.samlEntryPoint.trim() || null,
      samlIssuer: ssoForm.samlIssuer.trim() || null,
      samlEmailAttr: ssoForm.samlEmailAttr.trim() || null,
      samlFirstNameAttr: ssoForm.samlFirstNameAttr.trim() || null,
      samlLastNameAttr: ssoForm.samlLastNameAttr.trim() || null,
      samlAutoProvision: ssoForm.samlAutoProvision,
      samlDefaultRole: ssoForm.samlDefaultRole,
    }
    if (ssoForm.samlIdpCert.trim()) payload.samlIdpCert = ssoForm.samlIdpCert.trim()
    saveMutation.mutate(payload)
    setSsoDirty(false)
  }

  const backendBase = import.meta.env.VITE_API_URL || ''

  const saveTemplate = () => {
    saveMutation.mutate({
      emailSubject: templateForm.emailSubject.trim() || null,
      emailHeaderText: templateForm.emailHeaderText.trim() || null,
      emailFooterText: templateForm.emailFooterText.trim() || null,
      emailBrandColor: templateForm.emailBrandColor.match(/^#[0-9a-fA-F]{6}$/) ? templateForm.emailBrandColor : null,
      emailSignature: templateForm.emailSignature.trim() || null,
    })
    setTemplateDirty(false)
  }

  const tabs = [
    { id: 'company' as Tab, label: 'Company Profile', icon: Building2 },
    { id: 'email' as Tab, label: 'Email / SMTP', icon: Mail },
    { id: 'templates' as Tab, label: 'Email Template', icon: FileText },
    { id: 'appearance' as Tab, label: 'Appearance', icon: Palette },
    { id: 'integrations' as Tab, label: 'Integrations', icon: Webhook },
    { id: 'sso' as Tab, label: 'SSO / SAML', icon: KeyRound },
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
              <CardDescription>Configure how NeutaraAssessments sends invitation emails to candidates</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Provider selector */}
              <div className="space-y-2">
                <Label>Email Provider</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { value: 'none', label: 'None (log only)', desc: 'Invites logged to console' },
                    { value: 'resend', label: 'Resend', desc: 'Recommended — modern API' },
                    { value: 'smtp', label: 'Custom SMTP', desc: 'Any SMTP server' },
                    { value: 'graph', label: 'Microsoft Graph', desc: 'Send via Microsoft 365' },
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
                      placeholder="NeutaraAssessments <noreply@yourdomain.com>"
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
                      placeholder="NeutaraAssessments <noreply@company.com>"
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

              {/* Microsoft Graph config */}
              {emailForm.emailProvider === 'graph' && (
                <div className="space-y-4 p-4 rounded-lg bg-gray-50 border">
                  <div className="space-y-2">
                    <Label>From Address (Microsoft 365 mailbox)</Label>
                    <Input
                      value={emailForm.smtpFrom}
                      onChange={e => { setEmailForm(f => ({ ...f, smtpFrom: e.target.value })); setEmailDirty(true) }}
                      placeholder="leo@fuzebot.io"
                    />
                    <p className="text-xs text-muted-foreground">
                      Must be a mailbox in your Microsoft 365 tenant. Azure credentials are configured via backend environment variables.
                    </p>
                  </div>
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

      {/* Integrations */}
      {tab === 'integrations' && (
        <Card>
          <CardHeader>
            <CardTitle>Completion Webhook</CardTitle>
            <CardDescription>
              POST a JSON payload to this URL every time a candidate submits an assessment.
              Use it to trigger ATS updates, Slack notifications, or Zapier workflows.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Webhook URL</Label>
              <Input
                value={webhookUrl}
                onChange={e => { setWebhookUrl(e.target.value); setWebhookDirty(true) }}
                placeholder="https://hooks.zapier.com/..."
              />
              <p className="text-xs text-muted-foreground">Leave blank to disable. Must be HTTPS.</p>
            </div>
            <div className="rounded-md bg-gray-50 border p-3 text-xs font-mono text-gray-600 space-y-1">
              <p className="font-semibold text-gray-700 font-sans mb-2">Payload sent on each completion:</p>
              <pre>{`{
  "event": "assessment.completed",
  "sessionId": "...",
  "candidate": { "id", "firstName", "lastName", "email" },
  "test": { "id", "title" },
  "score": { "percentage", "passed" },
  "submittedAt": "ISO 8601"
}`}</pre>
            </div>
            <Button onClick={saveWebhook} disabled={saveMutation.isPending || !webhookDirty}>
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Webhook
            </Button>
          </CardContent>
        </Card>
      )}

      {/* SSO / SAML */}
      {tab === 'sso' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Single Sign-On (SAML 2.0)</CardTitle>
              <CardDescription>
                Allow your team to sign in via your identity provider (Okta, Azure AD, Google Workspace, etc.).
                Configure your IdP with the ACS URL and SP Entity ID below, then paste the IdP settings here.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Enable toggle */}
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border hover:bg-gray-50 transition-colors">
                <input
                  type="checkbox"
                  checked={ssoForm.ssoEnabled}
                  onChange={e => { setSsoForm(f => ({ ...f, ssoEnabled: e.target.checked })); setSsoDirty(true) }}
                  className="h-4 w-4 rounded"
                />
                <div>
                  <p className="font-medium text-sm">Enable SSO for this workspace</p>
                  <p className="text-xs text-muted-foreground">When enabled, a "Sign in with SSO" button appears on the login page</p>
                </div>
              </label>

              {/* SP info (read-only) */}
              <div className="p-4 rounded-lg bg-blue-50 border border-blue-100 space-y-3">
                <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide">Your Service Provider (SP) details — paste these into your IdP</p>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-muted-foreground">ACS URL (Assertion Consumer Service)</p>
                    <code className="text-xs bg-white px-2 py-1 rounded border block mt-0.5 break-all">
                      {backendBase}/api/sso/callback
                    </code>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">SP Entity ID (Issuer)</p>
                    <code className="text-xs bg-white px-2 py-1 rounded border block mt-0.5 break-all">
                      {ssoForm.samlIssuer || `${backendBase}/api/sso/${settings?.slug}`}
                    </code>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">SP Metadata URL</p>
                    <code className="text-xs bg-white px-2 py-1 rounded border block mt-0.5 break-all">
                      {backendBase}/api/sso/metadata?tenant={settings?.slug}
                    </code>
                  </div>
                </div>
              </div>

              {/* IdP settings */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>IdP SSO URL *</Label>
                  <Input
                    value={ssoForm.samlEntryPoint}
                    onChange={e => { setSsoForm(f => ({ ...f, samlEntryPoint: e.target.value })); setSsoDirty(true) }}
                    placeholder="https://your-idp.com/sso/saml"
                  />
                  <p className="text-xs text-muted-foreground">The SAML 2.0 SSO URL from your identity provider</p>
                </div>

                <div className="space-y-2">
                  <Label>SP Entity ID (Issuer) override</Label>
                  <Input
                    value={ssoForm.samlIssuer}
                    onChange={e => { setSsoForm(f => ({ ...f, samlIssuer: e.target.value })); setSsoDirty(true) }}
                    placeholder={`${backendBase}/api/sso/${settings?.slug}`}
                  />
                  <p className="text-xs text-muted-foreground">Leave blank to use the default above</p>
                </div>

                <div className="space-y-2">
                  <Label>IdP Certificate (X.509 PEM)</Label>
                  <textarea
                    className="w-full border rounded-md px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary resize-none h-28"
                    value={ssoForm.samlIdpCert}
                    onChange={e => { setSsoForm(f => ({ ...f, samlIdpCert: e.target.value })); setSsoDirty(true) }}
                    placeholder="-----BEGIN CERTIFICATE-----&#10;MIIBIjANBgkqhkiG9w0BAQ...&#10;-----END CERTIFICATE-----"
                  />
                  {settings?.samlIdpCertSet && !ssoForm.samlIdpCert && (
                    <p className="text-xs flex items-center gap-1 text-green-600">
                      <CheckCircle2 className="h-3 w-3" /> Certificate is set. Paste a new one to replace it.
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">Download from your IdP and paste the full PEM certificate</p>
                </div>
              </div>

              {/* Attribute mapping */}
              <div className="space-y-3">
                <p className="text-sm font-medium">Attribute mapping</p>
                <p className="text-xs text-muted-foreground">Map SAML assertion attribute names to user fields. Common values: <code className="bg-gray-100 px-1 rounded">email</code>, <code className="bg-gray-100 px-1 rounded">mail</code>, <code className="bg-gray-100 px-1 rounded">http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress</code></p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Email attribute</Label>
                    <Input
                      value={ssoForm.samlEmailAttr}
                      onChange={e => { setSsoForm(f => ({ ...f, samlEmailAttr: e.target.value })); setSsoDirty(true) }}
                      placeholder="email"
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">First name attribute</Label>
                    <Input
                      value={ssoForm.samlFirstNameAttr}
                      onChange={e => { setSsoForm(f => ({ ...f, samlFirstNameAttr: e.target.value })); setSsoDirty(true) }}
                      placeholder="firstName"
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Last name attribute</Label>
                    <Input
                      value={ssoForm.samlLastNameAttr}
                      onChange={e => { setSsoForm(f => ({ ...f, samlLastNameAttr: e.target.value })); setSsoDirty(true) }}
                      placeholder="lastName"
                      className="text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Auto-provision */}
              <div className="space-y-3 p-4 rounded-lg border">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ssoForm.samlAutoProvision}
                    onChange={e => { setSsoForm(f => ({ ...f, samlAutoProvision: e.target.checked })); setSsoDirty(true) }}
                    className="h-4 w-4 rounded"
                  />
                  <div>
                    <p className="font-medium text-sm">Auto-provision new users</p>
                    <p className="text-xs text-muted-foreground">Automatically create accounts for verified IdP users not yet in this workspace</p>
                  </div>
                </label>
                {ssoForm.samlAutoProvision && (
                  <div className="space-y-2 ml-7">
                    <Label className="text-xs">Default role for new users</Label>
                    <div className="flex gap-3">
                      {['VIEWER', 'RECRUITER'].map(role => (
                        <label key={role} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="samlDefaultRole"
                            value={role}
                            checked={ssoForm.samlDefaultRole === role}
                            onChange={() => { setSsoForm(f => ({ ...f, samlDefaultRole: role })); setSsoDirty(true) }}
                          />
                          <span className="text-sm">{role === 'VIEWER' ? 'Viewer (read-only)' : 'Recruiter'}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {!ssoForm.ssoEnabled && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">SSO is disabled. Save settings and enable the toggle above to activate it.</p>
                </div>
              )}

              <Button onClick={saveSso} disabled={saveMutation.isPending || !ssoDirty}>
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save SSO Settings
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Email Template */}
      {tab === 'templates' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Invite Email Template</CardTitle>
              <CardDescription>
                Customize the invitation email sent to candidates. Use <code className="bg-gray-100 px-1 rounded">{'{{candidateName}}'}</code>, <code className="bg-gray-100 px-1 rounded">{'{{testTitle}}'}</code>, <code className="bg-gray-100 px-1 rounded">{'{{companyName}}'}</code> as placeholders. Leave fields blank to use the default template.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Subject line</Label>
                <Input
                  value={templateForm.emailSubject}
                  onChange={e => { setTemplateForm(f => ({ ...f, emailSubject: e.target.value })); setTemplateDirty(true) }}
                  placeholder="You're invited: {{testTitle}} — {{companyName}}"
                />
              </div>
              <div className="space-y-2">
                <Label>Email body (above button)</Label>
                <textarea
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none h-28"
                  value={templateForm.emailHeaderText}
                  onChange={e => { setTemplateForm(f => ({ ...f, emailHeaderText: e.target.value })); setTemplateDirty(true) }}
                  placeholder={`Hi {{candidateName}},\n\n{{companyName}} has invited you to complete {{testTitle}}. Please click the button below to start.`}
                />
              </div>
              <div className="space-y-2">
                <Label>Footer text (below button)</Label>
                <Input
                  value={templateForm.emailFooterText}
                  onChange={e => { setTemplateForm(f => ({ ...f, emailFooterText: e.target.value })); setTemplateDirty(true) }}
                  placeholder="If you didn't expect this, you can ignore this email."
                />
              </div>
              <div className="space-y-2">
                <Label>Email signature</Label>
                <Input
                  value={templateForm.emailSignature}
                  onChange={e => { setTemplateForm(f => ({ ...f, emailSignature: e.target.value })); setTemplateDirty(true) }}
                  placeholder="The {{companyName}} Talent Team"
                />
              </div>
              <div className="space-y-2">
                <Label>Button / header color</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    className="h-9 w-16 rounded border cursor-pointer"
                    value={templateForm.emailBrandColor || settings?.primaryColor || '#6366f1'}
                    onChange={e => { setTemplateForm(f => ({ ...f, emailBrandColor: e.target.value })); setTemplateDirty(true) }}
                  />
                  <Input
                    className="w-32"
                    value={templateForm.emailBrandColor}
                    onChange={e => { setTemplateForm(f => ({ ...f, emailBrandColor: e.target.value })); setTemplateDirty(true) }}
                    placeholder="#6366f1"
                  />
                  <p className="text-xs text-muted-foreground">Defaults to your brand color if blank</p>
                </div>
              </div>
              <Button onClick={saveTemplate} disabled={saveMutation.isPending || !templateDirty}>
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save Template
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
