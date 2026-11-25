// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi, type Mock } from "vitest";
import { useCardMiddleTap } from "./useCardMiddleTap";

afterEach(cleanup);

const box =
  (rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): (() => DOMRect) =>
  (): DOMRect => ({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    left: rect.x,
    top: rect.y,
    right: rect.x + rect.width,
    bottom: rect.y + rect.height,
    toJSON: (): Record<string, number> => ({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    }),
  });

function renderSmallCard(): {
  tap: (x: number, y: number) => void;
  select: Mock;
  preview: Mock;
} {
  const select = vi.fn();
  const preview = vi.fn();
  function Board(): ReactNode {
    useCardMiddleTap();
    return (
      <div
        role="presentation"
        className="card"
        data-testid="card"
        onClick={select}
      >
        <img alt="" />
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            preview();
          }}
        >
          Preview
        </button>
      </div>
    );
  }
  render(<Board />);
  const card = screen.getByTestId("card");
  const button = screen.getByRole("button");
  card.getBoundingClientRect = box({ x: 0, y: 0, width: 45, height: 63 });
  button.getBoundingClientRect = box({ x: 4, y: 4, width: 24, height: 24 });
  document.elementFromPoint = (x, y): HTMLElement | null =>
    x >= 4 && x <= 28 && y >= 4 && y <= 28 ? button : card.querySelector("img");
  const tap = (x: number, y: number): void => {
    fireEvent.touchEnd(card, { changedTouches: [{ clientX: x, clientY: y }] });
    // The browser clicks the nearest button, wherever the finger was.
    fireEvent.click(button);
  };
  return { tap, select, preview };
}

it("gives a tap on the middle of a card to the card, when the browser moved it onto a button", () => {
  const { tap, select, preview } = renderSmallCard();
  tap(22, 31);
  expect(select).toHaveBeenCalledOnce();
  expect(preview).not.toHaveBeenCalled();
});

it("leaves a tap on the button, or just beside it away from the middle, to the button", () => {
  const { tap, select, preview } = renderSmallCard();
  tap(16, 16);
  tap(8, 31);
  expect(preview).toHaveBeenCalledTimes(2);
  expect(select).not.toHaveBeenCalled();
});
