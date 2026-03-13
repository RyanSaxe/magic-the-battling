import { describe, expect, it } from "vitest"

import { getPlayerPhaseStatusLabel } from "./format"

describe("getPlayerPhaseStatusLabel", () => {
  it("shows ready for build-ready players", () => {
    expect(getPlayerPhaseStatusLabel("build", true)).toBe("ready")
  })

  it("shows end instead of reward", () => {
    expect(getPlayerPhaseStatusLabel("reward", false)).toBe("end")
  })

  it("falls back to the raw phase for other states", () => {
    expect(getPlayerPhaseStatusLabel("battle", false)).toBe("battle")
  })
})
