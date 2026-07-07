# Fastify 4 → 5 migration (needed to close the `fast-jwt` CVE)

## Why this exists

`npm audit` flags a CRITICAL advisory in `fast-jwt` (transitive dep of `@fastify/jwt`).
The patched `fast-jwt` line (≥6.2.0) only ships starting at `@fastify/jwt@9.x`, and that
version requires `fastify-plugin@^5.x` — built for Fastify 5, not the Fastify 4 this app
runs. There is no already-patched, still-Fastify-4-compatible version of `@fastify/jwt`.
Closing this properly means migrating the whole backend to Fastify 5, not swapping one
package.

**Practical risk note:** the single scariest bug in the advisory ("JWT auth bypass via
empty HMAC secret accepted by async key resolver") does not apply to this app — `server.ts`
registers `@fastify/jwt` with a static secret string, not an async key resolver. The
ReDoS and cache-key-collision issues in the advisory do apply regardless of config and are
the real reason to do this migration, just not with fire-drill urgency.

## Current → target versions (checked against the npm registry)

| Package | Current | Target | Needs `fastify-plugin` |
|---|---|---|---|
| `fastify` | 4.29.1 | 5.x (latest) | — |
| `fastify-plugin` | 4.5.1 | 5.x | — |
| `@fastify/jwt` | 8.0.1 | 10.1.0 | `^5.0.1` |
| `@fastify/cors` | 9.0.1 | 11.2.0 | `^5.0.0` |
| `@fastify/helmet` | 11.1.1 | 13.0.2 | `^5.0.0` |
| `@fastify/multipart` | 8.3.1 | 10.0.0 | `^5.0.0` |
| `@fastify/rate-limit` | 9.1.0 | 11.1.0 | `^6.0.0` |

All five `@fastify/*` plugins need to move together — Fastify 5 won't load a plugin built
against `fastify-plugin@^4.x`.

## What to check during the migration (not yet investigated in depth)

- **Fastify 5 breaking changes**: read the official migration guide before starting —
  known areas of change in past major bumps include schema validation (`ajv` version),
  logger defaults, and TypeScript type changes. Needs a fresh read against whatever
  Fastify 5.x's actual changelog says at migration time.
- **Every route file** (`backend/src/routes/*.ts`) uses `request`/`reply`/`server` typed
  via Fastify's own types — a major bump commonly shifts generic type parameters or
  default types (e.g. body/params typing). Expect TypeScript compile errors to surface
  real incompatibilities; don't just add `as any` to silence them.
- **`@fastify/multipart`**: this app has several routes doing `await request.file()` and
  `pipeline(data.file, createWriteStream(...))` (`proctoring.ts`, `sessions.ts`) — confirm
  this API is unchanged across the 8.x → 10.x jump; multipart has had API-shape changes
  in past majors.
- **`@fastify/rate-limit`**: jumps two majors (9→11) with a `fastify-plugin` major jump of
  its own (^5 vs ^6 vs the others' ^5) — check its changelog specifically, since the
  per-route `config.rateLimit` overrides used in `auth.ts` need to keep working.
- **`@fastify/jwt`**: re-verify `request.jwtVerify()`, `server.jwt.sign()`,
  `server.jwt.verify()` call signatures are unchanged (used in `middleware/authenticate.ts`,
  `server.ts`, `routes/auth.ts`, `routes/sso.ts`).
- **Full regression pass required after upgrading**: login, refresh, logout, every
  candidate session flow (start/answer/media-upload/submit), proctoring uploads, and the
  full existing test suite (71 backend tests) — a major Fastify bump is exactly the kind
  of change that can pass `tsc` and still break at runtime in subtle ways (e.g. hook
  ordering, error serialization).

## Suggested execution approach when this gets picked up

1. Do this on a branch, not directly on `main` — this is the one item in the whole
   remediation list where "revert if something's wrong" needs to be cheap.
2. Bump all six packages together in one `npm install` (don't try to do it incrementally
   package-by-package; they're interdependent on Fastify 5 as a set).
3. Fix TypeScript errors first — they're the cheapest signal of real incompatibilities.
4. Run the existing test suite, then do a full manual regression pass through the
   candidate exam flow and admin flows in a real browser before merging.
