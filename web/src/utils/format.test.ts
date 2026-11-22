import { describe, expect, it } from "vitest"

import { formatTimeSince } from "./format"

describe('formatTimeSince', () => {
  const now = Date.parse('2026-11-21T12:00:00Z')

  it.each([
    ['2026-11-21T11:59:40Z', 'just now'],
    ['2026-11-21T11:56:00Z', '4 min ago'],
    ['2026-11-21T10:00:00Z', '2 h ago'],
    ['2026-11-20T11:00:00Z', '1 day ago'],
    ['2026-11-18T12:00:00Z', '3 days ago'],
  ])('describes %s as %s', (time, expected) => {
    expect(formatTimeSince(time, now)).toBe(expected)
  })
})
