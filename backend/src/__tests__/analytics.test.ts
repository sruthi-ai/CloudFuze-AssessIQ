import { describe, it, expect } from 'vitest'

// Analytics utility functions
function getISOWeek(date: Date): string {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

function calcPassRate(passed: number, total: number): number {
  return total > 0 ? Math.round((passed / total) * 100) : 0
}

function calcCompletionRate(completed: number, total: number): number {
  return total > 0 ? Math.round((completed / total) * 100) : 0
}

describe('getISOWeek', () => {
  it('returns the correct ISO week string', () => {
    // 2024-01-01 is week 1 of 2024
    const week = getISOWeek(new Date('2024-01-01'))
    expect(week).toMatch(/^\d{4}-W\d{2}$/)
  })

  it('two dates in the same week return the same string', () => {
    const monday = getISOWeek(new Date('2024-05-06')) // Monday
    const friday = getISOWeek(new Date('2024-05-10')) // Friday same week
    expect(monday).toBe(friday)
  })

  it('two dates in different weeks return different strings', () => {
    const week1 = getISOWeek(new Date('2024-05-06'))
    const week2 = getISOWeek(new Date('2024-05-13'))
    expect(week1).not.toBe(week2)
  })
})

describe('calcPassRate', () => {
  it('returns 0 when total is 0', () => {
    expect(calcPassRate(0, 0)).toBe(0)
  })

  it('returns 100 when all pass', () => {
    expect(calcPassRate(10, 10)).toBe(100)
  })

  it('returns 50 for half passing', () => {
    expect(calcPassRate(5, 10)).toBe(50)
  })

  it('rounds correctly', () => {
    expect(calcPassRate(1, 3)).toBe(33) // 33.33 rounds to 33
  })
})

describe('calcCompletionRate', () => {
  it('returns 0 for no sessions', () => {
    expect(calcCompletionRate(0, 0)).toBe(0)
  })

  it('returns 100 if all completed', () => {
    expect(calcCompletionRate(50, 50)).toBe(100)
  })

  it('calculates partial completion', () => {
    expect(calcCompletionRate(3, 4)).toBe(75)
  })
})

describe('score distribution bucketing', () => {
  function buildDistribution(percentages: number[]) {
    return [0, 10, 20, 30, 40, 50, 60, 70, 80, 90].map(bucket => ({
      range: `${bucket}-${bucket + 9}%`,
      count: percentages.filter(p => p >= bucket && p < bucket + 10).length,
    }))
  }

  it('places scores in correct buckets', () => {
    const dist = buildDistribution([15, 25, 55, 85, 95])
    expect(dist.find(d => d.range === '10-19%')?.count).toBe(1)
    expect(dist.find(d => d.range === '20-29%')?.count).toBe(1)
    expect(dist.find(d => d.range === '50-59%')?.count).toBe(1)
    expect(dist.find(d => d.range === '80-89%')?.count).toBe(1)
    expect(dist.find(d => d.range === '90-99%')?.count).toBe(1)
  })

  it('returns 0 counts for empty buckets', () => {
    const dist = buildDistribution([50])
    const zeroBuckets = dist.filter(d => d.range !== '50-59%')
    expect(zeroBuckets.every(d => d.count === 0)).toBe(true)
  })
})
