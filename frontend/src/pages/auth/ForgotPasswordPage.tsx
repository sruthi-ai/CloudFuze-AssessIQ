import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Brain, ArrowLeft, Loader2, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api, getErrorMessage } from '@/lib/api'
import { toast } from '@/hooks/use-toast'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [tenantSlug, setTenantSlug] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !tenantSlug) {
      toast({ title: 'Required', description: 'Enter your email and company slug.', variant: 'destructive' })
      return
    }
    setLoading(true)
    try {
      await api.post('/auth/forgot-password', { email, tenantSlug })
      setSent(true)
    } catch (err) {
      toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-center gap-2">
          <div className="bg-primary rounded-lg p-2">
            <Brain className="h-6 w-6 text-white" />
          </div>
          <span className="text-xl font-bold text-gray-900">NeutaraAssessments</span>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle>Forgot password?</CardTitle>
            <CardDescription>
              {sent
                ? 'Check your email for the reset link.'
                : "Enter your work email and company slug and we'll send you a reset link."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="text-center space-y-4">
                <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                  <Mail className="h-6 w-6 text-green-600" />
                </div>
                <p className="text-sm text-muted-foreground">
                  If an account with that email exists, you'll receive a reset link shortly.
                </p>
                <Button asChild variant="outline" className="w-full">
                  <Link to="/login">Back to sign in</Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Work email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug">Company slug</Label>
                  <Input
                    id="slug"
                    placeholder="my-company"
                    value={tenantSlug}
                    onChange={e => setTenantSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    required
                  />
                  <p className="text-xs text-muted-foreground">The slug you use to log in (e.g. acme-corp)</p>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Send reset link
                </Button>
                <Button asChild variant="ghost" className="w-full">
                  <Link to="/login">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to sign in
                  </Link>
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
