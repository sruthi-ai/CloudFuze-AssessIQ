import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No error-tracking service is wired in yet — this is the one place to add
    // Sentry.captureException(error) (or similar) once a DSN is configured.
    console.error('[ErrorBoundary] Unhandled render error:', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const isExam = window.location.pathname.startsWith('/take/')

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto" />
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            {isExam
              ? 'An unexpected error occurred. Your answers are saved as you navigate between questions — reloading should let you continue where you left off.'
              : 'An unexpected error occurred while rendering this page.'}
          </p>
          <Button onClick={() => window.location.reload()}>Reload page</Button>
        </div>
      </div>
    )
  }
}
