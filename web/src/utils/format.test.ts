import { describe, expect, it } from "vitest"

import { formatTimeSince, getPlayerPhaseStatusLabel } from "./format"

describe("getPlayerPhaseStatusLabel", () => {
  it("shows ready for build-ready players", () => {
    expect(getPlayerPhaseStatusLabel("build", true)).toBe("ready")
  })

  it("shows end instead of reward", () => {
    expect(getPlayerPhaseStatusLabel("reward", false)).toBe("end")
  })

  it("shows fight instead of battle", () => {
    expect(getPlayerPhaseStatusLabel("battle", false)).toBe("fight")
  })

  it("falls back to the raw phase for other states", () => {
    expect(getPlayerPhaseStatusLabel("draft", false)).toBe("draft")
  })
})

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
