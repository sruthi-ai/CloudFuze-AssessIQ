import { useLocation } from 'react-router-dom'
import { CheckCircle, Brain } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export function SubmittedPage() {
  const location = useLocation()
  const result = location.state?.result

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="bg-primary rounded-lg p-1.5"><Brain className="h-5 w-5 text-white" /></div>
          <span className="font-semibold text-gray-700">NeutaraAssessments</span>
        </div>

        <Card>
          <CardContent className="py-12 space-y-4">
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="h-9 w-9 text-green-600" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Assessment submitted!</h1>
            <p className="text-muted-foreground">
              Your responses have been recorded. The recruiter will review your submission and be in touch.
            </p>

            {result?.score && (
              <div className="pt-4 border-t space-y-3">
                <p className="text-sm font-medium text-gray-700">Your score</p>
                <p className="text-5xl font-bold text-primary">{Math.round(result.score.percentage)}%</p>
                <p className="text-sm text-muted-foreground">
                  {result.score.earnedPoints.toFixed(1)} / {result.score.totalPoints} points
                </p>
                {result.score.passed !== null && (
                  <Badge variant={result.score.passed ? 'success' : 'destructive'} className="text-sm px-4 py-1">
                    {result.score.passed ? 'Passed' : 'Did not pass'}
                  </Badge>
                )}
              </div>
            )}

            {!result?.score && (
              <p className="text-sm text-muted-foreground pt-2">
                Results will be shared by the recruiter once reviewed.
              </p>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">You may now close this window.</p>
      </div>
    </div>
  )
}
