/**
 * Board interaction callbacks and phase-submission actions for `useGameController`.
 */
import { useCallback } from "react";
import type { RulesPanelTarget } from "../components/RulesPanel";
import type { ZoneOwner } from "../dnd";
import type { GuidedGuideId } from "../guided/types";
import {
  initialPhaseActionState,
  reducePhaseAction,
  type PhaseAction,
} from "../pages/pendingPhaseAction";
import type { BattleZoneModalState } from "../pages/phases/Battle";
import type { Card as CardType, GameState, ZoneName } from "../types";
import { getUnrevealedAppliedUpgrades } from "../utils/upgrades";
import type { UseBattleEndFlowResult } from "./useBattleEndFlow";
import type { GameActions } from "./useGame";
import type { useGamePointerHover } from "./useGameSessionSync";
import type {
  GameSurface,
  GameSurfaceKind,
  PanelZone,
  UpgradesWindowMode,
  UseGameSurfacesResult,
} from "./useGameSurfaces";

export function useGameBoardCallbacks(options: {
  gameState: GameState | null;
  isSpectator: boolean;
  actions: GameActions;
  surfaces: UseGameSurfacesResult;
  battleEnd: UseBattleEndFlowResult;
  buildReadyPending: boolean;
  showSubmitResultPopover: boolean;
  addToast: (message: string, type?: "error" | "info" | "warning") => void;
  setHoveredCard: ReturnType<typeof useGamePointerHover>["setHoveredCard"];
  setPendingBuildUpgradeAnimation: React.Dispatch<
    React.SetStateAction<{ upgradeId: string; targetId: string } | null>
  >;
  requestGuideCompletion: (guideId: GuidedGuideId, stepId: string) => void;
}): {
  openGameSurface: (surface: GameSurface) => void;
  closeGameplayOverlays: (except?: GameSurfaceKind) => void;
  openRulesPanel: (target?: RulesPanelTarget) => void;
  openUpgradesModal: (
    targetCardId?: string,
    mode?: UpgradesWindowMode,
    revealIds?: string[],
  ) => void;
  openBattleRevealUpgradesModal: (initialRevealIds?: string[]) => void;
  toggleBuildSubmitPopover: () => void;
  toggleBattleSubmitPopover: () => void;
  toggleZonePanel: (zone: PanelZone, owner: ZoneOwner) => void;
  setBattleZoneModalOpen: (
    zone: BattleZoneModalState["zone"],
    owner: ZoneOwner,
    open: boolean,
  ) => void;
  handleCardHover: (id: string, zone: ZoneName) => void;
  handleOpponentCardHover: (id: string, zone: ZoneName) => void;
  handleCardHoverEnd: () => void;
  handleSideboardEmptyClick: (owner: ZoneOwner) => void;
  handleOpenSideboardCardMenu: (
    e: React.MouseEvent,
    card: CardType,
    owner: ZoneOwner,
  ) => void;
  handleApplyUpgrade: (upgradeId: string, targetId: string) => void;
  handleRevealUpgrades: (upgradeIds: string[]) => void;
  handleRollDie: (sides: number) => void;
  handleYourLifeChange: (life: number) => void;
  handleOpponentLifeChange: (life: number) => void;
  handleCreateTreasure: () => void;
  handleCreateOpponentTreasure: () => void;
  untapAll: (opponent?: boolean) => void;
} {
  const {
    gameState,
    isSpectator,
    actions,
    surfaces,
    battleEnd,
    buildReadyPending,
    showSubmitResultPopover,
    addToast,
    setHoveredCard,
    setPendingBuildUpgradeAnimation,
    requestGuideCompletion,
  } = options;

  const openGameSurface = useCallback(
    (surface: GameSurface) => {
      if (surface.kind !== "submitResult") battleEnd.cancelChangingResult();
      surfaces.open(surface);
    },
    [battleEnd, surfaces],
  );
  const closeGameplayOverlays = useCallback(
    (except?: GameSurfaceKind) => {
      if (except !== "submitResult") battleEnd.cancelChangingResult();
      surfaces.closeOverlays(except);
    },
    [battleEnd, surfaces],
  );
  const openRulesPanel = useCallback(
    (target?: RulesPanelTarget) => openGameSurface({ kind: "guide", target }),
    [openGameSurface],
  );
  const openUpgradesModal = useCallback(
    (
      targetCardId?: string,
      mode: UpgradesWindowMode = "auto",
      revealIds: string[] = [],
    ) =>
      openGameSurface({
        kind: "upgrades",
        mode,
        targetId: targetCardId,
        revealIds,
      }),
    [openGameSurface],
  );
  const toggleBuildSubmitPopover = useCallback(() => {
    if (surfaces.submitHandOpen || buildReadyPending) {
      surfaces.close("submitHand");
      return;
    }
    openGameSurface({ kind: "submitHand" });
  }, [buildReadyPending, openGameSurface, surfaces]);
  const toggleBattleSubmitPopover = useCallback(() => {
    if (showSubmitResultPopover || battleEnd.submitPending) {
      surfaces.close("submitResult");
      return;
    }
    openGameSurface({ kind: "submitResult" });
  }, [
    battleEnd.submitPending,
    openGameSurface,
    showSubmitResultPopover,
    surfaces,
  ]);
  const toggleZonePanel = useCallback(
    (zone: PanelZone, owner: ZoneOwner) => {
      if (surfaces.isZonePanelOpen(zone, owner)) {
        surfaces.close("zone");
        return;
      }
      openGameSurface({ kind: "zone", zone, owner });
    },
    [openGameSurface, surfaces],
  );
  const setBattleZoneModalOpen = useCallback(
    (zone: BattleZoneModalState["zone"], owner: ZoneOwner, open: boolean) => {
      const same = surfaces.isZonePanelOpen(zone, owner);
      if (!open) {
        if (same) surfaces.close("zone");
      } else if (!same) {
        openGameSurface({ kind: "zone", zone, owner });
      }
    },
    [openGameSurface, surfaces],
  );
  const handleCardHover = useCallback(
    (id: string, zone: ZoneName) =>
      setHoveredCard({ id, zone, owner: "player" }),
    [setHoveredCard],
  );
  const handleOpponentCardHover = useCallback(
    (id: string, zone: ZoneName) =>
      setHoveredCard({ id, zone, owner: "opponent" }),
    [setHoveredCard],
  );
  const handleCardHoverEnd = useCallback(
    () => setHoveredCard(null),
    [setHoveredCard],
  );
  const handleSideboardEmptyClick = useCallback(
    (owner: ZoneOwner) => {
      const sel = surfaces.selectedCard;
      if (sel && (sel.zone !== "sideboard" || sel.owner !== owner)) {
        actions.battleMove({
          cardId: sel.card.id,
          fromZone: sel.zone,
          toZone: "sideboard",
          fromOwner: sel.owner,
          toOwner: owner,
        });
        surfaces.setSelectedCard(null);
      }
    },
    [actions, surfaces],
  );
  const handleOpenSideboardCardMenu = useCallback(
    (e: React.MouseEvent, card: CardType, owner: ZoneOwner) => {
      surfaces.setCardMenu({
        card,
        zone: "sideboard",
        position: { x: e.clientX, y: e.clientY },
        isOpponent: owner === "opponent",
      });
    },
    [surfaces],
  );
  const handleApplyUpgrade = useCallback(
    (upgradeId: string, targetId: string) => {
      setPendingBuildUpgradeAnimation({ upgradeId, targetId });
      actions.buildApplyUpgrade(upgradeId, targetId);
    },
    [actions, setPendingBuildUpgradeAnimation],
  );
  const handleRevealUpgrades = useCallback(
    (upgradeIds: string[]) => {
      upgradeIds.forEach((id) => actions.battleRevealUpgrade(id));
    },
    [actions],
  );
  const handleRollDie = useCallback(
    (sides: number) => {
      addToast(
        `Rolled a d${sides}: ${Math.floor(Math.random() * sides) + 1}`,
        "info",
      );
    },
    [addToast],
  );
  const handleYourLifeChange = useCallback(
    (life: number) => {
      if (!isSpectator) actions.battleUpdateLife("you", life);
    },
    [actions, isSpectator],
  );
  const handleOpponentLifeChange = useCallback(
    (life: number) => {
      if (!isSpectator) actions.battleUpdateLife("opponent", life);
    },
    [actions, isSpectator],
  );
  const handleCreateTreasure = useCallback(() => {
    actions.battleUpdateCardState("create_treasure", "", {});
  }, [actions]);
  const handleCreateOpponentTreasure = useCallback(() => {
    actions.battleUpdateCardState("create_treasure", "", {
      for_opponent: true,
    });
  }, [actions]);
  const untapAll = (opponent = false): void => {
    const battle = gameState?.current_battle;
    if (!battle) return;
    const zones = opponent ? battle.opponent_zones : battle.your_zones;
    const battlefieldIds = new Set(zones.battlefield.map((c) => c.id));
    for (const cardId of zones.tapped_card_ids || []) {
      if (battlefieldIds.has(cardId)) {
        actions.battleUpdateCardState("untap", cardId);
      }
    }
  };
  const openBattleRevealUpgradesModal = (
    initialRevealIds: string[] = [],
  ): void => {
    requestGuideCompletion("hint_battle_unrevealed_upgrade", "reveal-upgrade");
    openUpgradesModal(undefined, "reveal", initialRevealIds);
  };

  return {
    openGameSurface,
    closeGameplayOverlays,
    openRulesPanel,
    openUpgradesModal,
    openBattleRevealUpgradesModal,
    toggleBuildSubmitPopover,
    toggleBattleSubmitPopover,
    toggleZonePanel,
    setBattleZoneModalOpen,
    handleCardHover,
    handleOpponentCardHover,
    handleCardHoverEnd,
    handleSideboardEmptyClick,
    handleOpenSideboardCardMenu,
    handleApplyUpgrade,
    handleRevealUpgrades,
    handleRollDie,
    handleYourLifeChange,
    handleOpponentLifeChange,
    handleCreateTreasure,
    handleCreateOpponentTreasure,
    untapAll,
  };
}

