import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Brain, Loader2 } from 'lucide-react'
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

export function LoginPage() {
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const login = useAuthStore(s => s.login)

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-white p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-center gap-2">
          <div className="bg-primary rounded-lg p-2">
            <Brain className="h-6 w-6 text-white" />
          </div>
          <span className="text-2xl font-bold text-gray-900">AssessIQ</span>
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
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Sign in
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              New to AssessIQ?{' '}
              <Link to="/register" className="text-primary hover:underline font-medium">Create an account</Link>
            </p>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground">
          Demo: workspace <strong>demo-company</strong> · admin@demo.com · Password123!
        </p>
      </div>
    </div>
  )
}
