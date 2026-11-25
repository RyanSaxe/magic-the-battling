// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState, type ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidePanelHostContext } from "../../components/common/sidePanelHost";
import { GameDndProvider } from "../../dnd";
import type { Card, GameState, Zones } from "../../types";
import { BattlePhase, type BattleCardMenu } from "./Battle";

// The board asks matchMedia whether a mouse can right-click, and jsdom has none.
vi.hoisted(() => {
  window.matchMedia = ((query: string) => ({
    matches: query === "(hover: hover)",
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
});

const buriedCard = {
  id: "buried",
  name: "Mantis Rider",
  type_line: "Creature",
  tokens: [],
  flip_image_url: null,
} as unknown as Card;

function zones(graveyard: Card[]) {
  return {
    battlefield: [],
    graveyard,
    exile: [],
    hand: [],
    sideboard: [],
    upgrades: [],
    command_zone: [],
    library: [],
    tapped_card_ids: [],
    flipped_card_ids: [],
    face_down_card_ids: [],
    counters: {},
    attachments: {},
  } as unknown as Zones;
}

const gameState = {
  self_player: { name: "Alice", upgrades: [] },
  players: [],
  current_battle: {
    opponent_name: "Bob",
    your_zones: zones([buriedCard]),
    opponent_zones: zones([]),
    opponent_hand_count: 0,
    opponent_full_sideboard: [],
    your_poison: 0,
    opponent_poison: 0,
    can_manipulate_opponent: false,
  },
} as unknown as GameState;

function Fight({ onPanelClose }: { onPanelClose: () => void }) {
  const [cardMenu, setCardMenu] = useState<BattleCardMenu | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const props = {
    gameState,
    actions: {},
    selectedCard: null,
    onSelectedCardChange: () => {},
    cardMenu,
    onCardMenuChange: setCardMenu,
    activeZoneModal: { zone: "graveyard", owner: "player" },
    onZoneModalOpenChange: onPanelClose,
  } as unknown as ComponentProps<typeof BattlePhase>;

  return (
    <SidePanelHostContext.Provider value={host}>
      <div ref={setHost} />
      <GameDndProvider>
        <BattlePhase {...props} />
      </GameDndProvider>
    </SidePanelHostContext.Provider>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BattlePhase", () => {
  it("opens a panel card's menu on right click, and Escape closes that before the panel", () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const onPanelClose = vi.fn();
    render(<Fight onPanelClose={onPanelClose} />);

    fireEvent.contextMenu(screen.getAllByAltText("Mantis Rider").at(-1)!);
    expect(screen.getByRole("button", { name: /Move To/ })).toBeTruthy();

    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("button", { name: /Move To/ })).toBeNull();
    expect(onPanelClose).not.toHaveBeenCalled();
  });
});
