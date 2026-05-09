export const JUDGE0_URL = process.env.JUDGE0_URL || 'https://judge0-ce.p.rapidapi.com'
export const JUDGE0_KEY = process.env.JUDGE0_API_KEY || ''

export const LANG_ID: Record<string, number> = {
  python: 71,       // Python 3.8
  javascript: 63,   // Node.js 12
  typescript: 74,   // TypeScript 3.7
  java: 62,         // Java 13
  c: 50,            // C (GCC 9.2)
  cpp: 54,          // C++ (GCC 9.2)
  go: 60,           // Go 1.13
  rust: 73,         // Rust 1.40
  csharp: 51,       // C# Mono 6.6
}

export interface Judge0Result {
  stdout: string | null
  stderr: string | null
  status: string
  statusId: number
  time: string | null
  memory: number | null
}

export async function runCode(
  sourceCode: string,
  languageId: number,
  stdin = '',
): Promise<Judge0Result> {
  const res = await fetch(`${JUDGE0_URL}/submissions?base64_encoded=false&wait=true`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-RapidAPI-Key': JUDGE0_KEY,
      'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com',
    },
    body: JSON.stringify({
      source_code: sourceCode,
      language_id: languageId,
      stdin,
      cpu_time_limit: 5,
      memory_limit: 128000,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Judge0 HTTP ${res.status}: ${text}`)
  }

  const data = await res.json() as any
  return {
    stdout: data.stdout ?? null,
    stderr: data.stderr ?? data.compile_output ?? null,
    status: data.status?.description ?? 'Unknown',
    statusId: data.status?.id ?? 0,
    time: data.time ?? null,
    memory: data.memory ?? null,
  }
}
