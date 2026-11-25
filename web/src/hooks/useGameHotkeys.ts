/**
 * Centralized gameplay and panel hotkey hook for `Game.tsx`.
 *
 * Reads open-surface and battle-end blocking state from the single owners so
 * hotkeys stay consistent with Guided Mode and Enter-key panel guards.
 */
import type { RulesPanelTarget } from "../components/RulesPanel";
import type { ZoneOwner } from "../dnd/types";
import {
  shouldDisableGameplayHotkeys,
  type VisibleGuideStep,
} from "../pages/gameGuideState";
import {
  buildCardMoveHotkeys,
  buildPanelHotkeys,
  type HoveredBattleCard,
} from "../pages/gameHotkeys";
import type {
  CardStateAction,
  GameState,
  PlayerView,
  ZoneName,
} from "../types";
import {
  canUseBattleFaceDownAction,
  canUseBattleFlipAction,
} from "../utils/battleInteraction";
import { usePanelHoldsEnter } from "./usePanelHoldsEnter";
import type {
  GameSurfaceKind,
  PanelZone,
  ScoutingTab,
} from "./useGameSurfaces";
import { useRollExhaustedEnterGuard } from "./useGameSessionSync";
import { useHotkeys } from "./useHotkeys";

interface UseGameHotkeysOptions {
  gameState: GameState | null;
  isSpectator: boolean;
  usesOverlaySidebar: boolean;
  sidebarPlayers: readonly PlayerView[];
  selectedBasics: readonly string[];
  selectedUpgradeId: string | null;
  hoveredCard: HoveredBattleCard | null;
  clearHoveredCard: () => void;
  visibleGuideStep: VisibleGuideStep | null;
  guideOpen: boolean;
  hasRulesPanel: boolean;
  showUpgradesModal: boolean;
  actionMenuOpen: boolean;
  showSubmitHandPopover: boolean;
  showSubmitResultPopover: boolean;
  buildReadyPending: boolean;
  confirmingReveal: boolean;
  changingResult: boolean;
  modalOpen: boolean;
  canRoll: boolean;
  openRulesPanel: (target?: RulesPanelTarget) => void;
  closeSurface: (kind: GameSurfaceKind) => void;
  openUpgradesModal: (
    targetCardId?: string,
    mode?: "auto" | "view" | "reveal",
  ) => void;
  setScouting: (player: string | null, tab?: ScoutingTab) => void;
  toggleBuildSubmitPopover: () => void;
  toggleBattleSubmitPopover: () => void;
  toggleZonePanel: (zone: PanelZone, owner: ZoneOwner) => void;
  handleGoToBuild: () => void;
  handleBuildReadySubmit: (preference: "play" | "draw") => void;
  handleBattleResultSubmit: (result: string) => void;
  handleContinue: () => void;
  startChangingResult: () => void;
  moveBattleCard: (move: {
    cardId: string;
    fromZone: ZoneName;
    toZone: ZoneName;
    fromOwner: ZoneOwner;
    toOwner: ZoneOwner;
  }) => void;
  actions: {
    draftRoll: () => void;
    buildUnready: () => void;
    battleUpdateCardState: (
      actionType: CardStateAction,
      cardId: string,
      data?: Record<string, unknown>,
    ) => void;
    battlePassTurn: () => void;
  };
}

function untapPlayerBattlefield(
  battle: NonNullable<GameState["current_battle"]>,
  battleUpdateCardState: UseGameHotkeysOptions["actions"]["battleUpdateCardState"],
): void {
  const battlefieldIds = new Set(
    battle.your_zones.battlefield.map((c) => c.id),
  );
  for (const cardId of battle.your_zones.tapped_card_ids || []) {
    if (battlefieldIds.has(cardId)) {
      battleUpdateCardState("untap", cardId);
    }
  }
}

function findHoveredBattleCard(
  hoveredCard: HoveredBattleCard,
  battle: NonNullable<GameState["current_battle"]>,
): { isFaceDown: boolean; hasFlip: boolean } {
  const ownerZones =
    hoveredCard.owner === "player" ? battle.your_zones : battle.opponent_zones;
  const isFaceDown =
    ownerZones.face_down_card_ids?.includes(hoveredCard.id) ?? false;
  const card = ownerZones[hoveredCard.zone]?.find(
    (candidate) => candidate.id === hoveredCard.id,
  );
  return { isFaceDown, hasFlip: Boolean(card?.flip_image_url) };
}

