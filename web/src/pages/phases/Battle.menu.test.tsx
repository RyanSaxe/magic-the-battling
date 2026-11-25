// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState, type ComponentProps, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidePanelHostContext } from "../../components/common/sidePanelHost";
import { GameDndProvider } from "../../dnd";
import type { Card, GameState, SelfPlayerView, Zones } from "../../types";
import { BattlePhase, type BattleCardMenu } from "./Battle";

// The board asks matchMedia whether a mouse can right-click, and jsdom has none.
vi.hoisted(() => {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: query === "(hover: hover)",
    media: query,
    onchange: null,
    addListener: (): void => {},
    removeListener: (): void => {},
    addEventListener: (): void => {},
    removeEventListener: (): void => {},
    dispatchEvent: (): boolean => false,
  });
});

const buriedCard: Card = {
  id: "buried",
  name: "Mantis Rider",
  image_url: "",
  flip_image_url: null,
  png_url: null,
  flip_png_url: null,
  type_line: "Creature",
  tokens: [],
  elo: null,
  upgrade_target: null,
  oracle_text: null,
  colors: [],
  cmc: 3,
};

function zones(graveyard: Card[]): Zones {
  return {
    battlefield: [],
    graveyard,
    exile: [],
    hand: [],
    sideboard: [],
    upgrades: [],
    command_zone: [],
    library: [],
    treasures: 0,
    submitted_cards: [],
    tapped_card_ids: [],
    flipped_card_ids: [],
    face_down_card_ids: [],
    counters: {},
    attachments: {},
    spawned_tokens: [],
  };
}

const selfPlayer: SelfPlayerView = {
  name: "Alice",
  treasures: 0,
  poison: 0,
  phase: "battle",
  round: 1,
  stage: 3,
  vanquishers: 0,
  is_ghost: false,
  is_puppet: false,
  time_of_death: null,
  hand_count: 0,
  sideboard_count: 0,
  hand_size: 7,
  is_stage_increasing: false,
  upgrades: [],
  vanguard: null,
  chosen_basics: [],
  most_recently_revealed_cards: [],
  last_result: null,
  pairing_probability: null,
  is_most_recent_ghost: false,
  full_sideboard: [],
  command_zone: [],
  placement: 0,
  in_sudden_death: false,
  build_ready: false,
  hand: [],
  hand_slots: [],
  sideboard: [],
  current_pack: null,
  last_battle_result: null,
};

const gameState: GameState = {
  game_id: "game-1",
  phase: "battle",
  starting_life: 20,
  self_player: selfPlayer,
  players: [selfPlayer],
  available_upgrades: [],
  current_battle: {
    opponent_name: "Bob",
    coin_flip_name: "Alice",
    on_the_play_name: "Alice",
    current_turn_name: "Alice",
    your_zones: zones([buriedCard]),
    opponent_zones: zones([]),
    opponent_hand_count: 0,
    result_submissions: {},
    opponent_full_sideboard: [],
    your_poison: 0,
    opponent_poison: 0,
    opponent_hand_revealed: false,
    your_life: 20,
    opponent_life: 20,
    is_sudden_death: false,
    can_manipulate_opponent: false,
    pending_reveal_animations: [],
  },
  battle_resolution: null,
  use_upgrades: false,
  voice_chat_enabled: false,
  cube_id: "auto",
  play_mode: "limited",
};

function Fight({ onPanelClose }: { onPanelClose: () => void }): ReactElement {
  const [cardMenu, setCardMenu] = useState<BattleCardMenu | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const props: ComponentProps<typeof BattlePhase> = {
    gameState,
    actions: {
      battleMove: (): void => {},
      battleSubmitResult: (): void => {},
      battleUpdateCardState: (): void => {},
    },
    selectedCard: null,
    onSelectedCardChange: (): void => {},
    cardMenu,
    onCardMenuChange: setCardMenu,
    activeZoneModal: { zone: "graveyard", owner: "player" },
    onZoneModalOpenChange: onPanelClose,
  };

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
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
    const onPanelClose = vi.fn();
    render(<Fight onPanelClose={onPanelClose} />);

    const cardImage = screen.getAllByAltText("Mantis Rider").at(-1);
    if (!cardImage) throw new Error("expected Mantis Rider image");
    fireEvent.contextMenu(cardImage);
    expect(screen.getByRole("button", { name: /Move To/ })).toBeTruthy();

    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("button", { name: /Move To/ })).toBeNull();
    expect(onPanelClose).not.toHaveBeenCalled();
  });
});
