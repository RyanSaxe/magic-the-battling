import { describe, expect, it } from "vitest";
import { hotkeyFor } from "../hooks/useHotkeys";
import type { Card, ZoneName, Zones } from "../types";
import {
  buildCardMoveHotkeys,
  buildPanelHotkeys,
  findBattleCard,
  type HoveredBattleCard,
} from "./gameHotkeys";

interface PanelState {
  guideOpen: boolean;
  menuOpen: boolean;
  upgradesOpen: boolean;
  otherModalOpen: boolean;
}

function createPanels(initial: {
  guideOpen?: boolean;
  menuOpen?: boolean;
  upgradesOpen?: boolean;
  otherModalOpen?: boolean;
}): { panels: PanelState; press: (key: string) => void } {
  const panels: PanelState = {
    guideOpen: initial.guideOpen ?? false,
    menuOpen: initial.menuOpen ?? false,
    upgradesOpen: initial.upgradesOpen ?? false,
    otherModalOpen: initial.otherModalOpen ?? false,
  };
  const press = (key: string): void => {
    const hotkeys = buildPanelHotkeys({
      guideOpen: panels.guideOpen,
      gameplayHotkeysDisabled:
        panels.guideOpen ||
        panels.menuOpen ||
        panels.upgradesOpen ||
        panels.otherModalOpen,
      openGuide: () => {
        panels.guideOpen = true;
      },
      closeGuide: () => {
        panels.guideOpen = false;
      },
      closeMenu: panels.menuOpen
        ? (): void => {
            panels.menuOpen = false;
          }
        : null,
      closeUpgrades: panels.upgradesOpen
        ? {
            key: "u",
            close: (): void => {
              panels.upgradesOpen = false;
            },
          }
        : null,
    });
    hotkeys[hotkeyFor(key)]?.();
  };
  return { panels, press };
}

describe("buildPanelHotkeys", () => {
  it("opens the guide with ? and closes it with ? again", () => {
    const { panels, press } = createPanels({});

    press("?");
    expect(panels.guideOpen).toBe(true);

    press("?");
    expect(panels.guideOpen).toBe(false);
  });

  it("does not open the guide over another modal", () => {
    const { panels, press } = createPanels({ otherModalOpen: true });

    press("?");

    expect(panels.guideOpen).toBe(false);
  });

  it("closes the Upgrades window with the key that opened it", () => {
    const { panels, press } = createPanels({ upgradesOpen: true });

    press("u");

    expect(panels.upgradesOpen).toBe(false);
  });

  it("closes the Actions menu with Escape", () => {
    const { panels, press } = createPanels({ menuOpen: true });

    press("Escape");

    expect(panels.menuOpen).toBe(false);
  });

  it("does not open the guide over the Actions menu", () => {
    const { panels, press } = createPanels({ menuOpen: true });

    press("?");

    expect(panels.guideOpen).toBe(false);
  });
});

const ALL_ZONE_NAMES: readonly ZoneName[] = [
  "battlefield",
  "graveyard",
  "exile",
  "hand",
  "sideboard",
  "upgrades",
  "command_zone",
  "library",
];

interface BattleFixture {
  zones: Partial<Record<ZoneName, string[]>>;
  hoveredCard: HoveredBattleCard | null;
}

function createBattle(zones: Partial<Record<ZoneName, string[]>>): {
  battle: BattleFixture;
  hover: (id: string) => void;
  press: (key: string) => void;
} {
  const battle: BattleFixture = {
    zones: { ...zones },
    hoveredCard: null,
  };
  const hover = (id: string): void => {
    const zone = ALL_ZONE_NAMES.find((name) =>
      battle.zones[name]?.includes(id),
    );
    if (!zone) throw new Error(`card ${id} is not in any zone`);
    battle.hoveredCard = { id, zone, owner: "player" };
  };
  const press = (key: string): void => {
    if (!battle.hoveredCard) return;
    const hotkeys = buildCardMoveHotkeys({
      hoveredCard: battle.hoveredCard,
      moveCard: (card, toZone) => {
        battle.zones[card.zone] = battle.zones[card.zone]?.filter(
          (id) => id !== card.id,
        );
        battle.zones[toZone] = [...(battle.zones[toZone] ?? []), card.id];
      },
      clearHoveredCard: () => {
        battle.hoveredCard = null;
      },
    });
    hotkeys[hotkeyFor(key)]?.();
  };
  return { battle, hover, press };
}

describe("buildCardMoveHotkeys", () => {
  it.each([
    ["G", "graveyard"],
    ["H", "hand"],
    ["B", "battlefield"],
    ["E", "exile"],
    ["L", "library"],
  ] as const)("moves the hovered card with %s to the %s", (key, toZone) => {
    const startZone = toZone === "battlefield" ? "hand" : "battlefield";
    const { battle, hover, press } = createBattle({ [startZone]: ["a"] });

    hover("a");
    press(key);

    expect(battle.zones[toZone]).toEqual(["a"]);
  });

  it("moves only the card under the pointer when the key is pressed again", () => {
    const { battle, hover, press } = createBattle({
      battlefield: ["a", "b", "c"],
    });

    hover("a");
    press("g");
    press("g");

    expect(battle.zones.graveyard).toEqual(["a"]);
    expect(battle.zones.battlefield).toEqual(["b", "c"]);
    expect(battle.hoveredCard).toBeNull();

    hover("c");
    press("g");

    expect(battle.zones.graveyard).toEqual(["a", "c"]);
    expect(battle.zones.battlefield).toEqual(["b"]);
  });

  it("leaves a card that is already in the target zone where it is", () => {
    const { battle, hover, press } = createBattle({ graveyard: ["a"] });

    hover("a");
    press("g");

    expect(battle.zones.graveyard).toEqual(["a"]);
    expect(battle.hoveredCard).toEqual({
      id: "a",
      zone: "graveyard",
      owner: "player",
    });
  });
});

function stubCard(id: string): Card {
  return {
    id,
    name: id,
    image_url: "",
    flip_image_url: null,
    png_url: null,
    flip_png_url: null,
    type_line: "",
    tokens: [],
    elo: null,
    upgrade_target: null,
    oracle_text: null,
    colors: [],
    cmc: 0,
  };
}

function zonesWith(cards: Partial<Record<ZoneName, string[]>>): Zones {
  const zone = (name: ZoneName): Card[] => (cards[name] ?? []).map(stubCard);
  return {
    battlefield: zone("battlefield"),
    graveyard: zone("graveyard"),
    exile: zone("exile"),
    hand: zone("hand"),
    sideboard: zone("sideboard"),
    upgrades: zone("upgrades"),
    command_zone: zone("command_zone"),
    library: zone("library"),
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

describe("findBattleCard", () => {
  const battle = {
    your_zones: zonesWith({ hand: ["mine"] }),
    opponent_zones: zonesWith({ graveyard: ["theirs"] }),
  };

  it("finds the zone and owner of a card that slid under the pointer", () => {
    expect(findBattleCard(battle, "mine")).toEqual({
      id: "mine",
      zone: "hand",
      owner: "player",
    });
    expect(findBattleCard(battle, "theirs")).toEqual({
      id: "theirs",
      zone: "graveyard",
      owner: "opponent",
    });
  });

  it("finds nothing for a card that is not in the battle", () => {
    expect(findBattleCard(battle, "gone")).toBeNull();
  });
});