function handleFlipOrFaceDownHotkey(
  hoveredCard: HoveredBattleCard,
  battle: NonNullable<GameState["current_battle"]>,
  battleUpdateCardState: UseGameHotkeysOptions["actions"]["battleUpdateCardState"],
): void {
  const { isFaceDown, hasFlip } = findHoveredBattleCard(hoveredCard, battle);
  const canFaceDown = canUseBattleFaceDownAction(
    hoveredCard.owner,
    battle.can_manipulate_opponent,
  );
  if (!canFaceDown) {
    const canFlip =
      hasFlip &&
      canUseBattleFlipAction(
        hoveredCard.owner,
        isFaceDown,
        battle.can_manipulate_opponent,
      );
    if (canFlip) battleUpdateCardState("flip", hoveredCard.id);
    return;
  }
  battleUpdateCardState(
    !isFaceDown && hasFlip ? "flip" : "face_down",
    hoveredCard.id,
  );
}

function addDraftHotkeys(
  map: Record<string, () => void>,
  options: UseGameHotkeysOptions,
  hasUpgrades: boolean,
): void {
  map["r"] = (): void => {
    if (options.canRoll) options.actions.draftRoll();
  };
  map["Enter"] = options.handleGoToBuild;
  map["u"] = (): void => {
    if (hasUpgrades) options.openUpgradesModal(undefined, "view");
  };
}

function addBuildHotkeys(
  map: Record<string, () => void>,
  options: UseGameHotkeysOptions,
  sp: GameState["self_player"],
): void {
  const basicsComplete = options.selectedBasics.filter(Boolean).length === 3;
  const canReady = basicsComplete && sp.hand.length === sp.hand_size;

  if (options.showSubmitHandPopover) {
    if (canReady) {
      map["p"] = (): void => options.handleBuildReadySubmit("play");
      map["d"] = (): void => options.handleBuildReadySubmit("draw");
    }
    map["Enter"] = (): void => options.closeSurface("submitHand");
  } else {
    map["Enter"] = (): void => {
      if (sp.build_ready) {
        options.actions.buildUnready();
      } else if (canReady && !options.buildReadyPending) {
        options.toggleBuildSubmitPopover();
      }
    };
  }

  const { hoveredCard } = options;
  if (hoveredCard && sp.upgrades.some((u) => !u.upgrade_target)) {
    map["u"] = (): void => options.openUpgradesModal(hoveredCard.id);
  } else {
    map["u"] = (): void => {
      if (sp.upgrades.length > 0) options.openUpgradesModal(undefined, "view");
    };
  }
}

function addHoveredBattleCardHotkeys(
  map: Record<string, () => void>,
  options: UseGameHotkeysOptions,
  cb: NonNullable<GameState["current_battle"]>,
): void {
  const { hoveredCard, actions, moveBattleCard, clearHoveredCard } = options;
  if (!hoveredCard) return;
  const ownerZones =
    hoveredCard.owner === "player" ? cb.your_zones : cb.opponent_zones;
  map["t"] = (): void => {
    if (hoveredCard.zone === "battlefield") {
      const tapped = ownerZones.tapped_card_ids?.includes(hoveredCard.id);
      actions.battleUpdateCardState(tapped ? "untap" : "tap", hoveredCard.id);
    }
  };
  map["f"] = (): void =>
    handleFlipOrFaceDownHotkey(hoveredCard, cb, actions.battleUpdateCardState);
  Object.assign(
    map,
    buildCardMoveHotkeys({
      hoveredCard,
      moveCard: (card, toZone) =>
        moveBattleCard({
          cardId: card.id,
          fromZone: card.zone,
          toZone,
          fromOwner: card.owner,
          toOwner: card.owner,
        }),
      clearHoveredCard,
    }),
  );
}

