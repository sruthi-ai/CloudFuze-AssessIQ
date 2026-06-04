import { FastifyInstance } from 'fastify'
import { SAML } from '@node-saml/node-saml'
import { createHmac } from 'crypto'
import { prisma } from '../db'
import { sendError } from '../utils/errors'
import type { JWTPayload } from '../types'

const STATE_SECRET = process.env.JWT_SECRET ?? 'dev-secret'
function signState(data: string): string {
  return createHmac('sha256', STATE_SECRET).update(data).digest('hex').slice(0, 16)
}
function buildState(slug: string, nonce: string): string {
  const payload = JSON.stringify({ slug, n: nonce })
  const sig = signState(payload)
  return Buffer.from(JSON.stringify({ slug, n: nonce, sig })).toString('base64url')
}
function verifyState(state: string): string | null {
  try {
    const obj = JSON.parse(Buffer.from(state, 'base64url').toString()) as { slug: string; n: string; sig: string }
    const expected = signState(JSON.stringify({ slug: obj.slug, n: obj.n }))
    if (obj.sig !== expected) return null
    return obj.slug
  } catch { return null }
}

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001'

function buildSaml(settings: Record<string, unknown>, tenantSlug: string) {
  const rawCert = settings.samlIdpCert as string ?? ''
  const cert = rawCert
    .replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----/g, '')
    .replace(/\s+/g, '')
  return new SAML({
    entryPoint: settings.samlEntryPoint as string,
    issuer: (settings.samlIssuer as string) || `${BACKEND_URL}/api/sso/${tenantSlug}`,
    idpCert: cert,
    callbackUrl: `${BACKEND_URL}/api/sso/callback`,
    wantAuthnResponseSigned: false,
    wantAssertionsSigned: true,
    disableRequestedAuthnContext: true,
  })
}

function extractAttr(profile: Record<string, unknown>, attrName: string): string {
  const val = profile[attrName] ?? (profile.attributes as Record<string, unknown> | undefined)?.[attrName]
  if (!val) return ''
  return Array.isArray(val) ? String(val[0] ?? '') : String(val)
}

