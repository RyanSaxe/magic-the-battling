// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidePanel } from "./SidePanel";
import { SidePanelHostContext } from "./sidePanelHost";

function openPanel({ closeOnBoardTap = false } = {}) {
  const board = document.createElement("div");
  const host = document.createElement("div");
  board.append(host);
  document.body.append(board);
  const onClose = vi.fn();
  render(
    <SidePanelHostContext.Provider value={host}>
      <SidePanel
        open
        title="Fight"
        onClose={onClose}
        closeOnBoardTap={closeOnBoardTap}
      >
        <input aria-label="Life" />
      </SidePanel>
    </SidePanelHostContext.Provider>,
  );
  return {
    host,
    lifeField: screen.getByRole("textbox", { name: "Life" }),
    onClose,
  };
}

describe("SidePanel", () => {
  afterEach(() => {
    cleanup();
    document.body.replaceChildren();
  });

  it("closes on Escape, but not while a field is being typed in", () => {
    const { lifeField, onClose } = openPanel();

    fireEvent.keyDown(lifeField, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("leaves Escape to a dialog open over it", () => {
    const { onClose } = openPanel();
    const dialog = document.body.appendChild(document.createElement("div"));
    dialog.setAttribute("aria-modal", "true");

    fireEvent.keyDown(document.body, { key: "Escape" });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on a tap on the board outside it when asked to, and not on a tap inside it", () => {
    const { host, lifeField, onClose } = openPanel({ closeOnBoardTap: true });

    fireEvent.click(lifeField);
    expect(onClose).not.toHaveBeenCalled();

    const boardTap = host.querySelector(".board-backdrop")!;
    fireEvent.pointerDown(boardTap);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(boardTap);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
