import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { Toaster } from '@/components/ui/toaster'

// Auth pages
import { LoginPage } from '@/pages/auth/LoginPage'
import { RegisterPage } from '@/pages/auth/RegisterPage'
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage'

// Admin pages
import { AdminLayout } from '@/components/layout/AdminLayout'
import { TeamPage } from '@/pages/admin/TeamPage'
import { LiveMonitorPage } from '@/pages/admin/LiveMonitorPage'
import { DashboardPage } from '@/pages/admin/DashboardPage'
import { TestsPage } from '@/pages/admin/TestsPage'
import { TestBuilderPage } from '@/pages/admin/TestBuilderPage'
import { QuestionBankPage } from '@/pages/admin/QuestionBankPage'
import { CandidatesPage } from '@/pages/admin/CandidatesPage'
import { ResultsPage } from '@/pages/admin/ResultsPage'
import { ResultDetailPage } from '@/pages/admin/ResultDetailPage'
import { SettingsPage } from '@/pages/admin/SettingsPage'
import { AnalyticsPage } from '@/pages/admin/AnalyticsPage'

// Candidate pages
import { InviteLandingPage } from '@/pages/candidate/InviteLandingPage'
import { TestPage } from '@/pages/candidate/TestPage'
import { SubmittedPage } from '@/pages/candidate/SubmittedPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <>
      <Routes>
        {/* Auth */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Admin — protected */}
        <Route path="/admin" element={<RequireAuth><AdminLayout /></RequireAuth>}>
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="tests" element={<TestsPage />} />
          <Route path="tests/new" element={<TestBuilderPage />} />
          <Route path="tests/:testId" element={<TestBuilderPage />} />
          <Route path="questions" element={<QuestionBankPage />} />
          <Route path="candidates" element={<CandidatesPage />} />
          <Route path="results" element={<ResultsPage />} />
          <Route path="results/:sessionId" element={<ResultDetailPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="team" element={<TeamPage />} />
          <Route path="monitor" element={<LiveMonitorPage />} />
        </Route>

        {/* Candidate-facing — public */}
        <Route path="/take/:token" element={<InviteLandingPage />} />
        <Route path="/take/:token/test" element={<TestPage />} />
        <Route path="/take/:token/done" element={<SubmittedPage />} />

        {/* Root redirect */}
        <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
      </Routes>
      <Toaster />
    </>
  )
}
