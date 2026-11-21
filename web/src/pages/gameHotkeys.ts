import type { ZoneOwner } from "../dnd/types";
import type { BattleView, ZoneName } from "../types";

type HotkeyMap = Record<string, () => void>;

export interface HoveredBattleCard {
  id: string;
  zone: ZoneName;
  owner: ZoneOwner;
}

const MOVE_HOTKEY_ZONES = {
  g: "graveyard",
  h: "hand",
  b: "battlefield",
  e: "exile",
  l: "library",
} as const satisfies Record<string, ZoneName>;

const CARD_ZONES: ZoneName[] = [
  "battlefield",
  "hand",
  "graveyard",
  "exile",
  "library",
  "sideboard",
  "command_zone",
  "upgrades",
];

export function findBattleCard(
  battle: Pick<BattleView, "your_zones" | "opponent_zones">,
  cardId: string,
): HoveredBattleCard | null {
  const sides = [
    ["player", battle.your_zones],
    ["opponent", battle.opponent_zones],
  ] as const;
  for (const [owner, zones] of sides) {
    const zone = CARD_ZONES.find((name) => zones[name].some((card) => card.id === cardId));
    if (zone) return { id: cardId, zone, owner };
  }
  return null;
}

export function buildPanelHotkeys(options: {
  guideOpen: boolean;
  sidebarDrawerOpen: boolean;
  gameplayHotkeysDisabled: boolean;
  openGuide: () => void;
  closeGuide: () => void;
  closeSidebarDrawer: () => void;
}): HotkeyMap {
  if (options.guideOpen) return { "?": options.closeGuide };
  if (options.gameplayHotkeysDisabled) return {};
  const map: HotkeyMap = { "?": options.openGuide };
  if (options.sidebarDrawerOpen) map.escape = options.closeSidebarDrawer;
  return map;
}

export function buildCardMoveHotkeys(options: {
  hoveredCard: HoveredBattleCard;
  moveCard: (card: HoveredBattleCard, toZone: ZoneName) => void;
  clearHoveredCard: () => void;
}): HotkeyMap {
  const { hoveredCard, moveCard, clearHoveredCard } = options;
  const map: HotkeyMap = {};
  for (const [key, toZone] of Object.entries(MOVE_HOTKEY_ZONES)) {
    map[key] = () => {
      if (toZone === hoveredCard.zone) return;
      moveCard(hoveredCard, toZone);
      // The moved card unmounts without a mouseleave, so the pointer's next
      // mouseenter, not the zone order, decides which card is hovered next.
      clearHoveredCard();
    };
  }
  return map;
}
