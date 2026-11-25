// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useHotkeys } from "../../hooks/useHotkeys";
import type { Card as CardType } from "../../types";
import { CardSlot } from "../common/CardSlot";
import { Card } from "./Card";
import { CardPreviewContext } from "./CardPreviewContext";
import { CardPreviewModal } from "./CardPreviewModal";

// A touch screen: utils/inputMode reads matchMedia when it is imported, and jsdom has none.
vi.hoisted(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
});

const ANCIENT_TOMB: CardType = {
  id: "ancient-tomb",
  name: "Ancient Tomb",
  image_url: "ancient-tomb.png",
  flip_image_url: null,
  png_url: null,
  flip_png_url: null,
  type_line: "Land",
  tokens: [],
  elo: null,
  upgrade_target: null,
  oracle_text: null,
  colors: [],
  cmc: 0,
};

function BattlefieldCard({
  onTap,
  onPreview,
}: {
  onTap: () => void;
  onPreview: () => void;
}) {
  const [selected, setSelected] = useState(false);
  return (
    <CardPreviewContext.Provider value={{ setPreviewCard: onPreview }}>
      <Card
        card={ANCIENT_TOMB}
        selected={selected}
        onClick={() => setSelected(!selected)}
        onDoubleClick={onTap}
      />
    </CardPreviewContext.Provider>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("taps a card on a double tap whose second tap lands on the magnifier the first tap revealed", () => {
  const onTap = vi.fn();
  const onPreview = vi.fn();
  const { container } = render(
    <BattlefieldCard onTap={onTap} onPreview={onPreview} />,
  );
  const card = container.querySelector<HTMLElement>(
    '[data-guide-card-id="ancient-tomb"]',
  )!;

  fireEvent.touchEnd(card);
  fireEvent.click(card);
  const magnifier = screen.getByTitle("Preview card");
  const browserMayClick = fireEvent.touchEnd(magnifier);

  expect(browserMayClick).toBe(false);
  expect(onTap).toHaveBeenCalledTimes(1);
  expect(card.classList.contains("selected")).toBe(false);
  expect(onPreview).not.toHaveBeenCalled();
});

function CardWithItsZoom({ counters }: { counters: Record<string, number> }) {
  const [zoomed, setZoomed] = useState<{
    card: CardType;
    counters?: Record<string, number>;
  } | null>(null);
  return (
    <CardPreviewContext.Provider
      value={{
        setPreviewCard: (card, _upgrades, counters) =>
          setZoomed(card && { card, counters }),
      }}
    >
      <Card
        card={ANCIENT_TOMB}
        dimensions={{ width: 40, height: 56 }}
        selected
        counters={counters}
      />
      {zoomed && (
        <CardPreviewModal
          {...zoomed}
          appliedUpgrades={[]}
          onClose={() => setZoomed(null)}
        />
      )}
    </CardPreviewContext.Provider>
  );
}

it("shows a name too long for the card as its number, and every counter in full in the zoom", () => {
  // jsdom has no canvas, so every character here is half as wide as the text is tall.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    font: "",
    measureText(this: { font: string }, text: string) {
      return {
        width: (text.length * parseFloat(this.font.replace(/^600 /, ""))) / 2,
      };
    },
  } as unknown as CanvasRenderingContext2D);
  render(
    <CardWithItsZoom counters={{ "-1/-1": 1, "Indestructible Shield": 3 }} />,
  );

  expect(screen.queryByText("3")).not.toBeNull();
  expect(screen.queryByText("3 Indestructible Shield")).toBeNull();
  expect(screen.getAllByText("\u22121/\u22121")).toHaveLength(1);

  fireEvent.click(screen.getByTitle("Preview card"));
  expect(screen.getAllByText("\u22121/\u22121")).toHaveLength(2);
  expect(screen.queryByText("3 Indestructible Shield")).not.toBeNull();
});

function CardWithPhaseEnter({
  onSelect,
  onAdvance,
}: {
  onSelect: () => void;
  onAdvance: () => void;
}) {
  const [selected, setSelected] = useState(false);
  useHotkeys({ Enter: onAdvance });
  return (
    <Card
      card={ANCIENT_TOMB}
      selected={selected}
      onClick={() => {
        setSelected((s) => !s);
        onSelect();
      }}
    />
  );
}

