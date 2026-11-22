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
  gameplayHotkeysDisabled: boolean;
  openGuide: () => void;
  closeGuide: () => void;
  /** Closes the Actions menu while it is open. Side panels close themselves on Escape. */
  closeMenu: (() => void) | null;
  /** Closes the Upgrades window while it is open, with the key that opened it. */
  closeUpgrades: { key: string; close: () => void } | null;
}): HotkeyMap {
  // Actions can open over a minimized Guide, so it takes Escape first.
  if (options.closeMenu) return { escape: options.closeMenu };
  if (options.guideOpen) return { "?": options.closeGuide };
  if (options.closeUpgrades) return { [options.closeUpgrades.key]: options.closeUpgrades.close };
  if (options.gameplayHotkeysDisabled) return {};
  return { "?": options.openGuide };
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
