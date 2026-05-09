import { describe, it, expect } from 'vitest'

// Test the heuristic grading logic
function heuristicGrade(text: string, maxPoints: number): { pointsEarned: number; feedback: string; confidence: number } {
  const wordCount = text.trim().split(/\s+/).length
  let ratio = 0
  if (wordCount >= 100) ratio = 0.9
  else if (wordCount >= 50) ratio = 0.7
  else if (wordCount >= 20) ratio = 0.5
  else if (wordCount >= 5) ratio = 0.3
  else ratio = 0.1

  return {
    pointsEarned: Math.round(maxPoints * ratio * 10) / 10,
    feedback: `Heuristic grade based on response length (${wordCount} words).`,
    confidence: 0.4,
  }
}

describe('heuristicGrade', () => {
  it('gives low score for very short response', () => {
    const result = heuristicGrade('Yes', 10)
    expect(result.pointsEarned).toBe(1) // 0.1 * 10
    expect(result.confidence).toBe(0.4)
  })

  it('gives 30% for 5-19 word response', () => {
    const text = 'This is a short but valid answer with some content.'
    const result = heuristicGrade(text, 10)
    expect(result.pointsEarned).toBe(3) // 0.3 * 10
  })

  it('gives 50% for 20-49 word response', () => {
    const text = Array(25).fill('word').join(' ')
    const result = heuristicGrade(text, 10)
    expect(result.pointsEarned).toBe(5)
  })

  it('gives 70% for 50-99 word response', () => {
    const text = Array(60).fill('word').join(' ')
    const result = heuristicGrade(text, 10)
    expect(result.pointsEarned).toBe(7)
  })

  it('gives 90% for 100+ word response', () => {
    const text = Array(110).fill('word').join(' ')
    const result = heuristicGrade(text, 10)
    expect(result.pointsEarned).toBe(9)
  })

  it('scales with maxPoints correctly', () => {
    const text = Array(110).fill('word').join(' ')
    const result = heuristicGrade(text, 20)
    expect(result.pointsEarned).toBe(18) // 0.9 * 20
  })

  it('includes word count in feedback', () => {
    const result = heuristicGrade('hello world', 5)
    expect(result.feedback).toContain('2 words')
  })
})
