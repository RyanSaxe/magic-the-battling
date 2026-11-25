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
      <BasicLandSlot
        selected={null}
        dimensions={{ width: 80, height: 112 }}
        onPick={() => {}}
      />
    </SidePanelHostContext.Provider>,
  );
  fireEvent.click(screen.getByText("Click to pick basic land"));

  const tapTarget = boardCover.firstElementChild;
  expect(tapTarget).not.toBeNull();
  if (!tapTarget) return;
  fireEvent.mouseDown(tapTarget);
  expect(screen.queryByText("Swamp")).not.toBeNull();

  fireEvent.click(tapTarget);
  expect(screen.queryByText("Swamp")).toBeNull();
});

it("closes on Escape alone, so what's open under it stays", () => {
  const heardUnderIt = vi.fn();
  window.addEventListener("keydown", heardUnderIt);
  render(
    <BasicLandSlot
      selected={null}
      dimensions={{ width: 80, height: 112 }}
      onPick={() => {}}
    />,
  );
  fireEvent.click(screen.getByText("Click to pick basic land"));

  const notHandled = fireEvent.keyDown(document.body, { key: "Escape" });
  window.removeEventListener("keydown", heardUnderIt);

  expect(screen.queryByText("Swamp")).toBeNull();
  expect(notHandled).toBe(false);
  expect(heardUnderIt).not.toHaveBeenCalled();
});

it("moves focus into the land picker on open, cycles with arrow keys, and returns focus on Escape or selection", () => {
  const onPick = vi.fn();
  render(
    <BasicLandSlot
      selected={null}
      dimensions={{ width: 80, height: 112 }}
      onPick={onPick}
    />,
  );

  const trigger = screen.getByRole("button", { name: "Pick basic land" });
  trigger.focus();
  fireEvent.click(trigger);

  const plains = screen.getByRole("button", { name: "Plains" });
  const island = screen.getByRole("button", { name: "Island" });
  const swamp = screen.getByRole("button", { name: "Swamp" });
  const wastes = screen.getByRole("button", { name: "Wastes" });
  expect(document.activeElement).toBe(plains);

  fireEvent.keyDown(plains, { key: "ArrowDown" });
  expect(document.activeElement).toBe(island);

  fireEvent.keyDown(island, { key: "ArrowRight" });
  expect(document.activeElement).toBe(swamp);

  fireEvent.keyDown(swamp, { key: "ArrowLeft" });
  expect(document.activeElement).toBe(island);

  fireEvent.keyDown(island, { key: "ArrowUp" });
  expect(document.activeElement).toBe(plains);

  fireEvent.keyDown(plains, { key: "ArrowUp" });
  expect(document.activeElement).toBe(wastes);

  fireEvent.keyDown(wastes, { key: "Escape" });
  expect(screen.queryByRole("button", { name: "Plains" })).toBeNull();
  expect(document.activeElement).toBe(trigger);

  fireEvent.click(trigger);
  const mountain = screen.getByRole("button", { name: "Mountain" });
  fireEvent.click(mountain);
  expect(onPick).toHaveBeenCalledWith("Mountain");
  expect(screen.queryByRole("button", { name: "Plains" })).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it("toggles closed cleanly when activating the trigger while already open", () => {
  render(
    <BasicLandSlot
      selected={null}
      dimensions={{ width: 80, height: 112 }}
      onPick={() => {}}
    />,
  );

  const trigger = screen.getByRole("button", { name: "Pick basic land" });
  fireEvent.click(trigger);
  expect(screen.getByRole("button", { name: "Plains" })).toBeTruthy();

  fireEvent.click(trigger);
  expect(screen.queryByRole("button", { name: "Plains" })).toBeNull();
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
});