export async function ssoRoutes(server: FastifyInstance) {
  // Parse SAML callbacks (application/x-www-form-urlencoded posted by IdP)
  server.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
    try {
      const result: Record<string, string> = {}
      new URLSearchParams(body as string).forEach((v, k) => { result[k] = v })
      done(null, result)
    } catch (err) {
      done(err as Error)
    }
  })

  // GET /api/sso/metadata?tenant=slug — download SP metadata for IdP configuration
  server.get('/metadata', async (request, reply) => {
    const { tenant: slug } = request.query as { tenant?: string }
    if (!slug) return sendError(reply, 400, 'tenant slug required')

    const row = await prisma.tenant.findUnique({ where: { slug }, select: { settings: true } })
    if (!row) return sendError(reply, 404, 'Tenant not found')

    const s = (row.settings as Record<string, unknown>) ?? {}
    if (!s.ssoEnabled) return sendError(reply, 400, 'SSO not enabled for this tenant')
    if (!s.samlEntryPoint || !s.samlIdpCert) return sendError(reply, 400, 'SSO not fully configured')

    const xml = buildSaml(s, slug).generateServiceProviderMetadata(null, null)
    return reply.type('text/xml').send(xml)
  })

  // GET /api/sso/login?tenant=slug — initiate SAML redirect to IdP
  server.get('/login', async (request, reply) => {
    const { tenant: slug } = request.query as { tenant?: string }
    if (!slug) return sendError(reply, 400, 'tenant slug required')

    const row = await prisma.tenant.findUnique({ where: { slug }, select: { settings: true } })
    if (!row) return sendError(reply, 404, 'Tenant not found')

    const s = (row.settings as Record<string, unknown>) ?? {}
    if (!s.ssoEnabled) return sendError(reply, 400, 'SSO not enabled for this tenant')
    if (!s.samlEntryPoint || !s.samlIdpCert) return sendError(reply, 400, 'SSO not configured — contact your admin')

    try {
      const redirectUrl = await buildSaml(s, slug).getAuthorizeUrlAsync(slug, request.headers.host ?? '', {})
      return reply.redirect(redirectUrl)
    } catch (err: any) {
      return sendError(reply, 500, `SSO initiation failed: ${err.message}`)
    }
  })

  // ── Microsoft OIDC (OAuth 2.0 / Entra ID) ────────────────────────────────────

  // GET /api/sso/microsoft/login?tenant=slug — redirect to Microsoft login
  server.get('/microsoft/login', async (request, reply) => {
    const { tenant: slug } = request.query as { tenant?: string }
    if (!slug) return sendError(reply, 400, 'tenant slug required')

    const tenantId = process.env.AZURE_TENANT_ID
    const clientId = process.env.AZURE_CLIENT_ID
    if (!tenantId || !clientId) {
      return sendError(reply, 503, 'Microsoft SSO is not configured on this server — set AZURE_TENANT_ID and AZURE_CLIENT_ID')
    }

    const row = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, settings: true } })
    if (!row) return sendError(reply, 404, 'Tenant not found')

    const s = (row.settings as Record<string, unknown>) ?? {}
    if (!s.microsoftSsoEnabled) return sendError(reply, 400, 'Microsoft SSO is not enabled for this workspace')

    const redirectUri = `${BACKEND_URL}/api/sso/microsoft/callback`
    const state = buildState(slug, Math.random().toString(36).slice(2))

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: 'openid profile email',
      state,
      response_mode: 'query',
    })

    return reply.redirect(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params}`)
  })

  // GET /api/sso/microsoft/callback — Microsoft posts code here after login
  server.get('/microsoft/callback', async (request, reply) => {
    const { code, state, error: oauthError } = request.query as { code?: string; state?: string; error?: string }

    if (oauthError) return reply.redirect(`${FRONTEND_URL}/login?error=sso_failed`)
    if (!code || !state) return reply.redirect(`${FRONTEND_URL}/login?error=sso_missing_relay`)

    const slug = verifyState(state)
    if (!slug) return reply.redirect(`${FRONTEND_URL}/login?error=sso_failed`)

    const row = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, slug: true, settings: true } })
    if (!row) return reply.redirect(`${FRONTEND_URL}/login?error=tenant_not_found`)

    const s = (row.settings as Record<string, unknown>) ?? {}
    if (!s.microsoftSsoEnabled) return reply.redirect(`${FRONTEND_URL}/login?error=sso_not_configured`)

    const azureTenantId = process.env.AZURE_TENANT_ID!
    const clientId = process.env.AZURE_CLIENT_ID!
    const clientSecret = process.env.AZURE_CLIENT_SECRET!
    const redirectUri = `${BACKEND_URL}/api/sso/microsoft/callback`

    try {
      // Exchange authorisation code for tokens
      const tokenRes = await fetch(`https://login.microsoftonline.com/${azureTenantId}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          scope: 'openid profile email',
        }),
      })

      if (!tokenRes.ok) {
        server.log.error(`Microsoft token exchange failed: ${await tokenRes.text()}`)
        return reply.redirect(`${FRONTEND_URL}/login?error=sso_failed`)
      }

      const tokens = await tokenRes.json() as { id_token?: string }
      if (!tokens.id_token) return reply.redirect(`${FRONTEND_URL}/login?error=sso_failed`)

      // Decode ID token payload — trusted because it came directly from Microsoft over HTTPS
      const [, payloadB64] = tokens.id_token.split('.')
      const idp = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as {
        email?: string; preferred_username?: string
        given_name?: string; family_name?: string; name?: string
      }

      const email = (idp.email || idp.preferred_username || '').toLowerCase()
      if (!email || !email.includes('@')) return reply.redirect(`${FRONTEND_URL}/login?error=sso_no_email`)

      let user = await prisma.user.findFirst({
        where: { email, tenantId: row.id },
        select: { id: true, email: true, firstName: true, lastName: true, role: true, tenantId: true, isActive: true },
      })

      if (!user && s.samlAutoProvision) {
        const defaultRole = (s.samlDefaultRole as string) || 'VIEWER'
        const parts = (idp.name || email.split('@')[0]).split(' ')
        user = await prisma.user.create({
          data: {
            email,
            firstName: idp.given_name || parts[0],
            lastName: idp.family_name || parts.slice(1).join(' '),
            role: defaultRole as any,
            tenantId: row.id,
            passwordHash: '',
          },
          select: { id: true, email: true, firstName: true, lastName: true, role: true, tenantId: true, isActive: true },
        })
      }

      if (!user) return reply.redirect(`${FRONTEND_URL}/login?error=user_not_found`)
      if (!user.isActive) return reply.redirect(`${FRONTEND_URL}/login?error=account_disabled`)

      const payload: JWTPayload = {
        sub: user.id, email: user.email, role: user.role,
        tenantId: user.tenantId, tenantSlug: row.slug,
      }

      const accessToken = server.jwt.sign(payload, { expiresIn: process.env.JWT_EXPIRES_IN || '15m' })
      const refreshToken = server.jwt.sign({ sub: user.id } as any, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' })

      await prisma.refreshToken.create({
        data: { token: refreshToken, userId: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
      })

      await prisma.auditLog.create({
        data: {
          action: 'SSO_LOGIN',
          entityType: 'user',
          entityId: user.id,
          metadata: { email: user.email, provider: 'microsoft', tenantSlug: row.slug },
          tenantId: row.id,
          userId: user.id,
        },
      }).catch(() => {})

      return reply.redirect(`${FRONTEND_URL}/sso/callback?token=${encodeURIComponent(accessToken)}&refresh=${encodeURIComponent(refreshToken)}`)
    } catch (err: any) {
      server.log.error(err)
      return reply.redirect(`${FRONTEND_URL}/login?error=sso_failed`)
    }
  })

  // POST /api/sso/callback — ACS endpoint: IdP posts SAML assertion here
  server.post('/callback', async (request, reply) => {
    const body = request.body as Record<string, string>
    const slug = body.RelayState || ''

    if (!slug) return reply.redirect(`${FRONTEND_URL}/login?error=sso_missing_relay`)

    const row = await prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, slug: true, settings: true },
    })
    if (!row) return reply.redirect(`${FRONTEND_URL}/login?error=tenant_not_found`)

    const s = (row.settings as Record<string, unknown>) ?? {}
    if (!s.ssoEnabled || !s.samlEntryPoint || !s.samlIdpCert) {
      return reply.redirect(`${FRONTEND_URL}/login?error=sso_not_configured`)
    }

    try {
      const { profile } = await buildSaml(s, slug).validatePostResponseAsync(body)
      if (!profile) return reply.redirect(`${FRONTEND_URL}/login?error=sso_invalid_response`)

      const p = profile as unknown as Record<string, unknown>
      const emailAttr = (s.samlEmailAttr as string) || 'email'
      const firstNameAttr = (s.samlFirstNameAttr as string) || 'firstName'
      const lastNameAttr = (s.samlLastNameAttr as string) || 'lastName'

      const email = extractAttr(p, emailAttr) || (typeof profile.nameID === 'string' ? profile.nameID : '')
      if (!email || !email.includes('@')) return reply.redirect(`${FRONTEND_URL}/login?error=sso_no_email`)

      let user = await prisma.user.findFirst({
        where: { email: email.toLowerCase(), tenantId: row.id },
        select: { id: true, email: true, firstName: true, lastName: true, role: true, tenantId: true, isActive: true },
      })

      if (!user && s.samlAutoProvision) {
        const defaultRole = (s.samlDefaultRole as string) || 'VIEWER'
        user = await prisma.user.create({
          data: {
            email: email.toLowerCase(),
            firstName: extractAttr(p, firstNameAttr) || email.split('@')[0],
            lastName: extractAttr(p, lastNameAttr) || '',
            role: defaultRole as any,
            tenantId: row.id,
            passwordHash: '',
          },
          select: { id: true, email: true, firstName: true, lastName: true, role: true, tenantId: true, isActive: true },
        })
      }

      if (!user) return reply.redirect(`${FRONTEND_URL}/login?error=user_not_found`)
      if (!user.isActive) return reply.redirect(`${FRONTEND_URL}/login?error=account_disabled`)

      const payload: JWTPayload = {
        sub: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        tenantSlug: row.slug,
      }

      const accessToken = server.jwt.sign(payload, { expiresIn: process.env.JWT_EXPIRES_IN || '15m' })
      const refreshToken = server.jwt.sign({ sub: user.id } as any, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' })

      await prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      })

      await prisma.auditLog.create({
        data: {
          action: 'SSO_LOGIN',
          entityType: 'user',
          entityId: user.id,
          metadata: { email: user.email, provider: 'saml', tenantSlug: row.slug },
          tenantId: row.id,
          userId: user.id,
        },
      }).catch(() => {})

      const dest = `${FRONTEND_URL}/sso/callback?token=${encodeURIComponent(accessToken)}&refresh=${encodeURIComponent(refreshToken)}`
      return reply.redirect(dest)
    } catch (err: any) {
      server.log.error(err)
      return reply.redirect(`${FRONTEND_URL}/login?error=sso_failed`)
    }
  })
}
