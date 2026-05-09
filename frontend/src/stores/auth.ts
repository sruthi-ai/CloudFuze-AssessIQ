import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '@/lib/api'

interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
}

interface Tenant {
  id: string
  name: string
  slug: string
  logoUrl?: string | null
  primaryColor?: string | null
}

interface AuthState {
  user: User | null
  tenant: Tenant | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  login: (data: { accessToken: string; refreshToken: string; user: User; tenant: Tenant }) => void
  logout: () => Promise<void>
  setUser: (user: User) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      tenant: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      login({ accessToken, refreshToken, user, tenant }) {
        localStorage.setItem('accessToken', accessToken)
        localStorage.setItem('refreshToken', refreshToken)
        set({ user, tenant, accessToken, refreshToken, isAuthenticated: true })
      },

      async logout() {
        try {
          await api.post('/auth/logout', { refreshToken: get().refreshToken })
        } catch {}
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        set({ user: null, tenant: null, accessToken: null, refreshToken: null, isAuthenticated: false })
      },

      setUser(user) {
        set({ user })
      },
    }),
    {
      name: 'assessiq-auth',
      partialize: state => ({ user: state.user, tenant: state.tenant, isAuthenticated: state.isAuthenticated }),
    }
  )
)
