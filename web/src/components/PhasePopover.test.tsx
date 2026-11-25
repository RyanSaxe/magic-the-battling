// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SidePanelHostContext } from "./common/sidePanelHost";
import { PhasePopover } from "./PhasePopover";

// The popover's wording reads matchMedia when it is imported, and jsdom has none.
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

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

it("takes the whole tap that closes it over the board, and lets a bar button act on that tap", () => {
  const board = document.body.appendChild(document.createElement("div"));
  const barButton = document.body.appendChild(document.createElement("button"));
  const onClose = vi.fn();
  render(
    <SidePanelHostContext.Provider value={board}>
      <PhasePopover
        phase="draft"
        anchorRect={new DOMRect(0, 0, 40, 20)}
        useUpgrades
        onClose={onClose}
        onOpenDetails={() => {}}
        onOpenControls={() => {}}
      />
    </SidePanelHostContext.Provider>,
  );

  const boardTap = board.firstElementChild ?? board;
  fireEvent.mouseDown(boardTap);
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(boardTap);
  expect(onClose).toHaveBeenCalledTimes(1);

  fireEvent.mouseDown(barButton);
  expect(onClose).toHaveBeenCalledTimes(2);
});