function addBattleHotkeys(
  map: Record<string, () => void>,
  options: UseGameHotkeysOptions,
  gameState: GameState,
): void {
  const { self_player: sp, current_battle: cb } = gameState;
  if (!cb) return;

  if (options.showSubmitResultPopover) {
    map["w"] = (): void => options.handleBattleResultSubmit(sp.name);
    map["d"] = (): void => options.handleBattleResultSubmit("draw");
    map["l"] = (): void => options.handleBattleResultSubmit(cb.opponent_name);
    map["Enter"] = (): void => options.closeSurface("submitResult");
    return;
  }

  map["u"] = (): void =>
    untapPlayerBattlefield(cb, options.actions.battleUpdateCardState);
  map["p"] = (): void => options.actions.battlePassTurn();
  if (options.hoveredCard) {
    addHoveredBattleCardHotkeys(map, options, cb);
  } else {
    map["t"] = (): void =>
      options.actions.battleUpdateCardState("create_treasure", "", {});
    map["g"] = (): void => options.toggleZonePanel("graveyard", "player");
    map["e"] = (): void => options.toggleZonePanel("exile", "player");
    map["s"] = (): void => options.toggleZonePanel("sideboard", "player");
  }
  map["Enter"] = (): void => {
    const mySubmission = cb.result_submissions[sp.name];
    if (mySubmission && !options.changingResult) {
      options.startChangingResult();
    } else {
      options.toggleBattleSubmitPopover();
    }
  };
  map["v"] = (): void => {
    if (sp.upgrades.length > 0) options.openUpgradesModal(undefined, "view");
  };
}

function addGameplayHotkeys(
  map: Record<string, () => void>,
  options: UseGameHotkeysOptions,
  gameState: GameState,
): void {
  const { self_player: sp } = gameState;
  const phase = sp.phase;

  if (!options.usesOverlaySidebar && phase !== "battle") {
    options.sidebarPlayers.slice(0, 8).forEach((player, index) => {
      map[String(index + 1)] = (): void =>
        options.setScouting(player.name, "seen");
    });
  }

  if (phase === "draft") {
    addDraftHotkeys(map, options, sp.upgrades.length > 0);
  } else if (phase === "build") {
    addBuildHotkeys(map, options, sp);
  } else if (phase === "battle") {
    addBattleHotkeys(map, options, gameState);
  } else if (phase === "reward") {
    map["Enter"] = (): void => {
      const needsUpgrade =
        sp.is_stage_increasing && gameState.available_upgrades.length > 0;
      if (!needsUpgrade || Boolean(options.selectedUpgradeId)) {
        options.handleContinue();
      }
    };
  }
}

export function useGameHotkeys(options: UseGameHotkeysOptions): void {
  const {
    gameState,
    isSpectator,
    visibleGuideStep,
    guideOpen,
    hasRulesPanel,
    showUpgradesModal,
    actionMenuOpen,
    confirmingReveal,
    modalOpen,
    canRoll,
    openRulesPanel,
    closeSurface,
  } = options;

  const selfPhase = gameState?.self_player.phase;
  const gameplayHotkeysDisabled = shouldDisableGameplayHotkeys({
    modalOpen,
    visibleGuideStep,
  });

  // Reveal Before Submit is where a Fight ends, so it keeps its own Enter.
  usePanelHoldsEnter(modalOpen && !confirmingReveal);
  useRollExhaustedEnterGuard(canRoll, selfPhase);

  const map = buildPanelHotkeys({
    guideOpen,
    gameplayHotkeysDisabled,
    openGuide: () => {
      openRulesPanel(
        !hasRulesPanel &&
          selfPhase &&
          ["draft", "build", "battle", "reward"].includes(selfPhase)
          ? { docId: selfPhase, tab: "controls" }
          : undefined,
      );
    },
    closeGuide: () => closeSurface("guide"),
    closeMenu: actionMenuOpen ? (): void => closeSurface("actions") : null,
    closeUpgrades: showUpgradesModal
      ? {
          key: selfPhase === "battle" ? "v" : "u",
          close: (): void => closeSurface("upgrades"),
        }
      : null,
  });

  if (gameState && !isSpectator && !gameplayHotkeysDisabled) {
    addGameplayHotkeys(map, options, gameState);
  }

  useHotkeys(map);
}
