import { describe, expect, it } from "vitest"

import { GAME_HINTS } from "../constants/hints"
import { textForInput } from "./inputMode"

describe("textForInput", () => {
  const hint = { text: "Hover a card and press Z to zoom in", touch: "Tap a card, then its magnifier to zoom in" }

  it("uses the pointer text when the device can hover", () => {
    expect(textForInput(hint, true)).toBe(hint.text)
  })

  it("uses the touch text when the device cannot hover", () => {
    expect(textForInput(hint, false)).toBe(hint.touch)
  })

  it("falls back to the pointer text when there is no touch text", () => {
    expect(textForInput({ text: "A draw is a loss for both players" }, false)).toBe("A draw is a loss for both players")
  })

  it("gives no touch hint that asks for a key or hover", () => {
    const touchHints = GAME_HINTS.map((h) => textForInput(h, false))
    expect(touchHints.filter((t) => /\bpress\b|\bhover\b|double click/i.test(t))).toEqual([])
  })
})