it("makes interactive cards keyboard-focusable and activates on Enter and Space without scrolling", () => {
  const onSelect = vi.fn();
  const { rerender } = render(<Card card={ANCIENT_TOMB} onClick={onSelect} />);

  const cardButton = screen.getByRole("button", { name: "Ancient Tomb" });
  expect(cardButton.tabIndex).toBe(0);

  cardButton.focus();
  const enterNotPrevented = fireEvent.keyDown(cardButton, { key: "Enter" });
  expect(enterNotPrevented).toBe(false);
  expect(onSelect).toHaveBeenCalledTimes(1);

  const spaceNotPrevented = fireEvent.keyDown(cardButton, { key: " " });
  expect(spaceNotPrevented).toBe(false);
  expect(onSelect).toHaveBeenCalledTimes(2);

  rerender(<Card card={ANCIENT_TOMB} onClick={onSelect} faceDown />);
  expect(screen.getByRole("button", { name: "Face-down card" })).toBeTruthy();

  rerender(<Card card={ANCIENT_TOMB} />);
  expect(screen.queryByRole("button")).toBeNull();

  rerender(<Card card={ANCIENT_TOMB} onClick={onSelect} disabled />);
  expect(screen.queryByRole("button")).toBeNull();
});

it("triggers the focused card on Enter without firing global phase Enter, and still advances after a mouse click", () => {
  const onSelect = vi.fn();
  const onAdvance = vi.fn();
  render(<CardWithPhaseEnter onSelect={onSelect} onAdvance={onAdvance} />);

  const cardButton = screen.getByRole("button", { name: "Ancient Tomb" });
  const nativeMatches = cardButton.matches.bind(cardButton);
  let focusVisible = true;
  cardButton.matches = (selector: string) =>
    selector === ":focus-visible" ? focusVisible : nativeMatches(selector);

  // Keyboard focus: Enter activates the card and does not submit the phase.
  cardButton.focus();
  fireEvent.keyDown(cardButton, { key: "Enter" });
  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(onAdvance).not.toHaveBeenCalled();

  // Space also activates the card and never submits the phase.
  fireEvent.keyDown(cardButton, { key: " " });
  expect(onSelect).toHaveBeenCalledTimes(2);
  expect(onAdvance).not.toHaveBeenCalled();

  // Mouse click focuses without :focus-visible: Enter submits the phase without toggling the card.
  cardButton.blur();
  focusVisible = false;
  fireEvent.pointerDown(cardButton);
  cardButton.focus();
  fireEvent.keyDown(cardButton, { key: "Enter" });
  expect(onSelect).toHaveBeenCalledTimes(2);
  expect(onAdvance).toHaveBeenCalledTimes(1);
});

it("does not trigger card onClick when Enter or Space is pressed on a nested button", () => {
  const onSelect = vi.fn();
  const onPreview = vi.fn();
  render(
    <CardPreviewContext.Provider value={{ setPreviewCard: onPreview }}>
      <Card card={ANCIENT_TOMB} selected onClick={onSelect} />
    </CardPreviewContext.Provider>,
  );

  const previewButton = screen.getByTitle("Preview card");
  previewButton.focus();
  fireEvent.keyDown(previewButton, { key: "Enter" });
  fireEvent.keyDown(previewButton, { key: " " });
  expect(onSelect).not.toHaveBeenCalled();
});

it("makes interactive CardSlot keyboard-focusable and activates on Enter and Space without advancing", () => {
  const onSlotClick = vi.fn();
  const onAdvance = vi.fn();

  function SlotWithPhaseEnter() {
    useHotkeys({ Enter: onAdvance });
    return (
      <CardSlot
        label="+\nCard"
        dimensions={{ width: 80, height: 112 }}
        onClick={onSlotClick}
      />
    );
  }

  render(<SlotWithPhaseEnter />);
  const slot = screen.getByRole("button", { name: "Empty hand slot" });
  expect(slot.tabIndex).toBe(0);

  slot.focus();
  expect(fireEvent.keyDown(slot, { key: "Enter" })).toBe(false);
  expect(onSlotClick).toHaveBeenCalledTimes(1);
  expect(onAdvance).not.toHaveBeenCalled();

  expect(fireEvent.keyDown(slot, { key: " " })).toBe(false);
  expect(onSlotClick).toHaveBeenCalledTimes(2);
  expect(onAdvance).not.toHaveBeenCalled();
});
