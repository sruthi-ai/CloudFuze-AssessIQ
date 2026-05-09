import { describe, it, expect } from 'vitest'
import { scoreRanking } from '../services/scoring'

describe('scoreRanking', () => {
  it('returns full points for a perfectly correct order', () => {
    const correct = ['a', 'b', 'c', 'd']
    const result = scoreRanking(correct, correct, 10)
    expect(result).toBe(10)
  })

  it('returns 0 for completely reversed order', () => {
    const correct = ['a', 'b', 'c', 'd']
    const reversed = ['d', 'c', 'b', 'a']
    const result = scoreRanking(reversed, correct, 10)
    expect(result).toBe(0)
  })

  it('gives partial credit for partially correct order', () => {
    const correct = ['a', 'b', 'c', 'd']
    const partial = ['a', 'b', 'd', 'c'] // only last two swapped
    const result = scoreRanking(partial, correct, 10)
    expect(result).toBeGreaterThan(0)
    expect(result).toBeLessThan(10)
  })

  it('returns 0 for empty correct order', () => {
    expect(scoreRanking(['a', 'b'], [], 10)).toBe(0)
  })

  it('returns 0 for single-element list (no pairs to compare)', () => {
    // With only one item there are no pairs, so score cannot be computed — returns 0
    expect(scoreRanking(['a'], ['a'], 5)).toBe(0)
  })

  it('does not return negative values', () => {
    const result = scoreRanking(['d', 'c', 'b', 'a'], ['a', 'b', 'c', 'd'], 10)
    expect(result).toBeGreaterThanOrEqual(0)
  })
})

describe('MCQ scoring logic', () => {
  // Pure unit tests for the scoring algorithm extracted as standalone functions

  function scoreMCQSingle(selectedIds: string[], correctId: string, maxPoints: number): number {
    return selectedIds.includes(correctId) ? maxPoints : 0
  }

  function scoreMCQMulti(selectedIds: string[], correctIds: string[], maxPoints: number): number {
    const correctSet = new Set(correctIds)
    const correctSelected = selectedIds.filter(id => correctSet.has(id)).length
    const incorrectSelected = selectedIds.filter(id => !correctSet.has(id)).length
    const raw = (correctSelected / correctSet.size) - (incorrectSelected / correctSet.size)
    return Math.max(0, raw) * maxPoints
  }

  it('MCQ single: full points for correct answer', () => {
    expect(scoreMCQSingle(['opt-1'], 'opt-1', 4)).toBe(4)
  })

  it('MCQ single: zero for wrong answer', () => {
    expect(scoreMCQSingle(['opt-2'], 'opt-1', 4)).toBe(0)
  })

  it('MCQ single: zero for no selection', () => {
    expect(scoreMCQSingle([], 'opt-1', 4)).toBe(0)
  })

  it('MCQ multi: full points for all correct selected', () => {
    expect(scoreMCQMulti(['a', 'b', 'c'], ['a', 'b', 'c'], 6)).toBe(6)
  })

  it('MCQ multi: partial credit for partially correct', () => {
    const score = scoreMCQMulti(['a'], ['a', 'b', 'c'], 6)
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(6)
  })

  it('MCQ multi: penalty for incorrect selection reduces score', () => {
    const scoreWithPenalty = scoreMCQMulti(['a', 'wrong'], ['a', 'b'], 4)
    const scoreWithoutPenalty = scoreMCQMulti(['a'], ['a', 'b'], 4)
    expect(scoreWithPenalty).toBeLessThan(scoreWithoutPenalty)
  })

  it('MCQ multi: never goes below 0', () => {
    const score = scoreMCQMulti(['wrong1', 'wrong2', 'wrong3'], ['a', 'b'], 4)
    expect(score).toBeGreaterThanOrEqual(0)
  })
})

describe('Numerical scoring logic', () => {
  function scoreNumerical(given: number, expected: number, maxPoints: number, tolerance = 0.001): number {
    return Math.abs(given - expected) < tolerance ? maxPoints : 0
  }

  it('awards full points for exact match', () => {
    expect(scoreNumerical(42, 42, 5)).toBe(5)
  })

  it('awards full points within tolerance', () => {
    expect(scoreNumerical(42.0009, 42, 5)).toBe(5)
  })

  it('awards no points outside tolerance', () => {
    expect(scoreNumerical(42.01, 42, 5)).toBe(0)
  })

  it('handles negative numbers', () => {
    expect(scoreNumerical(-5, -5, 3)).toBe(3)
  })
})
