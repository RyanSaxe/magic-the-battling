/**
 * Floating overlays, dialogs, notices, and the Guided Mode walkthrough layer
 * rendered over the game table.
 */
import { useCallback, useMemo, type RefObject } from "react";
import type { ZoneOwner } from "../../dnd";
import { buildGuideDefinition } from "../../guided/content";
import { GuidedWalkthrough } from "../../guided/GuidedWalkthrough";
import { useGuideContext } from "../../guided/guideState";
import type { GuidedWalkthroughContext } from "../../guided/types";
import type {
  GameSurfaceKind,
  GuideSurface,
  PanelZone,
  ScoutingTab,
  UpgradesSurface,
} from "../../hooks/useGameSurfaces";
import { useGuideSidebarSync } from "../../hooks/useGuidedWalkthrough";
import type { SpectateRequest } from "../../hooks/useWebSocket";
import type { VisibleGuideStep } from "../../pages/gameGuideState";
import type { BattleSelectedCard } from "../../pages/phases/Battle";
import type {
  Card as CardType,
  CardStateAction,
  GameState,
  RevealAnimation,
  ServerNoticeStatus,
  ZoneName,
} from "../../types";
import { getUnrevealedAppliedUpgrades } from "../../utils/upgrades";
import { ActionMenu } from "../ActionMenu";
import { CardPreviewModal } from "../card";
import { BattleRevealOverlay } from "../common/BattleRevealOverlay";
import { BuildUpgradeOverlay } from "../common/BuildUpgradeOverlay";
import { RevealBeforeSubmitModal } from "../common/RevealBeforeSubmitModal";
import { RotatePrompt } from "../common/RotatePrompt";
import { ServerStatusWindow } from "../common/ServerStatusWindow";
import { DIALOG_BACKDROP, POPOVER_CHROME } from "../common/styles";
import { UpgradesModal } from "../common/UpgradesModal";
import { RulesPanel } from "../RulesPanel";
import { ShareModal } from "../ShareModal";
import type { Scouting } from "../sidebar";
import { SpectateRequestModal } from "../SpectateRequestModal";

export function GameGuideLayer({
  rootRef,
  context,
  sidebarOpen,
  setSidebarOpen,
  scouting,
  setScouting,
  onVisibleGuideStepChange,
}: {
  rootRef: RefObject<HTMLElement | null>;
  context: GuidedWalkthroughContext;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  scouting: Scouting | null;
  setScouting: (player: string | null, tab?: ScoutingTab) => void;
  onVisibleGuideStepChange: (step: VisibleGuideStep | null) => void;
}) {
  const {
    guideRequest,
    dismissedImmediately,
    finishGuide,
    skipTutorial,
    advanceGuideStep,
    backGuideStep,
  } = useGuideContext();

  const stepIndex = guideRequest?.stepIndex ?? 0;
  const guide = useMemo(
    () =>
      guideRequest ? buildGuideDefinition(guideRequest.guideId, context) : null,
    [context, guideRequest],
  );
  const activeStep = guide?.steps[stepIndex] ?? null;

  useGuideSidebarSync({
    guideRequest,
    activeStep,
    context,
    sidebarOpen,
    setSidebarOpen,
    scouting,
    setScouting,
  });

  const handleAdvanceStep = useCallback(() => {
    if (!guide) return;
    advanceGuideStep(guide.steps.length);
  }, [advanceGuideStep, guide]);

  return (
    <GuidedWalkthrough
      rootRef={rootRef}
      request={guideRequest}
      context={context}
      stepIndex={stepIndex}
      requestActive={guideRequest !== null}
      dismissedImmediately={dismissedImmediately}
      onClose={finishGuide}
      onSkipAll={skipTutorial}
      onAdvanceStep={handleAdvanceStep}
      onBackStep={backGuideStep}
      onVisibleGuideStepChange={onVisibleGuideStepChange}
    />
  );
}

