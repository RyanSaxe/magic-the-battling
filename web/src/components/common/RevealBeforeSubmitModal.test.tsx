// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Card } from "../../types";
import { RevealBeforeSubmitModal } from "./RevealBeforeSubmitModal";

// utils/inputMode reads matchMedia when it is imported, and jsdom has none.
vi.hoisted(() => {
  window.matchMedia = () =>
    ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("leaves Enter to the dialog's own outlined button, and reveals with no outline or over a covered one", () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const reveal = vi.fn();
  const upgrade = {
    id: "upgrade",
    name: "Upgrade",
    type_line: "Conspiracy",
    image_url: "",
    upgrade_target: null,
  } as Card;
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
  // True when nothing took the key, so the browser presses the button.
  const enterPresses = (button: HTMLElement) =>
    fireEvent.keyDown(button, { key: "Enter" });

  // jsdom outlines whatever has focus, as a browser does after Tab.
  skip.focus();
  expect(enterPresses(skip)).toBe(true);
  expect(reveal).not.toHaveBeenCalled();

  covered.focus();
  expect(enterPresses(covered)).toBe(false);
  expect(reveal).toHaveBeenCalledTimes(1);

  const matches = skip.matches.bind(skip);
  skip.matches = (selector: string) =>
    selector !== ":focus-visible" && matches(selector);
  skip.focus();
  expect(enterPresses(skip)).toBe(false);
  expect(reveal).toHaveBeenCalledTimes(2);
});
