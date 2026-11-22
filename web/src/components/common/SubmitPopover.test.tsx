// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidePanelHostContext } from "./sidePanelHost";
import { SubmitPopover } from "./SubmitPopover";
import { shouldCloseSubmitPopoverOnOutsideClick } from "./submitPopoverState";

describe("shouldCloseSubmitPopoverOnOutsideClick", () => {
  it("closes on a normal outside click", () => {
    expect(shouldCloseSubmitPopoverOnOutsideClick({
      closeOnOutsideClick: true,
      clickedInsidePopover: false,
      clickedIgnoredElement: false,
    })).toBe(true);
  });

  it("does not close when outside-click closing is disabled", () => {
    expect(shouldCloseSubmitPopoverOnOutsideClick({
      closeOnOutsideClick: false,
      clickedInsidePopover: false,
      clickedIgnoredElement: false,
    })).toBe(false);
  });

  it("does not close when the click was inside the popover", () => {
    expect(shouldCloseSubmitPopoverOnOutsideClick({
      closeOnOutsideClick: true,
      clickedInsidePopover: true,
      clickedIgnoredElement: false,
    })).toBe(false);
  });

  it("does not close when the click came from the guided tooltip exception", () => {
    expect(shouldCloseSubmitPopoverOnOutsideClick({
      closeOnOutsideClick: true,
      clickedInsidePopover: false,
      clickedIgnoredElement: true,
    })).toBe(false);
  });
});

describe("SubmitPopover", () => {
  afterEach(() => {
    cleanup();
    document.body.replaceChildren();
  });

  it("takes the whole tap that closes it over the board, so nothing underneath gets the click", () => {
    const boardCover = document.body.appendChild(document.createElement("div"));
    const onClose = vi.fn();
    render(
      <SidePanelHostContext.Provider value={boardCover}>
        <SubmitPopover options={[]} onClose={onClose} />
      </SidePanelHostContext.Provider>,
    );

    const tapTarget = boardCover.firstElementChild;
    expect(tapTarget).not.toBeNull();
    fireEvent.pointerDown(tapTarget!);
    expect(onClose).not.toHaveBeenCalled();
    // Dragged off the board, the press clicks what the two places share.
    fireEvent.click(document.body);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(tapTarget!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes from outside on the click, not for a press that started inside, and keeps its Escape to itself", () => {
    const outside = document.body.appendChild(document.createElement("button"));
    const onClose = vi.fn();
    const { getByText } = render(<SubmitPopover options={[{ label: "Draw", onClick: () => {} }]} onClose={onClose} />);

    // A press released somewhere else clicks what the two places share.
    fireEvent.pointerDown(getByText("Draw"));
    fireEvent.click(document.body);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.pointerDown(outside);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(outside);
    expect(onClose).toHaveBeenCalledOnce();

    expect(fireEvent.keyDown(document.body, { key: "Escape" })).toBe(false);
  });
});