export function GameReconnectAndStatusOverlays({
  isConnected,
  serverNotice,
  serverNoticeHidden,
  onDismissServerStatus,
}: {
  isConnected: boolean;
  serverNotice: ServerNoticeStatus | null;
  serverNoticeHidden: boolean;
  onDismissServerStatus: (updatedAt: string) => void;
}) {
  return (
    <>
      {!isConnected && (
        <div
          className={`fixed inset-0 z-50 ${DIALOG_BACKDROP} flex items-center justify-center`}
        >
          <div
            className={`${POPOVER_CHROME} px-5 py-3 flex items-center gap-3`}
          >
            <svg
              className="animate-spin h-4 w-4 text-amber-400 shrink-0"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="text-sm text-[var(--ivory)]">Reconnecting...</span>
          </div>
        </div>
      )}
      {serverNotice && serverNotice.mode !== "normal" && (
        <ServerStatusWindow
          status={serverNotice}
          hidden={serverNoticeHidden}
          onDismiss={() => onDismissServerStatus(serverNotice.updated_at)}
          inGame
        />
      )}
    </>
  );
}

interface GameOverlaysProps {
  gameId: string;
  gameState: GameState;
  isSpectator: boolean;
  previewCard: CardType | null;
  previewAppliedUpgrades: CardType[];
  previewCounters: Record<string, number> | undefined;
  onClosePreview: () => void;
  actionMenuOpen: boolean;
  battleSelectedCard: BattleSelectedCard | null;
  onBattleSelectedCardChange: (card: BattleSelectedCard | null) => void;
  spectateRequests: readonly SpectateRequest[];
  upgradesWindow: UpgradesSurface | null;
  upgradesModalMode: "view" | "apply" | "reveal";
  confirmingReveal: boolean;
  activeBuildUpgradeAnimation: { upgrade: CardType; target: CardType } | null;
  onClearBuildUpgradeAnimation: () => void;
  activeRevealAnimation: RevealAnimation | null;
  onCompleteRevealAnimation: () => void;
  shareOpen: boolean;
  shareUrl: string;
  shareText: string;
  rulesPanel: GuideSurface | null;
  guideOnScreen: boolean;
  guideMinimized: boolean;
  guideBehindPanel: boolean;
  onGuideMinimizedChange: (minimized: boolean) => void;
  onCloseSurface: (kind: GameSurfaceKind) => void;
  onToggleZonePanel: (zone: PanelZone, owner: ZoneOwner) => void;
  onApplyUpgrade: (upgradeId: string, targetId: string) => void;
  onRevealUpgrades: (upgradeIds: string[]) => void;
  onRevealAndSubmit: (upgradeIds: readonly string[]) => void;
  onSkipRevealAndSubmit: () => void;
  onCancelRevealChoice: () => void;
  onUntapAll: () => void;
  onUntapOpponentAll: () => void;
  onRollDie: (sides: number) => void;
  actions: {
    battleUpdateCardState: (
      actionType: CardStateAction,
      cardId: string,
      data?: Record<string, unknown>,
    ) => void;
    battleMove: (
      cardId: string,
      fromZone: ZoneName,
      toZone: ZoneName,
      fromOwner: ZoneOwner,
      toOwner: ZoneOwner,
    ) => void;
    battlePassTurn: () => void;
    spectateResponse: (requestId: string, allowed: boolean) => void;
  };
}

