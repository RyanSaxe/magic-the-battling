// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useHotkeys } from "./useHotkeys";

afterEach(cleanup);

function Page({ advance }: { advance: () => void }): ReactNode {
  useHotkeys({ Enter: advance });
  return <button type="button">Unready</button>;
}

it("leaves Enter to the outlined button, and advances when nothing was outlined", () => {
  const advance = vi.fn();
  render(<Page advance={advance} />);
  const button = screen.getByRole("button");
  // False when the hotkey took the key, so the browser won't press the button.
  const enterPressesButton = (): boolean =>
    fireEvent.keyDown(button, { key: "Enter" });

  // jsdom outlines whatever has focus. A browser outlines a clicked button only once a key goes down.
  let outlined = false;
  const matches = button.matches.bind(button);
  vi.spyOn(button, "matches").mockImplementation((selector: string): boolean =>
    selector === ":focus-visible" ? outlined : matches(selector),
  );

  fireEvent.pointerDown(button);
  button.focus();
  expect(enterPressesButton()).toBe(false);
  expect(advance).toHaveBeenCalledOnce();

  // Another key draws the outline before the page hears it.
  outlined = true;
  fireEvent.keyDown(button, { key: "Escape" });
  expect(enterPressesButton()).toBe(true);
  expect(advance).toHaveBeenCalledOnce();
});
