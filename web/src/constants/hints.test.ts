import { describe, expect, it } from "vitest";
import { textForInput } from "../utils/inputMode";
import { hintsFor } from "./hints";

const advanceHint = /next phase/i;

describe("hintsFor", () => {
  it("keeps the advance-phase hint off the Play page, before there's a game", () => {
    const playHints = hintsFor("play").flatMap((hint) => [textForInput(hint, true), textForInput(hint, false)]);

    expect(playHints.filter((text) => advanceHint.test(text))).toEqual([]);
  });

  it("shows the advance-phase hint during a game", () => {
    const gameHints = hintsFor("game").map((hint) => textForInput(hint, true));

    expect(gameHints).toContain("Press Enter to advance to the next phase");
  });
});
