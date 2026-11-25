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
import { usePanelHoldsEnter } from "../utils/enterKey";
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
  moveBattleCard: (
    cardId: string,
    fromZone: ZoneName,
    toZone: ZoneName,
    fromOwner: ZoneOwner,
    toOwner: ZoneOwner,
  ) => void;
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

function handleFlipOrFaceDownHotkey(
  hoveredCard: HoveredBattleCard,
  battle: NonNullable<GameState["current_battle"]>,
  battleUpdateCardState: UseGameHotkeysOptions["actions"]["battleUpdateCardState"],
): void {
  const ownerZones =
    hoveredCard.owner === "player" ? battle.your_zones : battle.opponent_zones;
  const isFaceDown = ownerZones.face_down_card_ids?.includes(hoveredCard.id);
  const card = ownerZones[hoveredCard.zone]?.find(
    (candidate) => candidate.id === hoveredCard.id,
  );

  if (
    !canUseBattleFaceDownAction(
      hoveredCard.owner,
      battle.can_manipulate_opponent,
    )
  ) {
    if (
      canUseBattleFlipAction(
        hoveredCard.owner,
        !!isFaceDown,
        battle.can_manipulate_opponent,
      ) &&
      card?.flip_image_url
    ) {
      battleUpdateCardState("flip", hoveredCard.id);
    }
    return;
  }

  if (isFaceDown) {
    battleUpdateCardState("face_down", hoveredCard.id);
  } else if (card?.flip_image_url) {
    battleUpdateCardState("flip", hoveredCard.id);
  } else {
    battleUpdateCardState("face_down", hoveredCard.id);
  }
}

export function useGameHotkeys(options: UseGameHotkeysOptions): void {
  const {
    gameState,
    isSpectator,
    usesOverlaySidebar,
    sidebarPlayers,
    selectedBasics,
    selectedUpgradeId,
    hoveredCard,
    clearHoveredCard,
    visibleGuideStep,
    guideOpen,
    hasRulesPanel,
    showUpgradesModal,
    actionMenuOpen,
    showSubmitHandPopover,
    showSubmitResultPopover,
    buildReadyPending,
    confirmingReveal,
    changingResult,
    modalOpen,
    canRoll,
    openRulesPanel,
    closeSurface,
    openUpgradesModal,
    setScouting,
    toggleBuildSubmitPopover,
    toggleBattleSubmitPopover,
    toggleZonePanel,
    handleGoToBuild,
    handleBuildReadySubmit,
    handleBattleResultSubmit,
    handleContinue,
    startChangingResult,
    moveBattleCard,
    actions,
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
    closeMenu: actionMenuOpen ? () => closeSurface("actions") : null,
    closeUpgrades: showUpgradesModal
      ? {
          key: selfPhase === "battle" ? "v" : "u",
          close: () => closeSurface("upgrades"),
        }
      : null,
  });

  if (gameState && !isSpectator && !gameplayHotkeysDisabled) {
    const { self_player: sp, current_battle: cb } = gameState;
    const phase = sp.phase;

    if (!usesOverlaySidebar && phase !== "battle") {
      sidebarPlayers.slice(0, 8).forEach((player, index) => {
        map[String(index + 1)] = () => setScouting(player.name, "seen");
      });
    }

    if (phase === "draft") {
      map["r"] = () => {
        if (canRoll) actions.draftRoll();
      };
      map["Enter"] = handleGoToBuild;
      map["u"] = () => {
        if (sp.upgrades.length > 0) openUpgradesModal(undefined, "view");
      };
    } else if (phase === "build") {
      const basicsComplete = selectedBasics.filter(Boolean).length === 3;
      const handFull = sp.hand.length === sp.hand_size;
      const canReady = basicsComplete && handFull;

      if (showSubmitHandPopover) {
        if (canReady) {
          map["p"] = () => handleBuildReadySubmit("play");
          map["d"] = () => handleBuildReadySubmit("draw");
        }
        map["Enter"] = () => closeSurface("submitHand");
      } else {
        map["Enter"] = () => {
          if (sp.build_ready) {
            actions.buildUnready();
          } else if (canReady && !buildReadyPending) {
            toggleBuildSubmitPopover();
          }
        };
      }
      if (hoveredCard && sp.upgrades.some((u) => !u.upgrade_target)) {
        map["u"] = () => openUpgradesModal(hoveredCard.id);
      } else {
        map["u"] = () => {
          if (sp.upgrades.length > 0) openUpgradesModal(undefined, "view");
        };
      }
    } else if (phase === "battle" && cb) {
      if (showSubmitResultPopover) {
        map["w"] = () => handleBattleResultSubmit(sp.name);
        map["d"] = () => handleBattleResultSubmit("draw");
        map["l"] = () => handleBattleResultSubmit(cb.opponent_name);
        map["Enter"] = () => closeSurface("submitResult");
      } else {
        map["u"] = () =>
          untapPlayerBattlefield(cb, actions.battleUpdateCardState);
        map["p"] = () => actions.battlePassTurn();
        if (hoveredCard) {
          const ownerZones =
            hoveredCard.owner === "player" ? cb.your_zones : cb.opponent_zones;
          map["t"] = () => {
            if (hoveredCard.zone === "battlefield") {
              const tapped = ownerZones.tapped_card_ids?.includes(
                hoveredCard.id,
              );
              actions.battleUpdateCardState(
                tapped ? "untap" : "tap",
                hoveredCard.id,
              );
            }
          };
          map["f"] = () =>
            handleFlipOrFaceDownHotkey(
              hoveredCard,
              cb,
              actions.battleUpdateCardState,
            );
          const moveHotkeys = buildCardMoveHotkeys({
            hoveredCard,
            moveCard: (card, toZone) =>
              moveBattleCard(
                card.id,
                card.zone,
                toZone,
                card.owner,
                card.owner,
              ),
            clearHoveredCard,
          });
          Object.assign(map, moveHotkeys);
        } else {
          map["t"] = () =>
            actions.battleUpdateCardState("create_treasure", "", {});
          map["g"] = () => toggleZonePanel("graveyard", "player");
          map["e"] = () => toggleZonePanel("exile", "player");
          map["s"] = () => toggleZonePanel("sideboard", "player");
        }
        map["Enter"] = () => {
          const mySubmission = cb.result_submissions[sp.name];
          if (mySubmission && !changingResult) {
            startChangingResult();
          } else {
            toggleBattleSubmitPopover();
          }
        };
        map["v"] = () => {
          if (sp.upgrades.length > 0) openUpgradesModal(undefined, "view");
        };
      }
    } else if (phase === "reward") {
      map["Enter"] = () => {
        const needsUpgrade =
          sp.is_stage_increasing && gameState.available_upgrades.length > 0;
        if (!needsUpgrade || !!selectedUpgradeId) {
          handleContinue();
        }
      };
    }
  }

  useHotkeys(map);
}
