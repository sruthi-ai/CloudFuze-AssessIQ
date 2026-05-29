import { describe, it, expect } from 'vitest'
import { z } from 'zod'

// Mirror of createTestSchema in routes/tests.ts — keep in sync
const createTestSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  instructions: z.string().optional(),
  domain: z.string().optional(),
  duration: z.coerce.number().int().min(1),
  passingScore: z.coerce.number().min(0).max(100).optional(),
  shuffleQuestions: z.boolean().optional(),
  shuffleOptions: z.boolean().optional(),
  showResults: z.boolean().optional(),
  allowedAttempts: z.coerce.number().int().min(1).optional(),
  proctoring: z.boolean().optional(),
  roomScanEnabled: z.boolean().optional(),
  roomScanIntervalMins: z.coerce.number().int().min(1).max(120).optional(),
  requireIdVerification: z.boolean().optional(),
  requireSecureBrowser: z.boolean().optional(),
  allowedIPs: z.array(z.string()).optional().nullable(),
  negativeMarking: z.coerce.number().min(0).max(1).optional().nullable(),
  openAt: z.string().datetime().optional().nullable(),
  closeAt: z.string().datetime().optional().nullable(),
})

describe('createTestSchema', () => {
  const base = { title: 'Test', duration: 60 }

  it('accepts a valid minimal payload', () => {
    expect(createTestSchema.safeParse(base).success).toBe(true)
  })

  it('accepts roomScanIntervalMins as a number', () => {
    const r = createTestSchema.safeParse({ ...base, roomScanIntervalMins: 5 })
    expect(r.success).toBe(true)
  })

  it('accepts roomScanIntervalMins as a string (HTML input sends strings)', () => {
    const r = createTestSchema.safeParse({ ...base, roomScanIntervalMins: '3' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.roomScanIntervalMins).toBe(3)
  })

  it('accepts roomScanIntervalMins of 1 (minimum)', () => {
    expect(createTestSchema.safeParse({ ...base, roomScanIntervalMins: 1 }).success).toBe(true)
  })

  it('rejects roomScanIntervalMins of 0', () => {
    expect(createTestSchema.safeParse({ ...base, roomScanIntervalMins: 0 }).success).toBe(false)
  })

  it('rejects roomScanIntervalMins above 120', () => {
    expect(createTestSchema.safeParse({ ...base, roomScanIntervalMins: 121 }).success).toBe(false)
  })

  it('accepts duration as a string (coerced)', () => {
    const r = createTestSchema.safeParse({ title: 'Test', duration: '60' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.duration).toBe(60)
  })

  it('rejects duration of 0', () => {
    expect(createTestSchema.safeParse({ title: 'Test', duration: 0 }).success).toBe(false)
  })

  it('accepts passingScore as a string', () => {
    const r = createTestSchema.safeParse({ ...base, passingScore: '75' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.passingScore).toBe(75)
  })

  it('rejects passingScore above 100', () => {
    expect(createTestSchema.safeParse({ ...base, passingScore: 101 }).success).toBe(false)
  })

  it('accepts negativeMarking as a string', () => {
    const r = createTestSchema.safeParse({ ...base, negativeMarking: '0.25' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.negativeMarking).toBe(0.25)
  })

  it('accepts negativeMarking: null', () => {
    expect(createTestSchema.safeParse({ ...base, negativeMarking: null }).success).toBe(true)
  })

  it('rejects negativeMarking above 1', () => {
    expect(createTestSchema.safeParse({ ...base, negativeMarking: 1.1 }).success).toBe(false)
  })

  it('accepts allowedIPs as null (clear restrictions)', () => {
    expect(createTestSchema.safeParse({ ...base, allowedIPs: null }).success).toBe(true)
  })

  it('accepts allowedIPs as an array of strings', () => {
    const r = createTestSchema.safeParse({ ...base, allowedIPs: ['10.0.0.1', '192.168.1.0/24'] })
    expect(r.success).toBe(true)
  })

  it('partial schema (PATCH) accepts only changed fields', () => {
    const partial = createTestSchema.partial()
    expect(partial.safeParse({ roomScanIntervalMins: '2' }).success).toBe(true)
    expect(partial.safeParse({ passingScore: '80' }).success).toBe(true)
  })
})
