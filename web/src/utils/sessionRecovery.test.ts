import { describe, expect, it } from "vitest";
import { shouldClearSessionOnInvalidEvent } from "./sessionRecovery";

describe("shouldClearSessionOnInvalidEvent", () => {
  it("clears on first invalid-session event when a session exists", () => {
    expect(shouldClearSessionOnInvalidEvent(true, false, true)).toBe(true);
  });

  it("does not clear repeatedly while invalid-session stays true", () => {
    expect(shouldClearSessionOnInvalidEvent(true, true, true)).toBe(false);
  });

  it("does not clear when there is no active session", () => {
    expect(shouldClearSessionOnInvalidEvent(true, false, false)).toBe(false);
  });

  it("does not clear when invalid-session is false", () => {
    expect(shouldClearSessionOnInvalidEvent(false, false, true)).toBe(false);
    expect(shouldClearSessionOnInvalidEvent(false, true, true)).toBe(false);
  });
});

