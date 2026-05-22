import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Trash2, Pencil, BookOpen, Loader2, Code2, Eye, EyeOff, Upload, X, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api, getErrorMessage } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const QUESTION_TYPES = ['MCQ_SINGLE', 'MCQ_MULTI', 'TRUE_FALSE', 'ESSAY', 'SHORT_ANSWER', 'NUMERICAL', 'CODE']
const TYPE_LABELS: Record<string, string> = {
  MCQ_SINGLE: 'MCQ (Single)', MCQ_MULTI: 'MCQ (Multi)', TRUE_FALSE: 'True/False',
  ESSAY: 'Essay', SHORT_ANSWER: 'Short Answer', NUMERICAL: 'Numerical', CODE: 'Code',
}

const optionSchema = z.object({ text: z.string().min(1), isCorrect: z.boolean().default(false) })

const questionSchema = z.object({
  type: z.enum(['MCQ_SINGLE', 'MCQ_MULTI', 'TRUE_FALSE', 'ESSAY', 'SHORT_ANSWER', 'NUMERICAL', 'CODE', 'FILE_UPLOAD', 'AUDIO_RECORDING', 'RANKING']),
  title: z.string().min(1, 'Title required'),
  body: z.string().min(1, 'Question body required'),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).default('MEDIUM'),
  points: z.coerce.number().min(0.5).default(1),
  tags: z.string().optional(),
  domain: z.string().optional(),
  options: z.array(optionSchema).optional(),
})
type QuestionFormValues = z.infer<typeof questionSchema>

interface TestCase {
  input: string
  expectedOutput: string
  isHidden: boolean
  points: number
  description: string
  order: number
}

const emptyTestCase = (): TestCase => ({
  input: '', expectedOutput: '', isHidden: false, points: 1, description: '', order: 0,
})

const DIFF_VARIANT: Record<string, any> = { EASY: 'success', MEDIUM: 'warning', HARD: 'destructive' }

interface CsvRow {
  type: string; title: string; body: string; difficulty: string; points: number
  tags: string; domain: string; options: { text: string; isCorrect: boolean }[]
}

function parseQuestionsCSV(text: string): { rows: CsvRow[]; errors: string[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { rows: [], errors: ['CSV must have a header row and at least one data row'] }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
  const rows: CsvRow[] = []
  const errors: string[] = []

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim())
    const get = (name: string) => cols[headers.indexOf(name)] ?? ''

    const type = get('type').toUpperCase()
    const VALID_TYPES = ['MCQ_SINGLE', 'MCQ_MULTI', 'TRUE_FALSE', 'ESSAY', 'SHORT_ANSWER', 'NUMERICAL', 'CODE']
    if (!VALID_TYPES.includes(type)) { errors.push(`Row ${i + 1}: invalid type "${type}"`); continue }

    const title = get('title')
    const body = get('body') || title
    if (!title) { errors.push(`Row ${i + 1}: title is required`); continue }

    const correctRaw = get('correct').toUpperCase()
    const correctLetters = new Set(correctRaw.split('|').map(s => s.trim()).filter(Boolean))
    const optionKeys = ['a', 'b', 'c', 'd', 'e']
    const optionTexts = optionKeys.map(k => get(`option_${k}`)).filter(Boolean)

    const options = optionTexts.map((text, idx) => ({
      text,
      isCorrect: correctLetters.has(optionKeys[idx].toUpperCase()),
    }))

    rows.push({
      type, title, body,
      difficulty: get('difficulty').toUpperCase() || 'MEDIUM',
      points: parseFloat(get('points')) || 1,
      tags: get('tags'),
      domain: get('domain'),
      options: ['MCQ_SINGLE', 'MCQ_MULTI', 'TRUE_FALSE'].includes(type) ? options : [],
    })
  }

  return { rows, errors }
}

