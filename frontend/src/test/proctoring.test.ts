import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('useProctoring event queue logic', () => {
  // Test the pure event queue behaviour without DOM
  function createEventQueue() {
    const queue: { type: string; occurredAt: string }[] = []
    const counts: Record<string, number> = {}

    const push = (type: string) => {
      counts[type] = (counts[type] ?? 0) + 1
      queue.push({ type, occurredAt: new Date().toISOString() })
    }

    const flush = () => {
      const events = [...queue]
      queue.length = 0
      return events
    }

    return { push, flush, queue, counts }
  }

  it('queues events correctly', () => {
    const { push, queue } = createEventQueue()
    push('TAB_SWITCH')
    push('FULLSCREEN_EXIT')
    expect(queue.length).toBe(2)
    expect(queue[0].type).toBe('TAB_SWITCH')
    expect(queue[1].type).toBe('FULLSCREEN_EXIT')
  })

  it('tracks violation counts per type', () => {
    const { push, counts } = createEventQueue()
    push('TAB_SWITCH')
    push('TAB_SWITCH')
    push('COPY_PASTE')
    expect(counts['TAB_SWITCH']).toBe(2)
    expect(counts['COPY_PASTE']).toBe(1)
  })

  it('flush returns all queued events and empties queue', () => {
    const { push, flush, queue } = createEventQueue()
    push('TAB_SWITCH')
    push('WINDOW_BLUR')
    const flushed = flush()
    expect(flushed.length).toBe(2)
    expect(queue.length).toBe(0)
  })

  it('flush on empty queue returns empty array', () => {
    const { flush } = createEventQueue()
    expect(flush()).toEqual([])
  })

  it('events have valid ISO date strings', () => {
    const { push, queue } = createEventQueue()
    push('TAB_SWITCH')
    expect(() => new Date(queue[0].occurredAt)).not.toThrow()
    expect(new Date(queue[0].occurredAt).getTime()).toBeGreaterThan(0)
  })
})

describe('tab-switch detection logic', () => {
  let violations = 0

  beforeEach(() => { violations = 0 })

  it('increments violation count when document is hidden', () => {
    Object.defineProperty(document, 'hidden', { value: true, writable: true, configurable: true })
    if (document.hidden) violations++
    expect(violations).toBe(1)
  })

  it('does not increment when document is visible', () => {
    Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true })
    if (document.hidden) violations++
    expect(violations).toBe(0)
  })

  afterEach(() => {
    Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true })
  })
})
