import { describe, expect, it } from "vitest";
import { planRequestTransition } from "./walkthroughPhase";

describe("planRequestTransition", () => {
  it("starts the exit once a shown guide's request is closed", () => {
    expect(planRequestTransition({
      animPhase: "idle",
      requestActive: false,
      hasDisplayState: true,
      reducedMotion: false,
    })).toBe("exit");
  });

  it("lets an exit that already started run to the end", () => {
    expect(planRequestTransition({
      animPhase: "exiting",
      requestActive: false,
      hasDisplayState: true,
      reducedMotion: false,
    })).toBeNull();
  });

  it("closes without animating when the player prefers reduced motion", () => {
    expect(planRequestTransition({
      animPhase: "idle",
      requestActive: false,
      hasDisplayState: true,
      reducedMotion: true,
    })).toBe("idle");
  });

  it("leaves a guide alone while its request is active", () => {
    expect(planRequestTransition({
      animPhase: "idle",
      requestActive: true,
      hasDisplayState: true,
      reducedMotion: false,
    })).toBeNull();
  });
});
