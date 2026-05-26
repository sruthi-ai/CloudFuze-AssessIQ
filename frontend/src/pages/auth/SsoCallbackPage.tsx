import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Brain, Loader2, AlertCircle } from 'lucide-react'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/lib/api'

export function SsoCallbackPage() {
  const navigate = useNavigate()
  const login = useAuthStore(s => s.login)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const ssoError = params.get('error')
    const token = params.get('token')
    const refresh = params.get('refresh')

    if (ssoError) {
      const messages: Record<string, string> = {
        sso_missing_relay: 'SSO relay state missing — try again.',
        tenant_not_found: 'Workspace not found.',
        sso_not_configured: 'SSO is not configured for this workspace.',
        sso_invalid_response: 'Invalid SSO response from identity provider.',
        sso_no_email: 'Identity provider did not return an email address.',
        user_not_found: 'No account found for your identity. Contact your admin.',
        account_disabled: 'Your account is disabled.',
        sso_failed: 'SSO authentication failed. Try again or contact support.',
      }
      setError(messages[ssoError] ?? `SSO error: ${ssoError}`)
      return
    }

    if (!token || !refresh) {
      setError('Missing authentication tokens. Please try signing in again.')
      return
    }

    // Store tokens so the api interceptor picks them up
    localStorage.setItem('accessToken', token)
    localStorage.setItem('refreshToken', refresh)

    api.get('/auth/me')
      .then(res => {
        const userData = res.data.data
        login({
          accessToken: token,
          refreshToken: refresh,
          user: {
            id: userData.id,
            email: userData.email,
            firstName: userData.firstName,
            lastName: userData.lastName,
            role: userData.role,
          },
          tenant: {
            id: userData.tenant.id,
            name: userData.tenant.name,
            slug: userData.tenant.slug,
            logoUrl: userData.tenant.logoUrl ?? null,
            primaryColor: userData.tenant.primaryColor ?? null,
          },
        })
        // Replace history entry so pressing back doesn't loop
        navigate('/admin/dashboard', { replace: true })
      })
      .catch(() => {
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        setError('Failed to load your account. Please try again.')
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-white">
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="bg-primary rounded-lg p-2">
            <Brain className="h-6 w-6 text-white" />
          </div>
          <span className="text-2xl font-bold text-gray-900">NeutaraAssessments</span>
        </div>

        {error ? (
          <div className="max-w-sm mx-auto p-4 rounded-lg border border-red-200 bg-red-50 space-y-3">
            <div className="flex items-center gap-2 text-red-700">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <p className="text-sm font-medium">{error}</p>
            </div>
            <button
              onClick={() => navigate('/login')}
              className="text-sm text-primary underline"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
            <p className="text-gray-600 text-sm">Completing sign-in...</p>
          </>
        )}
      </div>
    </div>
  )
}
