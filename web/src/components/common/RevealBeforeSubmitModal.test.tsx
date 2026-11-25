// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Card } from "../../types";
import { RevealBeforeSubmitModal } from "./RevealBeforeSubmitModal";

// utils/inputMode reads matchMedia when it is imported, and jsdom has none.
vi.hoisted(() => {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener(): void {},
    removeListener(): void {},
    addEventListener(): void {},
    removeEventListener(): void {},
    dispatchEvent(): boolean {
      return false;
    },
  });
});

// True when nothing took the key, so the browser presses the button.
function enterPresses(button: HTMLElement): boolean {
  return fireEvent.keyDown(button, { key: "Enter" });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("leaves Enter to the dialog's own outlined button, and reveals with no outline or over a covered one", () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );
  const reveal = vi.fn();
  const upgrade: Card = {
    id: "upgrade",
    name: "Upgrade",
    type_line: "Conspiracy",
    image_url: "",
    flip_image_url: null,
    png_url: null,
    flip_png_url: null,
    tokens: [],
    elo: null,
    upgrade_target: null,
    oracle_text: null,
    colors: [],
    cmc: 0,
  };
  render(
    <>
      <button>Submit Result</button>
      <RevealBeforeSubmitModal
        upgrades={[upgrade]}
        onRevealAndSubmit={reveal}
        onSkip={vi.fn()}
        onClose={vi.fn()}
      />
    </>,
  );
  const skip = screen.getByRole("button", { name: "Submit Without Revealing" });
  const covered = screen.getByRole("button", { name: "Submit Result" });

  // jsdom outlines whatever has focus, as a browser does after Tab.
  skip.focus();
  expect(enterPresses(skip)).toBe(true);
  expect(reveal).not.toHaveBeenCalled();

  covered.focus();
  expect(enterPresses(covered)).toBe(false);
  expect(reveal).toHaveBeenCalledTimes(1);

  const matches = skip.matches.bind(skip);
  Object.defineProperty(skip, "matches", {
    configurable: true,
    value: (selector: string): boolean =>
      selector !== ":focus-visible" && matches(selector),
  });
  skip.focus();
  expect(enterPresses(skip)).toBe(false);
  expect(reveal).toHaveBeenCalledTimes(2);
});
