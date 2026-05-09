import { describe, it, expect } from 'vitest'

// Extracted pure function from proctoring route
function calculateRiskScore(events: { severity: string }[]): number {
  const weights = { CRITICAL: 30, HIGH: 15, MEDIUM: 5, LOW: 1 }
  const raw = events.reduce((sum, e) => sum + (weights[e.severity as keyof typeof weights] ?? 0), 0)
  return Math.min(100, raw)
}

describe('calculateRiskScore', () => {
  it('returns 0 for no events', () => {
    expect(calculateRiskScore([])).toBe(0)
  })

  it('scores CRITICAL events at 30 each', () => {
    expect(calculateRiskScore([{ severity: 'CRITICAL' }])).toBe(30)
    expect(calculateRiskScore([{ severity: 'CRITICAL' }, { severity: 'CRITICAL' }])).toBe(60)
  })

  it('scores HIGH events at 15 each', () => {
    expect(calculateRiskScore([{ severity: 'HIGH' }])).toBe(15)
  })

  it('scores MEDIUM events at 5 each', () => {
    expect(calculateRiskScore([{ severity: 'MEDIUM' }])).toBe(5)
  })

  it('scores LOW events at 1 each', () => {
    expect(calculateRiskScore([{ severity: 'LOW' }])).toBe(1)
  })

  it('caps score at 100', () => {
    const events = Array(5).fill({ severity: 'CRITICAL' }) // 5 * 30 = 150
    expect(calculateRiskScore(events)).toBe(100)
  })

  it('aggregates mixed severity events', () => {
    const events = [
      { severity: 'CRITICAL' }, // 30
      { severity: 'HIGH' },     // 15
      { severity: 'LOW' },      // 1
    ]
    expect(calculateRiskScore(events)).toBe(46)
  })
})
