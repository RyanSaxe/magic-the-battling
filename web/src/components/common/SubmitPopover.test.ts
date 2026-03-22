import { describe, expect, it } from "vitest";
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
