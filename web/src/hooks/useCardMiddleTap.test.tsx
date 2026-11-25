// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useCardMiddleTap } from "./useCardMiddleTap";

afterEach(cleanup);

const box = (x: number, y: number, width: number, height: number) => () =>
  ({
    x,
    y,
    width,
    height,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
  }) as DOMRect;

function renderSmallCard() {
  const select = vi.fn();
  const preview = vi.fn();
  function Board() {
    useCardMiddleTap();
    return (
      <div className="card" data-testid="card" onClick={select}>
        <img alt="" />
        <button
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
  card.getBoundingClientRect = box(0, 0, 45, 63);
  button.getBoundingClientRect = box(4, 4, 24, 24);
  document.elementFromPoint = (x, y) =>
    x >= 4 && x <= 28 && y >= 4 && y <= 28 ? button : card.querySelector("img");
  const tap = (x: number, y: number) => {
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
