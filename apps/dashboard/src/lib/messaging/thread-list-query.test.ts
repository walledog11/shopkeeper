import { describe, it, expect } from 'vitest'
import { encodeThreadCursor, decodeThreadCursor } from './thread-list-query'

describe('thread cursor codec', () => {
  it('round-trips a timestamp and id', () => {
    const lastMessageAt = '2026-03-01T00:00:00.123456Z'
    const id = '3bc35532-7c96-4640-827b-d57b51107d73'
    const decoded = decodeThreadCursor(encodeThreadCursor(lastMessageAt, id))
    expect(decoded).toEqual({ lastMessageAt, id })
  })

  it('rejects a legacy bare-UUID cursor', () => {
    expect(decodeThreadCursor('3bc35532-7c96-4640-827b-d57b51107d73')).toBeNull()
  })

  it('rejects a malformed cursor', () => {
    expect(decodeThreadCursor('not-a-valid-cursor')).toBeNull()
  })

  it('rejects a cursor with a non-uuid id', () => {
    expect(decodeThreadCursor(encodeThreadCursor('2026-03-01T00:00:00.000Z', 'nope'))).toBeNull()
  })

  it('rejects a cursor with an unparseable timestamp', () => {
    expect(
      decodeThreadCursor(encodeThreadCursor('not-a-date', '3bc35532-7c96-4640-827b-d57b51107d73')),
    ).toBeNull()
  })
})
