// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Dialog } from "./Dialog";

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(document, "elementFromPoint");
});

it("closes on Escape from its field, and marks the key handled so nothing under it closes too", () => {
  const onClose = vi.fn();
  render(
    <Dialog title="Settings" onClose={onClose}>
      <input aria-label="Name" />
    </Dialog>,
  );

  const notHandled = fireEvent.keyDown(screen.getByLabelText("Name"), {
    key: "Escape",
  });

  expect(onClose).toHaveBeenCalledOnce();
  expect(notHandled).toBe(false);
});

it("keeps Tab and Shift+Tab off the page it covers", () => {
  render(
    <>
      <button>Join Game</button>
      <Dialog title="Close this game?" onClose={vi.fn()}>
        <button>Keep</button>
        <button>Close Game</button>
      </Dialog>
    </>,
  );
  const dialog = screen.getByRole("dialog");
  // jsdom lays nothing out, so say that the dialog is the top layer.
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => dialog,
  });
  const pressTab = (shiftKey = false) => {
    fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey });
    return document.activeElement;
  };
  const [close, keep, confirm] = within(dialog).getAllByRole("button");

  expect(document.activeElement).toBe(keep);
  expect(pressTab()).toBe(confirm);
  expect(pressTab()).toBe(close);
  expect(pressTab(true)).toBe(confirm);

  // As when Tab comes back into the page from the browser's address bar, with no key for the page to hear.
  confirm.blur();
  screen.getByRole("button", { name: "Join Game" }).focus();
  expect(document.activeElement).toBe(keep);
});