export function QuestionBankPage() {
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [loadingEdit, setLoadingEdit] = useState(false)
  const [options, setOptions] = useState([{ text: '', isCorrect: false }, { text: '', isCorrect: false }])
  const [testCases, setTestCases] = useState<TestCase[]>([emptyTestCase()])
  const [showImport, setShowImport] = useState(false)
  const [importRows, setImportRows] = useState<CsvRow[]>([])
  const [importErrors, setImportErrors] = useState<string[]>([])
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['questions', search, filterType],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '100' })
      if (search) params.set('search', search)
      if (filterType) params.set('type', filterType)
      return api.get(`/questions?${params}`).then(r => r.data.data)
    },
  })

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<QuestionFormValues>({
    resolver: zodResolver(questionSchema),
    defaultValues: { type: 'MCQ_SINGLE', difficulty: 'MEDIUM', points: 1 },
  })
  const questionType = watch('type')
  const needsOptions = ['MCQ_SINGLE', 'MCQ_MULTI', 'TRUE_FALSE'].includes(questionType)
  const isCode = questionType === 'CODE'

  const saveMutation = useMutation({
    mutationFn: (values: QuestionFormValues) => {
      const payload = {
        ...values,
        tags: values.tags ? values.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        options: needsOptions ? options.filter(o => o.text.trim()) : undefined,
        testCases: isCode
          ? testCases
              .filter(tc => tc.expectedOutput.trim())
              .map((tc, i) => ({ ...tc, order: i }))
          : undefined,
      }
      if (editId) return api.patch(`/questions/${editId}`, payload)
      return api.post('/questions', payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['questions'] })
      toast({ title: editId ? 'Question updated' : 'Question created' })
      closeForm()
    },
    onError: err => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/questions/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['questions'] }); toast({ title: 'Question archived' }) },
    onError: err => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  })

  const closeForm = () => {
    setShowForm(false)
    setEditId(null)
    reset({ type: 'MCQ_SINGLE', difficulty: 'MEDIUM', points: 1 })
    setOptions([{ text: '', isCorrect: false }, { text: '', isCorrect: false }])
    setTestCases([emptyTestCase()])
  }

  const handleEdit = async (q: any) => {
    setLoadingEdit(true)
    try {
      const detail = await api.get(`/questions/${q.id}`).then(r => r.data.data)
      setEditId(q.id)
      reset({
        type: detail.type,
        title: detail.title,
        body: detail.body,
        difficulty: detail.difficulty,
        points: detail.points,
        tags: (detail.tags ?? []).join(', '),
        domain: detail.domain ?? '',
      })
      if (['MCQ_SINGLE', 'MCQ_MULTI', 'TRUE_FALSE'].includes(detail.type)) {
        setOptions(detail.options.map((o: any) => ({ text: o.text, isCorrect: o.isCorrect })))
      }
      if (detail.type === 'CODE') {
        setTestCases(
          detail.codeTestCases.length > 0
            ? detail.codeTestCases.map((tc: any) => ({
                input: tc.input,
                expectedOutput: tc.expectedOutput,
                isHidden: tc.isHidden,
                points: tc.points,
                description: tc.description ?? '',
                order: tc.order,
              }))
            : [emptyTestCase()]
        )
      }
      setShowForm(true)
    } catch (err) {
      toast({ title: 'Failed to load question', description: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setLoadingEdit(false)
    }
  }

  const handleOptionChange = (idx: number, field: 'text' | 'isCorrect', value: string | boolean) => {
    setOptions(prev => prev.map((o, i) => i === idx ? { ...o, [field]: value } : o))
  }

  const updateTestCase = (idx: number, patch: Partial<TestCase>) => {
    setTestCases(prev => prev.map((tc, i) => i === idx ? { ...tc, ...patch } : tc))
  }

  const removeTestCase = (idx: number) => {
    setTestCases(prev => prev.filter((_, i) => i !== idx))
  }

  const questions = data?.questions ?? []

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      const { rows, errors } = parseQuestionsCSV(text)
      setImportRows(rows)
      setImportErrors(errors)
      setShowImport(true)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const runImport = async () => {
    setImportProgress({ done: 0, total: importRows.length })
    let done = 0
    for (const row of importRows) {
      try {
        await api.post('/questions', {
          type: row.type,
          title: row.title,
          body: row.body,
          difficulty: row.difficulty,
          points: row.points,
          tags: row.tags ? row.tags.split('|').map(t => t.trim()).filter(Boolean) : [],
          domain: row.domain || undefined,
          options: row.options.length > 0 ? row.options : undefined,
        })
      } catch { /* silently skip individual failures */ }
      done++
      setImportProgress({ done, total: importRows.length })
    }
    qc.invalidateQueries({ queryKey: ['questions'] })
    toast({ title: `Imported ${done} question${done !== 1 ? 's' : ''}` })
    setShowImport(false)
    setImportRows([])
    setImportErrors([])
    setImportProgress(null)
  }

  return (
    <div className="space-y-6">
      <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Question Bank</h1>
          <p className="text-muted-foreground">{data?.total ?? 0} questions</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" />
            Import CSV
          </Button>
          <Button onClick={() => { closeForm(); setShowForm(true) }}>
            <Plus className="h-4 w-4 mr-2" />
            New Question
          </Button>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search questions..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select
          className="rounded-md border border-input px-3 py-2 text-sm bg-background"
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
        >
          <option value="">All Types</option>
          {QUESTION_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
        </select>
      </div>

      {/* CSV Import Modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">Import Questions from CSV</CardTitle>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setShowImport(false); setImportRows([]); setImportErrors([]) }}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {importErrors.length > 0 && (
                <div className="rounded-md bg-destructive/10 p-3 space-y-1">
                  <p className="text-xs font-medium text-destructive flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" />{importErrors.length} parse error{importErrors.length !== 1 ? 's' : ''}</p>
                  {importErrors.slice(0, 5).map((e, i) => <p key={i} className="text-xs text-destructive/80">{e}</p>)}
                </div>
              )}
              {importRows.length > 0 ? (
                <div className="rounded-md border overflow-hidden">
                  <div className="bg-gray-50 px-3 py-2 text-xs font-medium text-muted-foreground border-b">
                    {importRows.length} question{importRows.length !== 1 ? 's' : ''} ready to import
                  </div>
                  <div className="max-h-48 overflow-y-auto divide-y">
                    {importRows.map((row, i) => (
                      <div key={i} className="px-3 py-2 flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                        <span className="flex-1 truncate">{row.title}</span>
                        <Badge variant="outline" className="text-xs shrink-0">{row.type.replace('_', ' ')}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No valid rows found in CSV.</p>
              )}
              <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium">Expected CSV columns:</p>
                <p><code>type,title,body,difficulty,points,tags,domain,option_a,option_b,option_c,option_d,correct</code></p>
                <p>• <code>type</code>: MCQ_SINGLE, MCQ_MULTI, TRUE_FALSE, ESSAY, etc.</p>
                <p>• <code>correct</code>: letter(s) of correct option(s), e.g. <code>A</code> or <code>A|C</code></p>
                <p>• <code>tags</code>: pipe-separated, e.g. <code>javascript|react</code></p>
              </div>
              {importProgress && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Importing…</span>
                    <span>{importProgress.done}/{importProgress.total}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${(importProgress.done / importProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => { setShowImport(false); setImportRows([]); setImportErrors([]) }}>
                  Cancel
                </Button>
                <Button size="sm" disabled={importRows.length === 0 || !!importProgress} onClick={runImport}>
                  {importProgress ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                  Import {importRows.length > 0 ? importRows.length : ''} Question{importRows.length !== 1 ? 's' : ''}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Question Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <Card className="w-full max-w-2xl my-8">
            <CardHeader>
              <CardTitle>{editId ? 'Edit Question' : 'New Question'}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(v => saveMutation.mutate(v))} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" {...register('type')}>
                      {QUESTION_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Difficulty</Label>
                    <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" {...register('difficulty')}>
                      <option value="EASY">Easy</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HARD">Hard</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Title (Internal Label) *</Label>
                  <Input placeholder="e.g., Two Sum — Basic" {...register('title')} />
                  {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Question Body *</Label>
                  <textarea
                    rows={3}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="The full question text shown to candidates..."
                    {...register('body')}
                  />
                  {errors.body && <p className="text-xs text-destructive">{errors.body.message}</p>}
                </div>

                {/* MCQ options */}
                {needsOptions && (
                  <div className="space-y-2">
                    <Label>Options</Label>
                    {options.map((opt, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type={questionType === 'MCQ_MULTI' ? 'checkbox' : 'radio'}
                          name="correctOption"
                          checked={opt.isCorrect}
                          onChange={e => handleOptionChange(idx, 'isCorrect', e.target.checked)}
                          className="shrink-0"
                        />
                        <Input
                          placeholder={`Option ${idx + 1}`}
                          value={opt.text}
                          onChange={e => handleOptionChange(idx, 'text', e.target.value)}
                        />
                        {options.length > 2 && (
                          <Button type="button" variant="ghost" size="icon" onClick={() => setOptions(prev => prev.filter((_, i) => i !== idx))}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={() => setOptions(prev => [...prev, { text: '', isCorrect: false }])}>
                      <Plus className="h-3.5 w-3.5 mr-1" />Add Option
                    </Button>
                  </div>
                )}

                {/* Code test cases */}
                {isCode && (
                  <div className="space-y-3 border rounded-lg p-4 bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Code2 className="h-4 w-4 text-muted-foreground" />
                        <Label className="text-sm font-semibold">Test Cases</Label>
                        <span className="text-xs text-muted-foreground">({testCases.length})</span>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setTestCases(prev => [...prev, emptyTestCase()])}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />Add Case
                      </Button>
                    </div>
                    {testCases.map((tc, idx) => (
                      <div key={idx} className="bg-white border rounded-lg p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-500">Case {idx + 1}</span>
                          <Input
                            className="h-7 text-xs flex-1"
                            placeholder="Description (optional)"
                            value={tc.description}
                            onChange={e => updateTestCase(idx, { description: e.target.value })}
                          />
                          <Input
                            type="number"
                            className="h-7 text-xs w-20"
                            placeholder="Points"
                            min={0}
                            step={0.5}
                            value={tc.points}
                            onChange={e => updateTestCase(idx, { points: parseFloat(e.target.value) || 1 })}
                          />
                          <button
                            type="button"
                            onClick={() => updateTestCase(idx, { isHidden: !tc.isHidden })}
                            title={tc.isHidden ? 'Hidden from candidate' : 'Visible to candidate'}
                            className="shrink-0"
                          >
                            {tc.isHidden
                              ? <EyeOff className="h-4 w-4 text-orange-500" />
                              : <Eye className="h-4 w-4 text-green-600" />}
                          </button>
                          {testCases.length > 1 && (
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeTestCase(idx)}>
                              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Input (stdin)</p>
                            <textarea
                              rows={2}
                              className="flex w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              placeholder="Leave empty if no input needed"
                              value={tc.input}
                              onChange={e => updateTestCase(idx, { input: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Expected Output *</p>
                            <textarea
                              rows={2}
                              className="flex w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              placeholder="Expected stdout (exact match, trimmed)"
                              value={tc.expectedOutput}
                              onChange={e => updateTestCase(idx, { expectedOutput: e.target.value })}
                            />
                          </div>
                        </div>
                        {tc.isHidden && (
                          <p className="text-xs text-orange-600 flex items-center gap-1">
                            <EyeOff className="h-3 w-3" />Hidden — candidates won't see expected output
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Points</Label>
                    <Input type="number" step="0.5" min="0.5" {...register('points')} />
                  </div>
                  <div className="space-y-2">
                    <Label>Domain</Label>
                    <Input placeholder="e.g., Software Engineering" {...register('domain')} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Tags (comma separated)</Label>
                  <Input placeholder="javascript, closures, fundamentals" {...register('tags')} />
                </div>
                <div className="flex gap-3 pt-2">
                  <Button type="submit" disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    {editId ? 'Update' : 'Create'} Question
                  </Button>
                  <Button type="button" variant="outline" onClick={closeForm}>Cancel</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {isLoading || loadingEdit ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : questions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">No questions yet. Create your first question.</p>
            <Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4 mr-2" />Add Question</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {questions.map((q: any) => (
            <Card key={q.id} className="hover:border-primary/30 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">{TYPE_LABELS[q.type] ?? q.type}</Badge>
                      <Badge variant={DIFF_VARIANT[q.difficulty]} className="text-xs">{q.difficulty}</Badge>
                      <span className="text-xs text-muted-foreground">{q.points} pts</span>
                      {q.domain && <span className="text-xs text-muted-foreground">· {q.domain}</span>}
                      {q.type === 'CODE' && q.codeTestCases?.length > 0 && (
                        <span className="text-xs text-blue-600 flex items-center gap-1">
                          <Code2 className="h-3 w-3" />{q.codeTestCases.length} test case{q.codeTestCases.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <p className="font-medium text-sm mt-1">{q.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{q.body}</p>
                    {q.tags?.length > 0 && (
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        {q.tags.map((tag: string) => (
                          <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleEdit(q)}
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => deleteMutation.mutate(q.id)}
                      title="Archive"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
