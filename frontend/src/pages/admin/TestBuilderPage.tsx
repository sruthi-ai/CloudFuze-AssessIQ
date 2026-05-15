import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  ArrowLeft, Plus, Trash2, Settings, BookOpen,
  GripVertical, Loader2, Save, Eye, Pencil, X, Check,
  Users, BarChart2, Copy, RefreshCw, XCircle, Send,
  TrendingUp, CheckCircle, Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { api, getErrorMessage } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

// ─── Schemas ────────────────────────────────────────────────────────────────

const testSchema = z.object({
  title: z.string().min(1, 'Title required'),
  description: z.string().optional(),
  instructions: z.string().optional(),
  domain: z.string().optional(),
  duration: z.coerce.number().int().min(1),
  passingScore: z.coerce.number().min(0).max(100).optional(),
  shuffleQuestions: z.boolean().optional(),
  shuffleOptions: z.boolean().optional(),
  showResults: z.boolean().optional(),
  proctoring: z.boolean().optional(),
})
type TestFormValues = z.infer<typeof testSchema>

// ─── Constants ───────────────────────────────────────────────────────────────

const QUESTION_TYPE_LABELS: Record<string, string> = {
  MCQ_SINGLE: 'Multiple Choice',
  MCQ_MULTI: 'Multi-Select',
  TRUE_FALSE: 'True / False',
  ESSAY: 'Essay',
  SHORT_ANSWER: 'Short Answer',
  CODE: 'Code',
  NUMERICAL: 'Numerical',
  FILE_UPLOAD: 'File Upload',
}

const ALL_TYPES = Object.keys(QUESTION_TYPE_LABELS)

// ─── Question Preview Modal ───────────────────────────────────────────────────

interface QuestionPreviewModalProps {
  question: any
  onClose: () => void
}

function QuestionPreviewModal({ question, onClose }: QuestionPreviewModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <Card className="w-full max-w-xl max-h-[80vh] flex flex-col shadow-2xl">
        <CardHeader className="border-b flex flex-row items-center justify-between space-y-0 pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-base">Question Preview</CardTitle>
            <Badge variant="outline" className="text-xs">
              {QUESTION_TYPE_LABELS[question.type] ?? question.type}
            </Badge>
            {question.difficulty && (
              <Badge
                variant={
                  question.difficulty === 'HARD'
                    ? 'destructive'
                    : question.difficulty === 'EASY'
                    ? 'success'
                    : 'secondary'
                }
                className="text-xs"
              >
                {question.difficulty}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">{question.points ?? '–'} pts</span>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {question.title && (
            <p className="text-sm font-semibold text-gray-900">{question.title}</p>
          )}
          {question.body && (
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{question.body}</p>
          )}
          {question.options && question.options.length > 0 && (
            <div className="space-y-2 mt-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Options</p>
              {question.options.map((opt: any, i: number) => (
                <div
                  key={opt.id ?? i}
                  className={cn(
                    'flex items-start gap-2 p-2.5 rounded-md border text-sm',
                    opt.isCorrect
                      ? 'bg-green-50 border-green-300 text-green-900 font-medium'
                      : 'bg-gray-50 border-gray-200 text-gray-700'
                  )}
                >
                  <span className="shrink-0 text-xs font-mono text-muted-foreground mt-0.5 w-4">
                    {String.fromCharCode(65 + i)}.
                  </span>
                  <span className="flex-1">{opt.text}</span>
                  {opt.isCorrect && (
                    <Check className="h-3.5 w-3.5 text-green-600 shrink-0 mt-0.5" />
                  )}
                </div>
              ))}
            </div>
          )}
          {(!question.options || question.options.length === 0) &&
            ['ESSAY', 'SHORT_ANSWER', 'CODE', 'NUMERICAL', 'FILE_UPLOAD'].includes(question.type) && (
              <div className="p-3 rounded-md bg-gray-50 border border-dashed text-xs text-muted-foreground italic">
                {question.type === 'ESSAY' && 'Candidate will type a long-form answer.'}
                {question.type === 'SHORT_ANSWER' && 'Candidate will type a short answer.'}
                {question.type === 'CODE' && 'Candidate will write code in the editor.'}
                {question.type === 'NUMERICAL' && 'Candidate will enter a numerical value.'}
                {question.type === 'FILE_UPLOAD' && 'Candidate will upload a file.'}
              </div>
            )}
        </div>
      </Card>
    </div>
  )
}

