/**
 * Load-test runner: drives real HTTP traffic against a running AssessIQ
 * backend for every {token, pin} in the file loadtest-setup.ts produced,
 * simulating the exact conditions that broke production:
 *   - CONCURRENCY candidates in flight at once
 *   - all bucketed across a SMALL number of shared IPs (X-Forwarded-For) —
 *     mirrors "we shared the same IP for almost every candidate"
 *   - the real per-candidate request pattern: PIN lookup, start, questions,
 *     a few heartbeats, MCQ autosave, two audio-answer media uploads, one
 *     proctoring snapshot + event, submit.
 *
 * Reports per-step success/failure counts, 429/5xx counts, latency
 * percentiles, and does a final /health check to confirm the server is
 * still alive (proving no crash under load).
 *
 *   npx tsx prisma/loadtest-run.ts
 *
 * Env: BASE_URL (default http://localhost:3001), IN_FILE (default
 *      ./loadtest-invitations.json), CONCURRENCY (default 50),
 *      SHARED_IPS (default 3 — candidates are bucketed round-robin across
 *      this many synthetic IPs, so SHARED_IPS=1 is the worst case: everyone
 *      behind one IP).
 */
import { readFile } from 'fs/promises'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001'
const IN_FILE = process.env.IN_FILE || './loadtest-invitations.json'
const CONCURRENCY = Number(process.env.CONCURRENCY) || 50
const SHARED_IPS = Number(process.env.SHARED_IPS) || 3

type StepName = 'by-pin' | 'start' | 'questions' | 'heartbeat' | 'mcq-save' | 'audio-upload' | 'snapshot' | 'event' | 'submit'
interface StepResult { step: StepName; ok: boolean; status: number; ms: number }

const results: StepResult[] = []
const ipFor = (i: number) => `203.0.113.${(i % SHARED_IPS) + 1}` // TEST-NET-3, safe synthetic range

async function timed<T>(step: StepName, fn: () => Promise<{ status: number; body: T }>): Promise<{ status: number; body: T } | null> {
  const t0 = Date.now()
  try {
    const res = await fn()
    results.push({ step, ok: res.status >= 200 && res.status < 300, status: res.status, ms: Date.now() - t0 })
    return res
  } catch (err) {
    results.push({ step, ok: false, status: 0, ms: Date.now() - t0 })
    return null
  }
}

const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS) || 20_000

async function req(path: string, ip: string, init: RequestInit & { json?: any } = {}) {
  const { json, ...rest } = init
  const headers: Record<string, string> = { 'X-Forwarded-For': ip, ...(rest.headers as any) }
  let body = rest.body
  if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json) }
  // A hung request must never hang the whole harness — treat a timeout as a
  // failed step (status 0) so the pool always drains and the report always prints.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(`${BASE_URL}${path}`, { ...rest, headers, body, signal: controller.signal })
    let parsed: any = null
    try { parsed = await res.json() } catch { /* non-JSON (e.g. audio stream) */ }
    return { status: res.status, body: parsed }
  } finally {
    clearTimeout(timer)
  }
}

function fakeFile(bytes: number, name: string, type: string) {
  const fd = new FormData()
  fd.append('file', new Blob([new Uint8Array(bytes)], { type }), name)
  return fd
}

