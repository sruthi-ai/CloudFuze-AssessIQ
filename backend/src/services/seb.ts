import { createHash } from 'crypto'
import type { FastifyRequest } from 'fastify'

/**
 * Safe Exam Browser (SEB) request verification.
 *
 * When "Use Browser & Config Keys (send in HTTP header)" is enabled in a SEB
 * config, SEB adds two headers to every HTTP request:
 *   - X-SafeExamBrowser-ConfigKeyHash  = SHA256(fullRequestURL + ConfigKey)
 *   - X-SafeExamBrowser-RequestHash     = SHA256(fullRequestURL + BrowserExamKey)
 *
 * The server recomputes the hash from the request URL + the key(s) it stored for
 * the exam and compares. A match proves the request came from SEB running our
 * exact config — which a normal browser (or a spoofed User-Agent) cannot forge.
 *
 * Docs: https://safeexambrowser.org/developer/seb-integration.html
 */

export interface SebSettings {
  sebRequired: boolean
  sebConfigKeys: string[]
  sebBrowserExamKeys: string[]
}

// Reconstruct the absolute URL exactly as SEB saw it when it computed the hash.
// Behind nginx/Docker we must trust the X-Forwarded-* headers set by the proxy.
export function reconstructRequestUrl(request: FastifyRequest): string {
  const xfProto = (request.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim()
  const proto = xfProto || request.protocol || 'https'
  const xfHost = (request.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim()
  const host = xfHost || (request.headers['host'] as string | undefined) || ''
  // request.url includes the path + query string
  return `${proto}://${host}${request.url}`
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

// True if any of the keys, hashed with the URL, matches the header value.
function anyKeyMatches(url: string, headerHash: string | undefined, keys: string[]): boolean {
  if (!headerHash || keys.length === 0) return false
  const h = headerHash.trim().toLowerCase()
  return keys.some(k => sha256Hex(url + k.trim()) === h)
}

export interface SebVerifyResult {
  ok: boolean
  reason?: string
}

/**
 * Verify a request against an exam's SEB settings.
 * - Not required            → always ok.
 * - Keys configured         → the corresponding hash header must match one key.
 * - Required, no keys set    → fall back to requiring a SEB header to be present
 *                              (proves SEB, but not our specific config — weaker;
 *                              admins should always set at least the Config Key).
 */
export function verifySeb(request: FastifyRequest, seb: SebSettings): SebVerifyResult {
  if (!seb.sebRequired) return { ok: true }

  const url = reconstructRequestUrl(request)
  const configHash = request.headers['x-safeexambrowser-configkeyhash'] as string | undefined
  const requestHash = request.headers['x-safeexambrowser-requesthash'] as string | undefined

  const hasConfigKeys = seb.sebConfigKeys.length > 0
  const hasBekKeys = seb.sebBrowserExamKeys.length > 0

  if (hasConfigKeys || hasBekKeys) {
    // Each configured key-type that is set must be satisfied.
    if (hasConfigKeys && !anyKeyMatches(url, configHash, seb.sebConfigKeys)) {
      return { ok: false, reason: 'SEB Config Key mismatch — open this exam using the provided Safe Exam Browser config.' }
    }
    if (hasBekKeys && !anyKeyMatches(url, requestHash, seb.sebBrowserExamKeys)) {
      return { ok: false, reason: 'SEB Browser Exam Key mismatch — use the official Safe Exam Browser to take this exam.' }
    }
    return { ok: true }
  }

  // No keys configured: accept only if SEB is clearly present.
  if (configHash || requestHash) return { ok: true }
  return { ok: false, reason: 'This exam must be taken in Safe Exam Browser.' }
}
