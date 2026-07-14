import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Brain, Loader2, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuthStore } from '@/stores/auth'
import { api, getErrorMessage } from '@/lib/api'
import { toast } from '@/hooks/use-toast'

const schema = z.object({
  tenantSlug: z.string().min(1, 'Company workspace required'),
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password required'),
})
type FormValues = z.infer<typeof schema>

const API_BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api'

export function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [ssoSlug, setSsoSlug] = useState('')
  const [showSso, setShowSso] = useState(false)
  const navigate = useNavigate()
  const login = useAuthStore(s => s.login)

  const { register, handleSubmit, getValues, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (values: FormValues) => {
    setLoading(true)
    try {
      const { data } = await api.post('/auth/login', values)
      login(data.data)
      navigate('/admin/dashboard')
    } catch (err) {
      toast({ title: 'Login failed', description: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const handleSsoLogin = () => {
    const slug = ssoSlug.trim() || getValues('tenantSlug').trim()
    if (!slug) {
      toast({ title: 'Enter your company workspace first', variant: 'destructive' })
      return
    }
    window.location.href = `${API_BASE}/sso/login?tenant=${encodeURIComponent(slug)}`
  }

  const handleMicrosoftLogin = () => {
    const slug = ssoSlug.trim() || getValues('tenantSlug').trim()
    if (!slug) {
      toast({ title: 'Enter your company workspace first', variant: 'destructive' })
      return
    }
    window.location.href = `${API_BASE}/sso/microsoft/login?tenant=${encodeURIComponent(slug)}`
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-white p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-center">
          <img src="/neutara-logo.png" alt="Neutara Technologies" className="h-16 object-contain" />
        </div>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">Sign in</CardTitle>
            <CardDescription>Enter your workspace and credentials to continue</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tenantSlug">Company workspace</Label>
                <Input
                  id="tenantSlug"
                  placeholder="your-company"
                  {...register('tenantSlug')}
                />
                {errors.tenantSlug && <p className="text-xs text-destructive">{errors.tenantSlug.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="admin@company.com" {...register('email')} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" {...register('password')} />
                {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
              </div>
              <div className="flex justify-end">
                <Link to="/forgot-password" className="text-xs text-muted-foreground hover:text-primary">Forgot password?</Link>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Sign in
              </Button>
            </form>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs text-muted-foreground">
                <span className="bg-white px-2">or</span>
              </div>
            </div>

            {!showSso ? (
              <div className="space-y-2">
                <Button variant="outline" className="w-full" onClick={() => setShowSso(true)}>
                  <KeyRound className="h-4 w-4 mr-2" />
                  Sign in with SSO / Microsoft
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Company workspace</Label>
                  <Input
                    placeholder="your-company"
                    value={ssoSlug}
                    onChange={e => setSsoSlug(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSsoLogin()}
                  />
                  <p className="text-xs text-muted-foreground">Your workspace slug — leave blank to use the one above</p>
                </div>
                {/* Microsoft OIDC */}
                <Button
                  variant="outline"
                  className="w-full border-blue-200 hover:bg-blue-50 text-gray-700"
                  onClick={handleMicrosoftLogin}
                >
                  <svg width="16" height="16" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg" className="mr-2">
                    <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                    <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                    <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                    <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
                  </svg>
                  Sign in with Microsoft
                </Button>
                {/* SAML */}
                <Button variant="outline" className="w-full" onClick={handleSsoLogin}>
                  <KeyRound className="h-4 w-4 mr-2" />
                  Continue with SAML SSO
                </Button>
              </div>
            )}

            <p className="mt-4 text-center text-sm text-muted-foreground">
              New to NeutaraAssessments?{' '}
              <Link to="/register" className="text-primary hover:underline font-medium">Create an account</Link>
            </p>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