async function runCandidate(pin: string, index: number) {
  const ip = ipFor(index)

  const pinRes = await timed('by-pin', () => req(`/api/sessions/by-pin/${pin}`, ip))
  const token = pinRes?.body?.data?.token
  if (!token) return // can't proceed without a token — already recorded as a failure

  const startRes = await timed('start', () => req('/api/sessions/start', ip, { method: 'POST', json: { token } }))
  const sessionId = startRes?.body?.data?.sessionId
  if (!sessionId) return

  const qRes = await timed('questions', () => req(`/api/sessions/${sessionId}/questions?token=${token}`, ip))
  const sections = qRes?.body?.data?.sections ?? []
  const allQuestions = sections.flatMap((s: any) => s.questions ?? [])

  // A couple of heartbeats, spaced out slightly (compressed vs. the real 30s interval)
  for (let h = 0; h < 2; h++) {
    await timed('heartbeat', () => req(`/api/sessions/${sessionId}/heartbeat`, ip, { method: 'POST', json: { token } }))
    await new Promise(r => setTimeout(r, 50))
  }

  for (const q of allQuestions) {
    if (q.question.type === 'MCQ_SINGLE') {
      const optionId = q.question.options?.[1]?.id ?? q.question.options?.[0]?.id
      await timed('mcq-save', () => req(`/api/sessions/${sessionId}/answers`, ip, {
        method: 'POST', json: { token, questionId: q.questionId, selectedOptions: optionId ? [optionId] : [] },
      }))
    } else if (q.question.type === 'AUDIO_RECORDING') {
      await timed('audio-upload', () => req(`/api/sessions/${sessionId}/answers/${q.questionId}/media?token=${token}`, ip, {
        method: 'POST', body: fakeFile(8_000, 'answer.webm', 'audio/webm') as any,
      }))
    }
  }

  await timed('snapshot', () => req(`/api/proctoring/${sessionId}/snapshot?token=${token}`, ip, {
    method: 'POST', body: fakeFile(4_000, 'snap.jpg', 'image/jpeg') as any,
  }))
  await timed('event', () => req(`/api/proctoring/${sessionId}/events`, ip, {
    method: 'POST', json: { token, events: [{ type: 'TAB_SWITCH', occurredAt: new Date().toISOString() }] },
  }))

  await timed('submit', () => req(`/api/sessions/${sessionId}/submit`, ip, { method: 'POST', json: { token } }))
}

async function pool<T>(items: T[], concurrency: number, worker: (item: T, i: number) => Promise<void>) {
  let cursor = 0
  const runners = Array.from({ length: concurrency }, async () => {
    while (cursor < items.length) {
      const i = cursor++
      await worker(items[i], i)
    }
  })
  await Promise.all(runners)
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]
}

async function main() {
  const invitations: { token: string; pin: string }[] = JSON.parse(await readFile(IN_FILE, 'utf-8'))
  console.log(`Loaded ${invitations.length} invitations. Running with concurrency=${CONCURRENCY}, shared across ${SHARED_IPS} IP(s)...`)

  const preHealth = await fetch(`${BASE_URL}/health`).then(r => r.status).catch(() => 0)
  console.log(`Pre-run health check: ${preHealth}`)

  const t0 = Date.now()
  await pool(invitations, CONCURRENCY, (inv, i) => runCandidate(inv.pin, i))
  const totalMs = Date.now() - t0

  const postHealth = await fetch(`${BASE_URL}/health`).then(r => r.status).catch(() => 0)

  // ── Report ────────────────────────────────────────────────────────────────
  console.log(`\n${'='.repeat(70)}`)
  console.log(`LOAD TEST REPORT — ${invitations.length} candidates, ${totalMs}ms total, ${SHARED_IPS} shared IP(s)`)
  console.log('='.repeat(70))

  const steps: StepName[] = ['by-pin', 'start', 'questions', 'heartbeat', 'mcq-save', 'audio-upload', 'snapshot', 'event', 'submit']
  let total429 = 0, total5xx = 0, totalFail = 0

  for (const step of steps) {
    const stepResults = results.filter(r => r.step === step)
    if (stepResults.length === 0) continue
    const ok = stepResults.filter(r => r.ok).length
    const failed = stepResults.filter(r => !r.ok)
    const n429 = failed.filter(r => r.status === 429).length
    const n5xx = failed.filter(r => r.status >= 500).length
    total429 += n429; total5xx += n5xx; totalFail += failed.length
    const times = stepResults.map(r => r.ms).sort((a, b) => a - b)
    console.log(
      `${step.padEnd(14)} ${String(ok).padStart(5)}/${String(stepResults.length).padEnd(5)} ok` +
      `  |  429s: ${String(n429).padStart(3)}  5xx: ${String(n5xx).padStart(3)}` +
      `  |  p50=${percentile(times, 50)}ms p95=${percentile(times, 95)}ms p99=${percentile(times, 99)}ms`
    )
  }

  console.log('='.repeat(70))
  console.log(`Total requests: ${results.length}  |  Total failures: ${totalFail}  |  429s: ${total429}  |  5xx: ${total5xx}`)
  console.log(`Server health — before: ${preHealth}, after: ${postHealth} ${postHealth === 200 ? '(survived — no crash)' : '(!!! SERVER DID NOT RECOVER — investigate)'}`)
  console.log('='.repeat(70))

  if (total5xx > 0 || postHealth !== 200) process.exitCode = 1
}

main().catch(e => { console.error('❌ loadtest-run failed:', e); process.exit(1) })