export function usePhaseSubmitActions(options: {
  gameState: GameState | null;
  actions: GameActions;
  battleEnd: UseBattleEndFlowResult;
  selectedBasics: string[];
  selectedUpgradeId: string | null;
  handSlotsRef: React.RefObject<(string | null)[]>;
  pendingAction: ReturnType<typeof initialPhaseActionState>["pending"];
  dispatchPhaseAction: React.Dispatch<Parameters<typeof reducePhaseAction>[1]>;
  closeGameplayOverlays: (except?: GameSurfaceKind) => void;
  requestGuideCompletion: (guideId: GuidedGuideId, stepId: string) => void;
}): {
  handleBuildReadySubmit: (playDrawPreference: "play" | "draw") => void;
  handleBattleResultSubmit: (result: string) => void;
  handleContinue: () => void;
  handleGoToBuild: () => void;
} {
  const {
    gameState,
    actions,
    battleEnd,
    selectedBasics,
    selectedUpgradeId,
    handSlotsRef,
    pendingAction,
    dispatchPhaseAction,
    closeGameplayOverlays,
    requestGuideCompletion,
  } = options;

  const sendPhaseAction = useCallback(
    (action: PhaseAction, sendFn: () => void) => {
      if (pendingAction) return false;
      dispatchPhaseAction({ type: "sent", action });
      sendFn();
      return true;
    },
    [dispatchPhaseAction, pendingAction],
  );

  const handleBuildReadySubmit = useCallback(
    (playDrawPreference: "play" | "draw") => {
      if (!gameState || gameState.self_player.phase !== "build") return;
      const sent = sendPhaseAction("build_ready", () =>
        actions.buildReady(
          selectedBasics,
          playDrawPreference,
          handSlotsRef.current.filter((id): id is string => id !== null),
        ),
      );
      if (!sent) return;
      requestGuideCompletion("build_play_draw", "play-draw");
      closeGameplayOverlays();
    },
    [
      actions,
      closeGameplayOverlays,
      gameState,
      handSlotsRef,
      requestGuideCompletion,
      selectedBasics,
      sendPhaseAction,
    ],
  );
  const handleBattleResultSubmit = useCallback(
    (result: string) => {
      requestGuideCompletion("battle_result_submit", "result-submit");
      const isLoss =
        result !== gameState?.self_player.name && result !== "draw";
      const unrevealed = gameState
        ? getUnrevealedAppliedUpgrades(gameState.self_player.upgrades)
        : [];
      battleEnd.submitResult(result, !isLoss && unrevealed.length > 0);
    },
    [battleEnd, gameState, requestGuideCompletion],
  );
  const handleContinue = useCallback(() => {
    if (
      !sendPhaseAction("reward_done", () =>
        actions.rewardDone(selectedUpgradeId ?? undefined),
      )
    ) {
      return;
    }
    requestGuideCompletion("reward", "continue");
  }, [actions, requestGuideCompletion, selectedUpgradeId, sendPhaseAction]);
  const handleGoToBuild = useCallback(() => {
    sendPhaseAction("draft_done", actions.draftDone);
  }, [actions, sendPhaseAction]);

  return {
    handleBuildReadySubmit,
    handleBattleResultSubmit,
    handleContinue,
    handleGoToBuild,
  };
}