export function GameOverlays({
  gameId,
  gameState,
  isSpectator,
  previewCard,
  previewAppliedUpgrades,
  previewCounters,
  onClosePreview,
  actionMenuOpen,
  battleSelectedCard,
  onBattleSelectedCardChange,
  spectateRequests,
  upgradesWindow,
  upgradesModalMode,
  confirmingReveal,
  activeBuildUpgradeAnimation,
  onClearBuildUpgradeAnimation,
  activeRevealAnimation,
  onCompleteRevealAnimation,
  shareOpen,
  shareUrl,
  shareText,
  rulesPanel,
  guideOnScreen,
  guideMinimized,
  guideBehindPanel,
  onGuideMinimizedChange,
  onCloseSurface,
  onToggleZonePanel,
  onApplyUpgrade,
  onRevealUpgrades,
  onRevealAndSubmit,
  onSkipRevealAndSubmit,
  onCancelRevealChoice,
  onUntapAll,
  onUntapOpponentAll,
  onRollDie,
  actions,
}: GameOverlaysProps) {
  const { self_player, current_battle } = gameState;
  const currentPhase = self_player.phase;

  return (
    <>
      {previewCard && (
        <CardPreviewModal
          card={previewCard}
          appliedUpgrades={previewAppliedUpgrades}
          counters={previewCounters}
          onClose={onClosePreview}
        />
      )}
      {actionMenuOpen && currentPhase === "battle" && current_battle && (
        <ActionMenu
          selectedCard={battleSelectedCard}
          battle={current_battle}
          playerName={self_player.name}
          sideboardCount={current_battle.your_zones.sideboard.length}
          opponentSideboardCount={
            current_battle.opponent_full_sideboard?.length ?? 0
          }
          onAction={actions.battleUpdateCardState}
          onMove={(cardId, fromZone, toZone, fromOwner, toOwner) => {
            actions.battleMove(cardId, fromZone, toZone, fromOwner, toOwner);
            onBattleSelectedCardChange(null);
          }}
          onUntapAll={onUntapAll}
          onUntapOpponentAll={onUntapOpponentAll}
          onShowSideboard={() => onToggleZonePanel("sideboard", "player")}
          onShowOpponentSideboard={() =>
            onToggleZonePanel("sideboard", "opponent")
          }
          onCreateTreasure={() =>
            actions.battleUpdateCardState("create_treasure", "", {})
          }
          onDrawLibrary={() =>
            actions.battleUpdateCardState("draw_library", "", {})
          }
          onShuffleLibrary={() =>
            actions.battleUpdateCardState("shuffle_library", "", {})
          }
          onDrawOpponentLibrary={() =>
            actions.battleUpdateCardState("draw_library", "", {
              for_opponent: true,
            })
          }
          onShuffleOpponentLibrary={() =>
            actions.battleUpdateCardState("shuffle_library", "", {
              for_opponent: true,
            })
          }
          onPassTurn={actions.battlePassTurn}
          onRollDie={onRollDie}
          onClose={() => onCloseSurface("actions")}
        />
      )}
      {spectateRequests[0] && (
        <SpectateRequestModal
          request={spectateRequests[0]}
          onRespond={actions.spectateResponse}
        />
      )}
      {upgradesWindow && (
        <UpgradesModal
          upgrades={self_player.upgrades}
          mode={upgradesModalMode}
          targets={[...self_player.hand, ...self_player.sideboard]}
          onApply={isSpectator ? undefined : onApplyUpgrade}
          onReveal={onRevealUpgrades}
          onClose={() => onCloseSurface("upgrades")}
          initialTargetId={upgradesWindow.targetId}
          initialUpgradeId={upgradesWindow.upgradeId}
          initialRevealUpgradeIds={upgradesWindow.revealIds}
        />
      )}
      {confirmingReveal && (
        <RevealBeforeSubmitModal
          upgrades={getUnrevealedAppliedUpgrades(self_player.upgrades)}
          onRevealAndSubmit={onRevealAndSubmit}
          onSkip={onSkipRevealAndSubmit}
          onClose={() => {
            onCancelRevealChoice();
            onCloseSurface("submitResult");
          }}
        />
      )}
      {activeBuildUpgradeAnimation && (
        <BuildUpgradeOverlay
          upgrade={activeBuildUpgradeAnimation.upgrade}
          target={activeBuildUpgradeAnimation.target}
          onComplete={onClearBuildUpgradeAnimation}
        />
      )}
      {activeRevealAnimation && (
        <BattleRevealOverlay
          upgrade={activeRevealAnimation.upgrade}
          target={activeRevealAnimation.target}
          playerName={activeRevealAnimation.player_name}
          selfName={self_player.name}
          onComplete={onCompleteRevealAnimation}
        />
      )}
      {shareOpen && (
        <ShareModal
          url={shareUrl}
          shareText={shareText}
          onClose={() => onCloseSurface("share")}
        />
      )}
      {rulesPanel && (
        // Out of sight, the Guide stays mounted and laid out, so it comes back at the same section and scroll.
        <div
          className="contents"
          style={{ visibility: guideOnScreen ? undefined : "hidden" }}
        >
          <RulesPanel
            onClose={() => onCloseSurface("guide")}
            minimized={guideMinimized}
            onMinimizedChange={onGuideMinimizedChange}
            behindPanel={guideBehindPanel}
            target={rulesPanel.target}
            gameId={gameId}
            playerName={self_player.name}
            useUpgrades={gameState.use_upgrades}
          />
        </div>
      )}
      <RotatePrompt />
    </>
  );
}
