import { describe, it, expect } from 'vitest'

// Mirror scoring logic for frontend tests
function scoreRanking(selectedOrder: string[], correctOrder: string[], maxPoints: number): number {
  if (correctOrder.length === 0) return 0
  let correctPairs = 0
  let totalPairs = 0
  for (let i = 0; i < correctOrder.length; i++) {
    for (let j = i + 1; j < correctOrder.length; j++) {
      totalPairs++
      const selI = selectedOrder.indexOf(correctOrder[i])
      const selJ = selectedOrder.indexOf(correctOrder[j])
      if (selI !== -1 && selJ !== -1 && selI < selJ) correctPairs++
    }
  }
  return totalPairs > 0 ? (correctPairs / totalPairs) * maxPoints : 0
}

describe('scoreRanking (frontend)', () => {
  it('returns maxPoints for perfect match', () => {
    expect(scoreRanking(['a', 'b', 'c'], ['a', 'b', 'c'], 10)).toBe(10)
  })

  it('returns 0 for fully reversed order', () => {
    expect(scoreRanking(['c', 'b', 'a'], ['a', 'b', 'c'], 10)).toBe(0)
  })

  it('returns 0 for empty correct order', () => {
    expect(scoreRanking(['a'], [], 10)).toBe(0)
  })

  it('gives partial credit', () => {
    const score = scoreRanking(['a', 'c', 'b'], ['a', 'b', 'c'], 10)
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(10)
  })
})

describe('formatSeconds utility', () => {
  function formatSeconds(s: number): string {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  it('formats 0 as 00:00', () => {
    expect(formatSeconds(0)).toBe('00:00')
  })

  it('formats 90 seconds as 01:30', () => {
    expect(formatSeconds(90)).toBe('01:30')
  })

  it('formats 3600 as 60:00', () => {
    expect(formatSeconds(3600)).toBe('60:00')
  })

  it('pads single digit seconds', () => {
    expect(formatSeconds(65)).toBe('01:05')
  })
})

describe('answer state utilities', () => {
  function isAnswered(answer: {
    selectedOptions: string[]; responseText: string; numericValue: string; codeSubmission: string
  }): boolean {
    return (
      answer.selectedOptions.length > 0 ||
      answer.responseText.trim().length > 0 ||
      answer.numericValue.trim().length > 0 ||
      answer.codeSubmission.trim().length > 0
    )
  }

  it('returns false for empty answer', () => {
    expect(isAnswered({ selectedOptions: [], responseText: '', numericValue: '', codeSubmission: '' })).toBe(false)
  })

  it('returns true when option is selected', () => {
    expect(isAnswered({ selectedOptions: ['opt-1'], responseText: '', numericValue: '', codeSubmission: '' })).toBe(true)
  })

  it('returns true when response text is provided', () => {
    expect(isAnswered({ selectedOptions: [], responseText: 'My answer', numericValue: '', codeSubmission: '' })).toBe(true)
  })

  it('returns true when numeric value is provided', () => {
    expect(isAnswered({ selectedOptions: [], responseText: '', numericValue: '42', codeSubmission: '' })).toBe(true)
  })

  it('returns true when code is provided', () => {
    expect(isAnswered({ selectedOptions: [], responseText: '', numericValue: '', codeSubmission: 'print("hi")' })).toBe(true)
  })

  it('treats whitespace-only response as unanswered', () => {
    expect(isAnswered({ selectedOptions: [], responseText: '   ', numericValue: '', codeSubmission: '' })).toBe(false)
  })
})
