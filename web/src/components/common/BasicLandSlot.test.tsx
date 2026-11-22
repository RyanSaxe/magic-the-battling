// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BasicLandSlot } from "./BasicLandSlot";
import { SidePanelHostContext } from "./sidePanelHost";

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

it("takes the whole tap that closes the land picker, so nothing on the board gets the click", () => {
  const boardCover = document.body.appendChild(document.createElement("div"));
  render(
    <SidePanelHostContext.Provider value={boardCover}>
      <BasicLandSlot selected={null} dimensions={{ width: 80, height: 112 }} onPick={() => {}} />
    </SidePanelHostContext.Provider>,
  );
  fireEvent.click(screen.getByText("Click to pick basic land"));

  const tapTarget = boardCover.firstElementChild;
  expect(tapTarget).not.toBeNull();
  fireEvent.mouseDown(tapTarget!);
  expect(screen.queryByText("Swamp")).not.toBeNull();

  fireEvent.click(tapTarget!);
  expect(screen.queryByText("Swamp")).toBeNull();
});

it("closes on Escape alone, so what's open under it stays", () => {
  const heardUnderIt = vi.fn();
  window.addEventListener("keydown", heardUnderIt);
  render(<BasicLandSlot selected={null} dimensions={{ width: 80, height: 112 }} onPick={() => {}} />);
  fireEvent.click(screen.getByText("Click to pick basic land"));

  const notHandled = fireEvent.keyDown(document.body, { key: "Escape" });
  window.removeEventListener("keydown", heardUnderIt);

  expect(screen.queryByText("Swamp")).toBeNull();
  expect(notHandled).toBe(false);
  expect(heardUnderIt).not.toHaveBeenCalled();
});
