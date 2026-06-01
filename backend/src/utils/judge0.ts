// Code execution via Piston (https://github.com/engineer-man/piston)
// No API key required; point PISTON_URL at a self-hosted instance for production.
export const PISTON_URL = process.env.PISTON_URL || 'https://emkc.org/api/v2/piston'

export const LANG_ID: Record<string, string> = {
  python:     'python',
  javascript: 'javascript',
  typescript: 'typescript',
  java:       'java',
  c:          'c',
  cpp:        'c++',
  go:         'go',
  rust:       'rust',
  csharp:     'csharp',
}

export interface Judge0Result {
  stdout:   string | null
  stderr:   string | null
  status:   string
  statusId: number   // 3 = Accepted (mirrors Judge0 convention used downstream)
  time:     string | null
  memory:   number | null
}

export async function runCode(
  sourceCode: string,
  languageId: string,
  stdin = '',
): Promise<Judge0Result> {
  const res = await fetch(`${PISTON_URL}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language: languageId,
      version: '*',
      files: [{ content: sourceCode }],
      stdin,
      run_timeout: 5000,
      compile_timeout: 10000,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Piston HTTP ${res.status}: ${text}`)
  }

  const data = await res.json() as any
  const compile = data.compile ?? {}
  const run = data.run ?? {}

  // Compile error — show compiler output as stderr
  if (compile.code != null && compile.code !== 0) {
    return {
      stdout: null,
      stderr: compile.stderr || compile.output || 'Compilation failed',
      status: 'Compilation Error',
      statusId: 6,
      time: null,
      memory: null,
    }
  }

  const succeeded = run.code === 0 && !run.signal
  const stderr = run.stderr || null

  return {
    stdout: run.stdout || null,
    stderr,
    status: succeeded
      ? 'Accepted'
      : run.signal
        ? `Runtime Error (${run.signal})`
        : `Runtime Error (exit ${run.code})`,
    statusId: succeeded ? 3 : 4,
    time: null,
    memory: null,
  }
}
