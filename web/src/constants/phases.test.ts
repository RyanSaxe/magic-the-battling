import { describe, expect, it } from "vitest";
import { getTimelinePhases } from "./phases";

describe("getTimelinePhases", () => {
  it("shows the full round in a normal game", () => {
    expect(getTimelinePhases(false)).toEqual(["draft", "build", "battle", "reward"]);
  });

  it("shows only the build and battle loop in sudden death", () => {
    expect(getTimelinePhases(true)).toEqual(["build", "battle"]);
  });
});
