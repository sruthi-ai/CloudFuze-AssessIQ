import { describe, it, expect } from 'vitest'

// Test the candidate line-parsing logic mirrored from the frontend
function parseCandidateLine(line: string): { email: string; firstName: string; lastName: string } {
  const parts = line.split(',').map(s => s.trim())
  const email = parts[0] ?? ''
  let firstName = parts[1] ?? ''
  let lastName = parts[2] ?? ''
  if (!firstName) {
    const localPart = email.split('@')[0] ?? 'Candidate'
    const nameParts = localPart.replace(/[._-]/g, ' ').split(' ').filter(Boolean)
    firstName = nameParts[0] ? nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1) : 'Candidate'
    lastName = nameParts[1] ? nameParts[1].charAt(0).toUpperCase() + nameParts[1].slice(1) : ''
  }
  return { email, firstName, lastName }
}

describe('parseCandidateLine', () => {
  it('parses full format: email, firstName, lastName', () => {
    const result = parseCandidateLine('jane@example.com, Jane, Smith')
    expect(result).toEqual({ email: 'jane@example.com', firstName: 'Jane', lastName: 'Smith' })
  })

  it('auto-derives name from simple email local part', () => {
    const result = parseCandidateLine('sruthi@cloudfuze.com')
    expect(result.email).toBe('sruthi@cloudfuze.com')
    expect(result.firstName).toBe('Sruthi')
    expect(result.lastName).toBe('')
  })

  it('splits dot-separated local part into first/last', () => {
    const result = parseCandidateLine('john.doe@company.com')
    expect(result.firstName).toBe('John')
    expect(result.lastName).toBe('Doe')
  })

  it('splits underscore-separated local part', () => {
    const result = parseCandidateLine('alice_wonder@test.com')
    expect(result.firstName).toBe('Alice')
    expect(result.lastName).toBe('Wonder')
  })

  it('handles dash-separated local part', () => {
    const result = parseCandidateLine('bob-marley@music.com')
    expect(result.firstName).toBe('Bob')
    expect(result.lastName).toBe('Marley')
  })

  it('falls back to Candidate for empty email local part', () => {
    const result = parseCandidateLine('@broken.com')
    expect(result.firstName).toBe('Candidate')
  })

  it('trims whitespace from all fields', () => {
    const result = parseCandidateLine('  test@a.com ,  Alice ,  Bob  ')
    expect(result.email).toBe('test@a.com')
    expect(result.firstName).toBe('Alice')
    expect(result.lastName).toBe('Bob')
  })
})

describe('invite validation logic', () => {
  function validateInviteForm(testId: string, candidateLines: string): string | null {
    if (!testId) return 'Please select a test'
    const lines = candidateLines.trim().split('\n').filter(l => l.trim())
    if (lines.length === 0) return 'Please enter at least one candidate'
    for (const line of lines) {
      const email = line.split(',')[0].trim()
      if (!email.includes('@')) return `Invalid email: ${email}`
    }
    return null // valid
  }

  it('returns error when no test selected', () => {
    expect(validateInviteForm('', 'test@example.com')).toBe('Please select a test')
  })

  it('returns error when no candidates entered', () => {
    expect(validateInviteForm('test-id', '')).toBe('Please enter at least one candidate')
  })

  it('returns error for invalid email format', () => {
    const result = validateInviteForm('test-id', 'notanemail')
    expect(result).toContain('Invalid email')
  })

  it('returns null for valid input', () => {
    expect(validateInviteForm('test-id', 'valid@example.com')).toBeNull()
  })

  it('validates multiple lines', () => {
    const lines = 'good@test.com\nbademail\nanother@test.com'
    const result = validateInviteForm('test-id', lines)
    expect(result).toContain('Invalid email')
  })
})
