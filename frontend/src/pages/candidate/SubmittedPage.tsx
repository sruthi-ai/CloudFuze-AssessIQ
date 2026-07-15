import { useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { CheckCircle, FlaskConical } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { api } from '@/lib/api'

interface SkillBand { skill: string; band: number; pending: number }
interface ResultData {
  submitted: boolean
  message?: string
  testTitle?: string
  score?: { percentage: number; earnedPoints: number; totalPoints: number } | null
  skillBands?: { skills: SkillBand[]; overall: number | null }
}

export function SubmittedPage() {
  const location = useLocation()
  const { token } = useParams()
  const isPractice: boolean = location.state?.isPractice ?? false
  const sessionId: string | undefined = location.state?.sessionId
  const [result, setResult] = useState<ResultData | null>(null)

  // Prevent back-navigation to the test
  useEffect(() => {
    window.history.pushState(null, '', window.location.href)
    const block = () => window.history.pushState(null, '', window.location.href)
    window.addEventListener('popstate', block)
    return () => window.removeEventListener('popstate', block)
  }, [])

  // Fetch the candidate's result (only shows a score if the test has "show results" on)
  useEffect(() => {
    if (isPractice || !sessionId || !token) return
    api.get(`/sessions/${sessionId}/result?token=${encodeURIComponent(token)}`)
      .then(r => setResult(r.data.data))
      .catch(() => { /* results just stay hidden */ })
  }, [isPractice, sessionId, token])

  const bands = result?.skillBands
  const showBands = bands && bands.skills.length > 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="flex items-center justify-center mb-4">
          <img src="/neutara-logo.png" alt="Neutara Technologies" className="h-16 w-auto object-contain" />
        </div>

        {isPractice && (
          <div className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-50 border border-indigo-200 text-sm text-indigo-700">
            <FlaskConical className="h-4 w-4" />
            Practice session — results are not saved or shared
          </div>
        )}

        <Card>
          <CardContent className="py-10 space-y-4">
            <div className="flex justify-center">
              <div className={`h-16 w-16 rounded-full flex items-center justify-center ${isPractice ? 'bg-indigo-100' : 'bg-green-100'}`}>
                <CheckCircle className={`h-9 w-9 ${isPractice ? 'text-indigo-600' : 'text-green-600'}`} />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isPractice ? 'Practice complete!' : 'Assessment submitted!'}
            </h1>

            {/* Band report (shown only if the test releases results to candidates) */}
            {showBands && (
              <div className="pt-2 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {bands!.skills.map(s => (
                    <div key={s.skill} className="rounded-lg border p-2">
                      <p className="text-xl font-bold text-primary">{s.band.toFixed(1)}</p>
                      <p className="text-[11px] text-muted-foreground capitalize">{s.skill.toLowerCase()}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border-2 border-primary bg-primary/5 p-3">
                  <p className="text-3xl font-bold text-primary">
                    {bands!.overall != null ? bands!.overall.toFixed(1) : '—'}
                  </p>
                  <p className="text-xs font-semibold text-primary">Overall band</p>
                </div>
                {bands!.skills.some(s => s.pending > 0) && (
                  <p className="text-[11px] text-amber-600">Some sections are still being graded — final bands may change.</p>
                )}
                <p className="text-[10px] text-muted-foreground">
                  Bands are a 0–9 proportional mapping of your score. Not an official IELTS/TOEFL conversion.
                </p>
              </div>
            )}

            {!showBands && (
              isPractice ? (
                <p className="text-muted-foreground">
                  Great job finishing the practice run. Use this to get familiar with the format before your real attempt.
                </p>
              ) : (
                <p className="text-muted-foreground">
                  Your responses have been recorded. The recruiter will review your submission and be in touch.
                </p>
              )
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">You may now close this window.</p>
      </div>
    </div>
  )
}
