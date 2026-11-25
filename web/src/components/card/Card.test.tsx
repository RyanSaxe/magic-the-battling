// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useMemo, useState, type ReactElement } from "react";
import { afterEach, expect, it, onTestFinished, vi } from "vitest";
import { useHotkeys } from "../../hooks/useHotkeys";
import type { Card as CardType } from "../../types";
import { BasicLandSlot } from "../common/BasicLandSlot";
import { CardSlot } from "../common/CardSlot";
import { Card } from "./Card";
import { CardPreviewContext } from "./CardPreviewContext";
import { CardPreviewModal } from "./CardPreviewModal";

// A touch screen: utils/inputMode reads matchMedia when it is imported, and jsdom has none.
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
}): ReactElement {
  const [selected, setSelected] = useState(false);
  const previewValue = useMemo(
    () => ({ setPreviewCard: onPreview }),
    [onPreview],
  );
  return (
    <CardPreviewContext.Provider value={previewValue}>
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
  );
  expect(card).not.toBeNull();
  if (!card) return;

  fireEvent.touchEnd(card);
  fireEvent.click(card);
  const magnifier = screen.getByTitle("Preview card");
  const browserMayClick = fireEvent.touchEnd(magnifier);

  expect(browserMayClick).toBe(false);
  expect(onTap).toHaveBeenCalledTimes(1);
  expect(card.classList.contains("selected")).toBe(false);
  expect(onPreview).not.toHaveBeenCalled();
});

function CardWithItsZoom({
  counters,
}: {
  counters: Record<string, number>;
}): ReactElement {
  const [zoomed, setZoomed] = useState<{
    card: CardType;
    counters?: Record<string, number>;
  } | null>(null);
  const previewValue = useMemo(
    () => ({
      setPreviewCard: (
        card: CardType | null,
        _upgrades?: CardType[],
        previewCounters?: Record<string, number>,
      ): void => setZoomed(card && { card, counters: previewCounters }),
    }),
    [],
  );
  return (
    <CardPreviewContext.Provider value={previewValue}>
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
  const originalGetContext = Object.getOwnPropertyDescriptor(
    HTMLCanvasElement.prototype,
    "getContext",
  );
  onTestFinished(() => {
    if (originalGetContext) {
      Object.defineProperty(
        HTMLCanvasElement.prototype,
        "getContext",
        originalGetContext,
      );
    }
  });
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: () => ({
      font: "",
      measureText(this: { font: string }, text: string): { width: number } {
        return {
          width: (text.length * parseFloat(this.font.replace(/^600 /, ""))) / 2,
        };
      },
    }),
  });
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
}): ReactElement {
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
  expect(fireEvent.keyUp(cardButton, { key: " " })).toBe(false);
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
  Object.defineProperty(cardButton, "matches", {
    configurable: true,
    value: (selector: string): boolean =>
      selector === ":focus-visible" ? focusVisible : nativeMatches(selector),
  });

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

function SelectedCardWithPreview({
  onSelect,
  onPreview,
}: {
  onSelect: () => void;
  onPreview: () => void;
}): ReactElement {
  const previewValue = useMemo(
    () => ({ setPreviewCard: onPreview }),
    [onPreview],
  );
  return (
    <CardPreviewContext.Provider value={previewValue}>
      <Card card={ANCIENT_TOMB} selected onClick={onSelect} />
    </CardPreviewContext.Provider>
  );
}

it("does not trigger card onClick when Enter or Space is pressed on a nested button", () => {
  const onSelect = vi.fn();
  const onPreview = vi.fn();
  render(<SelectedCardWithPreview onSelect={onSelect} onPreview={onPreview} />);

  const previewButton = screen.getByTitle("Preview card");
  previewButton.focus();
  fireEvent.keyDown(previewButton, { key: "Enter" });
  fireEvent.keyDown(previewButton, { key: " " });
  expect(onSelect).not.toHaveBeenCalled();
});

it("makes interactive CardSlot keyboard-focusable and activates on Enter and Space without advancing", () => {
  const onSlotClick = vi.fn();
  const onAdvance = vi.fn();

  function SlotWithPhaseEnter(): ReactElement {
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

it("makes BasicLandSlot keyboard-focusable and opens the land picker", () => {
  const onPick = vi.fn();
  render(
    <BasicLandSlot
      selected={null}
      dimensions={{ width: 80, height: 112 }}
      onPick={onPick}
    />,
  );

  const trigger = screen.getByRole("button", { name: "Pick basic land" });
  expect(trigger.tabIndex).toBe(0);
  fireEvent.click(trigger);

  const islandButton = screen.getByRole("button", { name: "Island" });
  fireEvent.click(islandButton);
  expect(onPick).toHaveBeenCalledWith("Island");
});