// ─── Inline Points Editor ─────────────────────────────────────────────────────

interface PointsBadgeProps {
  tqId: string
  testId: string
  initialPoints: number
  onSaved: () => void
}

function PointsBadge({ tqId, testId, initialPoints, onSaved }: PointsBadgeProps) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(initialPoints))
  const inputRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: (points: number) =>
      api.patch(`/tests/${testId}/questions/${tqId}`, { points }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['test', testId] })
      onSaved()
      setEditing(false)
    },
    onError: err => {
      toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' })
      setEditing(false)
    },
  })

  const save = () => {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 0) return
    mutation.mutate(parsed)
  }

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        min="0"
        className="w-14 text-xs border rounded px-1.5 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-primary"
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={e => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') setEditing(false)
        }}
      />
    )
  }

  return (
    <button
      title="Click to edit points"
      className="text-xs text-muted-foreground hover:text-primary hover:underline underline-offset-2 transition-colors"
      onClick={() => { setValue(String(initialPoints)); setEditing(true) }}
    >
      {initialPoints} pts
    </button>
  )
}

// ─── Inline Section Title Editor ──────────────────────────────────────────────

interface SectionTitleEditorProps {
  sectionId: string
  testId: string
  initialTitle: string
}

function SectionTitleEditor({ sectionId, testId, initialTitle }: SectionTitleEditorProps) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(initialTitle)
  const inputRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: (title: string) =>
      api.patch(`/tests/${testId}/sections/${sectionId}`, { title }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['test', testId] })
      setEditing(false)
      toast({ title: 'Section renamed' })
    },
    onError: err => {
      toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' })
      setEditing(false)
    },
  })

  const save = () => {
    const trimmed = value.trim()
    if (!trimmed || trimmed === initialTitle) { setEditing(false); return }
    mutation.mutate(trimmed)
  }

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="text"
          className="text-base font-semibold border rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-primary min-w-0 w-56"
          value={value}
          onChange={e => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={e => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') setEditing(false)
          }}
        />
        {mutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 group">
      <span className="text-base font-semibold">{initialTitle}</span>
      <button
        title="Rename section"
        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
        onClick={() => { setValue(initialTitle); setEditing(true) }}
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ─── Candidates Tab ───────────────────────────────────────────────────────────

const INV_STATUS_VARIANT: Record<string, any> = {
  PENDING: 'secondary', SENT: 'secondary', OPENED: 'warning',
  STARTED: 'warning', COMPLETED: 'success', EXPIRED: 'destructive', CANCELLED: 'outline',
}

function TestCandidatesTab({ testId }: { testId: string }) {
  const qc = useQueryClient()
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  const { data: invitations = [], isLoading } = useQuery<any[]>({
    queryKey: ['test-invitations', testId],
    queryFn: () => api.get(`/candidates/invitations/${testId}`).then(r => r.data.data),
  })

  const resendMutation = useMutation({
    mutationFn: (invitationId: string) => api.post(`/candidates/invitations/${invitationId}/resend`, {}),
    onSuccess: () => { toast({ title: 'Invitation resent' }); qc.invalidateQueries({ queryKey: ['test-invitations', testId] }) },
    onError: err => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  })

  const cancelMutation = useMutation({
    mutationFn: (invitationId: string) => api.delete(`/candidates/invitations/${invitationId}`),
    onSuccess: () => { toast({ title: 'Invitation cancelled' }); qc.invalidateQueries({ queryKey: ['test-invitations', testId] }) },
    onError: err => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  })

  const copyLink = (token: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/take/${token}`)
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(null), 2000)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{invitations.length} candidate{invitations.length !== 1 ? 's' : ''} invited</p>
        <Button size="sm" asChild>
          <Link to={`/admin/candidates?testId=${testId}`}>
            <Send className="h-3.5 w-3.5 mr-1.5" />Invite More
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : invitations.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <Users className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-3">No candidates invited yet.</p>
          <Button size="sm" asChild>
            <Link to={`/admin/candidates?testId=${testId}`}><Send className="h-3.5 w-3.5 mr-1.5" />Invite Candidates</Link>
          </Button>
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50/50">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Candidate</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Organization</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Score</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {invitations.map((inv: any) => (
                  <tr key={inv.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <p className="font-medium">{inv.candidate.firstName} {inv.candidate.lastName}</p>
                      <p className="text-xs text-muted-foreground">{inv.candidate.email}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {inv.candidate.organization ?? <span className="italic">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={INV_STATUS_VARIANT[inv.status] ?? 'secondary'} className="text-xs">
                        {inv.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {inv.session?.score ? (
                        <span className={cn('font-medium text-sm', inv.session.score.passed ? 'text-green-600' : 'text-red-600')}>
                          {inv.session.score.percentage.toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => copyLink(inv.token)}
                          className="p-1 text-muted-foreground hover:text-primary transition-colors"
                          title="Copy invite link"
                        >
                          {copiedToken === inv.token ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                        {!['CANCELLED', 'COMPLETED', 'EXPIRED'].includes(inv.status) && (
                          <button
                            onClick={() => resendMutation.mutate(inv.id)}
                            disabled={resendMutation.isPending}
                            className="p-1 text-muted-foreground hover:text-primary transition-colors"
                            title="Resend email"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {!['CANCELLED', 'COMPLETED', 'EXPIRED'].includes(inv.status) && (
                          <button
                            onClick={() => cancelMutation.mutate(inv.id)}
                            disabled={cancelMutation.isPending}
                            className="p-1 text-muted-foreground hover:text-red-500 transition-colors"
                            title="Cancel invitation"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {inv.session?.id && (
                          <Link
                            to={`/admin/results/${inv.session.id}`}
                            className="p-1 text-muted-foreground hover:text-primary transition-colors"
                            title="View result"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

// ─── Results Tab ──────────────────────────────────────────────────────────────

function TestResultsTab({ testId, passingScore }: { testId: string; passingScore: number | null }) {
  const { data, isLoading } = useQuery<{ sessions: any[]; total: number }>({
    queryKey: ['test-results', testId],
    queryFn: () => api.get(`/results?testId=${testId}&limit=100`).then(r => r.data.data),
  })

  const sessions = data?.sessions ?? []
  const submitted = sessions.filter(s => s.status === 'SUBMITTED' || s.status === 'TIMED_OUT')
  const withScore = submitted.filter(s => s.score)
  const avgScore = withScore.length
    ? withScore.reduce((sum, s) => sum + s.score.percentage, 0) / withScore.length
    : null
  const passed = withScore.filter(s => s.score.passed).length
  const passRate = withScore.length ? (passed / withScore.length) * 100 : null

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Submitted</p>
            </div>
            <p className="text-2xl font-bold mt-1">{submitted.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Avg Score</p>
            </div>
            <p className="text-2xl font-bold mt-1">
              {avgScore !== null ? `${avgScore.toFixed(0)}%` : '—'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Pass Rate</p>
            </div>
            <p className="text-2xl font-bold mt-1">
              {passRate !== null ? `${passRate.toFixed(0)}%` : '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : submitted.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No submissions yet.</p>
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50/50">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Candidate</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Organization</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Submitted</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Score</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Result</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {submitted.map((s: any) => (
                  <tr key={s.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <p className="font-medium">{s.candidate.firstName} {s.candidate.lastName}</p>
                      <p className="text-xs text-muted-foreground">{s.candidate.email}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {s.candidate.organization ?? <span className="italic">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {s.submittedAt ? new Date(s.submittedAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {s.score ? (
                        <span className="font-medium">{s.score.percentage.toFixed(0)}%</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {s.score ? (
                        s.score.passed === true ? (
                          <Badge variant="success" className="text-xs">Pass</Badge>
                        ) : s.score.passed === false ? (
                          <Badge variant="destructive" className="text-xs">Fail</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">Graded</Badge>
                        )
                      ) : (
                        <Badge variant="secondary" className="text-xs">Pending</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                        <Link to={`/admin/results/${s.id}`}><Eye className="h-3 w-3 mr-1" />Details</Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function TestBuilderPage() {
  const { testId } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const isNew = !testId

  const [activeTab, setActiveTab] = useState<'settings' | 'questions' | 'candidates' | 'results'>('settings')
  const [showQuestionPicker, setShowQuestionPicker] = useState(false)
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null)

  // Picker filters
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerTypeFilter, setPickerTypeFilter] = useState<string>('ALL')

  // Preview modal
  const [previewQuestion, setPreviewQuestion] = useState<any | null>(null)

  // Drag-and-drop state
  const dragItemRef = useRef<{ sectionId: string; tqId: string; index: number } | null>(null)
  const dragOverRef = useRef<{ sectionId: string; index: number } | null>(null)

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: testData, isLoading } = useQuery({
    queryKey: ['test', testId],
    queryFn: () => api.get(`/tests/${testId}`).then(r => r.data.data),
    enabled: !!testId,
  })

  const { data: questionsData } = useQuery({
    queryKey: ['questions-picker'],
    queryFn: () => api.get('/questions?limit=200').then(r => r.data.data),
    enabled: showQuestionPicker,
  })

  // ── Form ──────────────────────────────────────────────────────────────────

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TestFormValues>({
    resolver: zodResolver(testSchema),
    defaultValues: {
      duration: 60,
      proctoring: true,
      shuffleQuestions: false,
      shuffleOptions: false,
      showResults: false,
    },
  })

  useEffect(() => {
    if (testData) {
      reset({
        title: testData.title,
        description: testData.description ?? '',
        instructions: testData.instructions ?? '',
        domain: testData.domain ?? '',
        duration: testData.duration,
        passingScore: testData.passingScore ?? undefined,
        shuffleQuestions: testData.shuffleQuestions,
        shuffleOptions: testData.shuffleOptions,
        showResults: testData.showResults,
        proctoring: testData.proctoring,
      })
    }
  }, [testData, reset])

  // ── Mutations ─────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async (values: TestFormValues) => {
      if (isNew) {
        const { data } = await api.post('/tests', values)
        return data.data
      } else {
        const { data } = await api.patch(`/tests/${testId}`, values)
        return data.data
      }
    },
    onSuccess: data => {
      qc.invalidateQueries({ queryKey: ['tests'] })
      if (isNew) navigate(`/admin/tests/${data.id}`)
      toast({ title: 'Test saved' })
    },
    onError: err => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  })

  const addSectionMutation = useMutation({
    mutationFn: () =>
      api.post(`/tests/${testId}/sections`, {
        title: `Section ${(testData?.sections?.length ?? 0) + 1}`,
        order: testData?.sections?.length ?? 0,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['test', testId] })
      toast({ title: 'Section added' })
    },
    onError: err => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  })

  const deleteSectionMutation = useMutation({
    mutationFn: (sectionId: string) =>
      api.delete(`/tests/${testId}/sections/${sectionId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['test', testId] })
      toast({ title: 'Section deleted' })
    },
    onError: err => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  })

  const addQuestionMutation = useMutation({
    mutationFn: ({ questionId, sectionId }: { questionId: string; sectionId?: string }) =>
      api.post(`/tests/${testId}/questions`, { questionId, sectionId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['test', testId] })
      toast({ title: 'Question added' })
    },
    onError: err => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  })

  const removeQuestionMutation = useMutation({
    mutationFn: (tqId: string) => api.delete(`/tests/${testId}/questions/${tqId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['test', testId] }),
    onError: err => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  })

  const reorderMutation = useMutation({
    mutationFn: ({ tqId, order }: { tqId: string; order: number }) =>
      api.patch(`/tests/${testId}/questions/${tqId}`, { order }),
    onError: err => toast({ title: 'Reorder failed', description: getErrorMessage(err), variant: 'destructive' }),
  })

  const publishMutation = useMutation({
    mutationFn: (action: 'publish' | 'archive') =>
      api.post(`/tests/${testId}/${action}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['test', testId] })
      qc.invalidateQueries({ queryKey: ['tests'] })
      toast({ title: testData?.status === 'PUBLISHED' ? 'Test unpublished' : 'Test published' })
    },
    onError: err => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  })

  // ── Derived state ─────────────────────────────────────────────────────────

  const test = testData

  const allTestQuestionIds = new Set(
    test?.sections?.flatMap((s: any) =>
      s.testQuestions.map((tq: any) => tq.question.id)
    ) ?? []
  )

  const filteredPickerQuestions = (questionsData?.questions ?? []).filter((q: any) => {
    const matchesType = pickerTypeFilter === 'ALL' || q.type === pickerTypeFilter
    const searchLower = pickerSearch.toLowerCase()
    const matchesSearch =
      !pickerSearch ||
      (q.title ?? '').toLowerCase().includes(searchLower) ||
      (q.body ?? '').toLowerCase().includes(searchLower)
    return matchesType && matchesSearch
  })

  // ── Drag-and-drop handlers ─────────────────────────────────────────────────

  const handleDragStart = (sectionId: string, tqId: string, index: number) => {
    dragItemRef.current = { sectionId, tqId, index }
  }

  const handleDragOver = (e: React.DragEvent, sectionId: string, index: number) => {
    e.preventDefault()
    dragOverRef.current = { sectionId, index }
  }

  const handleDrop = (e: React.DragEvent, targetSectionId: string, targetIndex: number) => {
    e.preventDefault()
    const drag = dragItemRef.current
    if (!drag || !test) return

    // Only reorder within the same section for simplicity
    if (drag.sectionId !== targetSectionId) return
    if (drag.index === targetIndex) return

    const section = test.sections.find((s: any) => s.id === targetSectionId)
    if (!section) return

    // Reorder the array
    const items: any[] = [...section.testQuestions]
    const [moved] = items.splice(drag.index, 1)
    items.splice(targetIndex, 0, moved)

    // Optimistic UI update via cache
    qc.setQueryData(['test', testId], (old: any) => {
      if (!old) return old
      return {
        ...old,
        sections: old.sections.map((s: any) =>
          s.id === targetSectionId
            ? { ...s, testQuestions: items.map((tq: any, i: number) => ({ ...tq, order: i })) }
            : s
        ),
      }
    })

    // Fire PATCH for each affected item
    items.forEach((tq: any, i: number) => {
      reorderMutation.mutate({ tqId: tq.id, order: i })
    })

    dragItemRef.current = null
    dragOverRef.current = null
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  const onSubmit = (values: TestFormValues) => saveMutation.mutate(values)

  // ── Loading state ─────────────────────────────────────────────────────────

  if (!isNew && isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-4xl">

      {/* Page header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin/tests"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">
            {isNew ? 'New Test' : (test?.title ?? 'Edit Test')}
          </h1>
          {test?.status && (
            <Badge
              variant={test.status === 'PUBLISHED' ? 'success' : 'secondary'}
              className="mt-1"
            >
              {test.status}
            </Badge>
          )}
        </div>
        {!isNew && (
          <Button variant="outline" size="sm" asChild>
            <Link to={`/admin/candidates?testId=${testId}`}>
              <Eye className="h-4 w-4 mr-1" />
              Invite Candidates
            </Link>
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b overflow-x-auto">
        {([
          { id: 'settings', label: 'Settings', Icon: Settings },
          { id: 'questions', label: 'Questions', Icon: BookOpen },
          { id: 'candidates', label: 'Candidates', Icon: Users },
          { id: 'results', label: 'Results', Icon: BarChart2 },
        ] as const).map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => { if (!isNew || id === 'settings') setActiveTab(id) }}
            disabled={isNew && id !== 'settings'}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
              activeTab === id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-gray-900',
              isNew && id !== 'settings' && 'opacity-40 cursor-not-allowed'
            )}
          >
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {/* ── Settings tab ── */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Basic Info</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Test Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g., Frontend Engineer Assessment"
                  {...register('title')}
                />
                {errors.title && (
                  <p className="text-xs text-destructive">{errors.title.message}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="domain">Domain</Label>
                  <Input
                    id="domain"
                    placeholder="e.g., Software Engineering"
                    {...register('domain')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="duration">Duration (minutes) *</Label>
                  <Input id="duration" type="number" min="1" {...register('duration')} />
                  {errors.duration && (
                    <p className="text-xs text-destructive">{errors.duration.message}</p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <textarea
                  id="description"
                  rows={2}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Brief description for recruiters"
                  {...register('description')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="instructions">Candidate Instructions</Label>
                <textarea
                  id="instructions"
                  rows={3}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Instructions shown to the candidate before the test begins..."
                  {...register('instructions')}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Scoring & Options</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="passingScore">Passing Score (%)</Label>
                <Input
                  id="passingScore"
                  type="number"
                  min="0"
                  max="100"
                  placeholder="e.g., 70"
                  {...register('passingScore')}
                />
              </div>
              <div className="space-y-3">
                {([
                  { name: 'shuffleQuestions', label: 'Shuffle question order' },
                  { name: 'shuffleOptions', label: 'Shuffle MCQ options' },
                  { name: 'showResults', label: 'Show results to candidate after submission' },
                  { name: 'proctoring', label: 'Enable proctoring (webcam, tab monitoring)' },
                ] as const).map(opt => (
                  <label key={opt.name} className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" className="rounded" {...register(opt.name)} />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                : <Save className="h-4 w-4 mr-2" />
              }
              {isNew ? 'Save & Continue' : 'Save Changes'}
            </Button>
            {!isNew && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setActiveTab('questions')}
              >
                Manage Questions
              </Button>
            )}
          </div>
        </form>
      )}

      {/* ── Questions tab ── */}
      {activeTab === 'questions' && test && (
        <div className="space-y-4">

          {/* Tab action bar: Add Section + Publish/Unpublish */}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => addSectionMutation.mutate()}
              disabled={addSectionMutation.isPending}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Section
            </Button>

            {test.status === 'DRAFT' ? (
              <Button
                size="sm"
                onClick={() => publishMutation.mutate('publish')}
                disabled={publishMutation.isPending}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {publishMutation.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  : null
                }
                Publish Test
              </Button>
            ) : test.status === 'PUBLISHED' ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => publishMutation.mutate('archive')}
                disabled={publishMutation.isPending}
                className="border-orange-400 text-orange-600 hover:bg-orange-50"
              >
                {publishMutation.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  : null
                }
                Unpublish Test
              </Button>
            ) : null}
          </div>

          {/* Sections */}
          {test.sections.map((section: any) => (
            <Card key={section.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <SectionTitleEditor
                    sectionId={section.id}
                    testId={testId!}
                    initialTitle={section.title}
                  />
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Delete section */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      title="Delete section"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete "${section.title}"? All questions in this section will be removed from the test.`
                          )
                        ) {
                          deleteSectionMutation.mutate(section.id)
                        }
                      }}
                      disabled={deleteSectionMutation.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    {/* Add question */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedSectionId(section.id)
                        setPickerSearch('')
                        setPickerTypeFilter('ALL')
                        setShowQuestionPicker(true)
                      }}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add Question
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-0">
                {section.testQuestions.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No questions yet. Add from the question bank.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {section.testQuestions.map((tq: any, idx: number) => (
                      <div
                        key={tq.id}
                        draggable
                        onDragStart={() => handleDragStart(section.id, tq.id, idx)}
                        onDragOver={e => handleDragOver(e, section.id, idx)}
                        onDrop={e => handleDrop(e, section.id, idx)}
                        className={cn(
                          'flex items-start gap-3 p-3 rounded-md border bg-gray-50/50 hover:bg-gray-50 cursor-grab active:cursor-grabbing transition-colors',
                          dragOverRef.current?.sectionId === section.id &&
                            dragOverRef.current?.index === idx &&
                            'border-primary bg-primary/5'
                        )}
                      >
                        <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium text-muted-foreground">Q{idx + 1}</span>
                            <Badge variant="outline" className="text-xs">
                              {QUESTION_TYPE_LABELS[tq.question.type] ?? tq.question.type}
                            </Badge>
                            <PointsBadge
                              tqId={tq.id}
                              testId={testId!}
                              initialPoints={tq.points ?? tq.question.points ?? 0}
                              onSaved={() => {}}
                            />
                          </div>
                          <p className="text-sm font-medium mt-0.5 line-clamp-1">{tq.question.title}</p>
                          <p className="text-xs text-muted-foreground line-clamp-1">{tq.question.body}</p>
                        </div>
                        {/* Preview button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-primary"
                          title="Preview question"
                          onClick={() => setPreviewQuestion(tq.question)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {/* Remove button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-destructive/60 hover:text-destructive"
                          onClick={() => removeQuestionMutation.mutate(tq.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {test.sections.length === 0 && (
            <div className="rounded-lg border border-dashed p-10 text-center">
              <p className="text-muted-foreground text-sm">
                No sections yet. Click "Add Section" to get started.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Candidates tab ── */}
      {activeTab === 'candidates' && testId && (
        <TestCandidatesTab testId={testId} />
      )}

      {/* ── Results tab ── */}
      {activeTab === 'results' && testId && (
        <TestResultsTab testId={testId} passingScore={test?.passingScore ?? null} />
      )}

      {/* ── Question Picker Modal ── */}
      {showQuestionPicker && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowQuestionPicker(false) }}
        >
          <Card className="w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
            <CardHeader className="border-b pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Add Question from Bank</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setShowQuestionPicker(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Search + type filter */}
              <div className="flex gap-2 mt-3">
                <Input
                  placeholder="Search by title or body…"
                  value={pickerSearch}
                  onChange={e => setPickerSearch(e.target.value)}
                  className="flex-1 h-8 text-sm"
                />
                <select
                  value={pickerTypeFilter}
                  onChange={e => setPickerTypeFilter(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="ALL">All types</option>
                  {ALL_TYPES.map(t => (
                    <option key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>

              {questionsData && (
                <p className="text-xs text-muted-foreground mt-1">
                  Showing {filteredPickerQuestions.length} of {questionsData.questions?.length ?? 0} questions
                </p>
              )}
            </CardHeader>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {!questionsData ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredPickerQuestions.length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-sm">
                  {(questionsData?.questions?.length ?? 0) === 0 ? (
                    <>No questions in your bank.{' '}
                      <Link to="/admin/questions" className="text-primary hover:underline">
                        Create some
                      </Link>
                    </>
                  ) : 'No questions match your filters.'}
                </p>
              ) : (
                filteredPickerQuestions.map((q: any) => {
                  const alreadyAdded = allTestQuestionIds.has(q.id)
                  return (
                    <div
                      key={q.id}
                      className={cn(
                        'flex items-start gap-3 p-3 rounded-md border transition-colors',
                        alreadyAdded ? 'opacity-50 bg-gray-50' : 'hover:bg-gray-50'
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            {QUESTION_TYPE_LABELS[q.type] ?? q.type}
                          </Badge>
                          <Badge
                            variant={
                              q.difficulty === 'HARD'
                                ? 'destructive'
                                : q.difficulty === 'EASY'
                                ? 'success'
                                : 'secondary'
                            }
                            className="text-xs"
                          >
                            {q.difficulty}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{q.points} pts</span>
                        </div>
                        <p className="text-sm font-medium mt-1 line-clamp-1">{q.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">{q.body}</p>
                      </div>
                      {/* Preview in picker */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-primary"
                        title="Preview question"
                        onClick={() => setPreviewQuestion(q)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        disabled={alreadyAdded || addQuestionMutation.isPending}
                        onClick={() =>
                          addQuestionMutation.mutate({
                            questionId: q.id,
                            sectionId: selectedSectionId ?? undefined,
                          })
                        }
                      >
                        {alreadyAdded ? 'Added' : 'Add'}
                      </Button>
                    </div>
                  )
                })
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ── Question Preview Modal ── */}
      {previewQuestion && (
        <QuestionPreviewModal
          question={previewQuestion}
          onClose={() => setPreviewQuestion(null)}
        />
      )}
    </div>
  )
}
