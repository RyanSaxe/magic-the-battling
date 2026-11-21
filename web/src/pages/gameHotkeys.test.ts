import { describe, expect, it } from "vitest";
import { hotkeyFor } from "../hooks/useHotkeys";
import type { Card, ZoneName, Zones } from "../types";
import {
  buildCardMoveHotkeys,
  buildPanelHotkeys,
  findBattleCard,
  type HoveredBattleCard,
} from "./gameHotkeys";

function createPanels(initial: { guideOpen?: boolean; sidebarDrawerOpen?: boolean; otherModalOpen?: boolean }) {
  const panels = {
    guideOpen: initial.guideOpen ?? false,
    sidebarDrawerOpen: initial.sidebarDrawerOpen ?? false,
    otherModalOpen: initial.otherModalOpen ?? false,
  };
  const press = (key: string) => {
    const hotkeys = buildPanelHotkeys({
      guideOpen: panels.guideOpen,
      sidebarDrawerOpen: panels.sidebarDrawerOpen,
      gameplayHotkeysDisabled: panels.guideOpen || panels.otherModalOpen,
      openGuide: () => { panels.guideOpen = true; },
      closeGuide: () => { panels.guideOpen = false; },
      closeSidebarDrawer: () => { panels.sidebarDrawerOpen = false; },
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

  it("closes the sidebar drawer with Escape", () => {
    const { panels, press } = createPanels({ sidebarDrawerOpen: true });

    press("Escape");

    expect(panels.sidebarDrawerOpen).toBe(false);
  });

  it("keeps the sidebar drawer open when Escape is closing a modal or the guide", () => {
    const overModal = createPanels({ sidebarDrawerOpen: true, otherModalOpen: true });
    overModal.press("Escape");
    expect(overModal.panels.sidebarDrawerOpen).toBe(true);

    const overGuide = createPanels({ sidebarDrawerOpen: true, guideOpen: true });
    overGuide.press("Escape");
    expect(overGuide.panels.sidebarDrawerOpen).toBe(true);
  });
});

function createBattle(zones: Partial<Record<ZoneName, string[]>>) {
  const battle = {
    zones: { ...zones } as Partial<Record<ZoneName, string[]>>,
    hoveredCard: null as HoveredBattleCard | null,
  };
  const hover = (id: string) => {
    const zone = (Object.keys(battle.zones) as ZoneName[]).find((name) => battle.zones[name]?.includes(id));
    if (!zone) throw new Error(`card ${id} is not in any zone`);
    battle.hoveredCard = { id, zone, owner: "player" };
  };
  const press = (key: string) => {
    if (!battle.hoveredCard) return;
    const hotkeys = buildCardMoveHotkeys({
      hoveredCard: battle.hoveredCard,
      moveCard: (card, toZone) => {
        battle.zones[card.zone] = battle.zones[card.zone]?.filter((id) => id !== card.id);
        battle.zones[toZone] = [...(battle.zones[toZone] ?? []), card.id];
      },
      clearHoveredCard: () => { battle.hoveredCard = null; },
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
    const { battle, hover, press } = createBattle({ battlefield: ["a", "b", "c"] });

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
    expect(battle.hoveredCard).toEqual({ id: "a", zone: "graveyard", owner: "player" });
  });
});

function zonesWith(cards: Partial<Record<ZoneName, string[]>>): Zones {
  const zone = (name: ZoneName) => (cards[name] ?? []).map((id) => ({ id }) as Card);
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
    expect(findBattleCard(battle, "mine")).toEqual({ id: "mine", zone: "hand", owner: "player" });
    expect(findBattleCard(battle, "theirs")).toEqual({ id: "theirs", zone: "graveyard", owner: "opponent" });
  });

  it("finds nothing for a card that is not in the battle", () => {
    expect(findBattleCard(battle, "gone")).toBeNull();
  });
});
