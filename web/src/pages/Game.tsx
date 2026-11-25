/**
 * Game route phase router: connects `useGameController` to the session guard,
 * game chrome, active phase board, Guided Mode layer, and floating overlays.
 */
import { useMemo, useRef, useState, type ReactElement } from "react";
import { CardPreviewContext } from "../components/card";
import { BattleResolutionOverlay } from "../components/common/BattleResolutionOverlay";
import type { LoadingStep } from "../components/common/loadingSteps";
import { FrameBoard, FrameFelt } from "../components/common/PageFrame";
import {
  SIDE_PANEL_HEADER_HEIGHT,
  SidePanelFrame,
} from "../components/common/SidePanel";
import { SidePanelHostContext } from "../components/common/sidePanelHost";
import {
  BattleMobileLifeRail,
  BattleSideboardPanels,
  GameSidebarChrome,
} from "../components/game/GameBattleChrome";
import {
  GameBanner,
  GameBottomBar,
  GameTopBar,
} from "../components/game/GameChrome";
import {
  GameGuideLayer,
  GameOverlays,
  GameReconnectAndStatusOverlays,
} from "../components/game/GameOverlays";
import {
  AwaitingEliminationView,
  GameEndSummary,
  GameSessionGuard,
  OutScreenView,
} from "../components/game/GameSessionViews";
import { ContextStripProvider } from "../contexts";
import { FaceDownProvider } from "../contexts/FaceDownContext";
import { GameDndProvider } from "../dnd";
import { GuideProvider } from "../guided/GuideContext";
import { useElementHeight } from "../hooks/useElementHeight";
import { useGameController } from "../hooks/useGameController";
import { canHover } from "../utils/inputMode";
import { BattlePhase } from "./phases/Battle";
import { BuildPhase } from "./phases/Build";
import { DraftPhase } from "./phases/Draft";
import { RewardPhase } from "./phases/Reward";

const ignoreBasicsPick = (): void => {};

type Controller = ReturnType<typeof useGameController>;
type ActiveGameState = NonNullable<Controller["gameState"]>;
type ActiveDerived = NonNullable<Controller["derived"]>;

function GameBattleStage({
  c,
  gameState,
  derived,
  banner,
  sidebarChrome,
  battleLifeRailRef,
  setSidePanelHost,
}: {
  c: Controller;
  gameState: ActiveGameState;
  derived: ActiveDerived;
  banner: ReactElement;
  sidebarChrome: ReactElement;
  battleLifeRailRef: (node: HTMLDivElement | null) => void;
  setSidePanelHost: (node: HTMLElement | null) => void;
}): ReactElement {
  const { surfaces, battleEnd, actions } = c;
  const { self_player, current_battle } = gameState;
  const activeZoneModal =
    surfaces.zonePanel && surfaces.zonePanel.zone !== "sideboard"
      ? { zone: surfaces.zonePanel.zone, owner: surfaces.zonePanel.owner }
      : null;

  return (
    <FaceDownProvider value={{ faceDownCardIds: derived.allFaceDownIds }}>
      <GameDndProvider
        onCardMove={c.handleCardMove}
        validDropZones={c.getValidDropZones}
      >
        <FrameFelt
          banner={banner}
          sidePanels={<SidePanelFrame ref={setSidePanelHost} />}
        >
          <FrameBoard>
            {c.usesOverlaySidebar && derived.battleViewForDisplay && (
              <BattleMobileLifeRail
                battle={derived.battleViewForDisplay}
                selfName={self_player.name}
                voice={c.voiceControls}
                lifeRailRef={battleLifeRailRef}
                onYourLifeChange={c.handleYourLifeChange}
                onOpponentLifeChange={c.handleOpponentLifeChange}
              />
            )}
            <BattlePhase
              gameState={gameState}
              battleOverride={
                derived.displayBattleResolution
                  ? derived.battleViewForDisplay
                  : undefined
              }
              actions={actions}
              onRevealHiddenUpgrades={c.openBattleRevealUpgradesModal}
              isMobile={c.sizes.isMobile}
              selectedCard={surfaces.selectedCard}
              onSelectedCardChange={surfaces.setSelectedCard}
              cardMenu={surfaces.cardMenu}
              onCardMenuChange={surfaces.setCardMenu}
              onCardHover={c.handleCardHover}
              onOpponentCardHover={c.handleOpponentCardHover}
              onCardHoverEnd={c.handleCardHoverEnd}
              activeZoneModal={activeZoneModal}
              onZoneModalOpenChange={c.setBattleZoneModalOpen}
              onLayoutMetricsChange={c.setBattleSidebarLayout}
            />
            {derived.displayBattleResolution && battleEnd.activeResolution && (
              <BattleResolutionOverlay
                battle={battleEnd.activeResolution.battle}
                resolution={battleEnd.activeResolution.resolution}
                onComplete={() => {
                  battleEnd.completeResolution();
                  surfaces.fightEnded();
                }}
              />
            )}
          </FrameBoard>
          {sidebarChrome}
        </FrameFelt>
        {current_battle && (
          <BattleSideboardPanels
            battle={current_battle}
            isZonePanelOpen={surfaces.isZonePanelOpen}
            battleSelectedCard={surfaces.selectedCard}
            canHover={canHover}
            onCloseZone={() => surfaces.close("zone")}
            onEmptyClick={c.handleSideboardEmptyClick}
            onSelectCard={surfaces.setSelectedCard}
            onOpenCardMenu={c.handleOpenSideboardCardMenu}
            onCardHover={c.handleCardHover}
            onOpponentCardHover={c.handleOpponentCardHover}
            onCardHoverEnd={c.handleCardHoverEnd}
            onRevealHiddenUpgrades={c.openBattleRevealUpgradesModal}
          />
        )}
      </GameDndProvider>
    </FaceDownProvider>
  );
}

function GamePhaseBoard({
  c,
  gameState,
  derived,
}: {
  c: Controller;
  gameState: ActiveGameState;
  derived: ActiveDerived;
}): ReactElement | null {
  const { actions } = c;
  const { self_player } = gameState;
  const isDesktop = c.shellMode === "big";

  if (derived.currentPhase === "draft") {
    return (
      <DraftPhase
        gameState={gameState}
        actions={actions}
        isMobile={c.sizes.isMobile}
        showDesktopUpgradeRail={isDesktop}
      />
    );
  }
  if (derived.currentPhase === "build") {
    return (
      <BuildPhase
        gameState={gameState}
        actions={actions}
        selectedBasics={c.selectedBasics}
        onBasicsChange={c.isSpectator ? ignoreBasicsPick : c.setPickedBasics}
        onHandSlotsChange={c.setHandSlots}
        onCardHover={c.handleCardHover}
        onCardHoverEnd={c.handleCardHoverEnd}
        onQuickUpgrade={(targetCardId) =>
          c.openGameSurface({
            kind: "upgrades",
            mode: "auto",
            targetId: targetCardId,
            revealIds: [],
          })
        }
        onQuickApplyUpgrade={(upgradeId) =>
          c.openGameSurface({
            kind: "upgrades",
            mode: "auto",
            upgradeId,
            revealIds: [],
          })
        }
        isMobile={c.sizes.isMobile}
        showDesktopUpgradeRail={isDesktop}
      />
    );
  }
  if (derived.currentPhase === "reward") {
    const handleUpgradeSelect = c.isSpectator
      ? (id: string | null): void =>
          c.setPreviewCard(
            gameState.available_upgrades.find((upgrade) => upgrade.id === id) ??
              null,
          )
      : c.setSelectedUpgradeId;
    return (
      <RewardPhase
        gameState={gameState}
        actions={actions}
        selectedUpgradeId={c.selectedUpgradeId}
        onUpgradeSelect={handleUpgradeSelect}
        selectedPoolCardId={c.selectedPoolCardId}
        onPoolCardSelect={c.setSelectedPoolCardId}
        isMobile={c.sizes.isMobile}
        isDesktop={isDesktop}
      />
    );
  }
  if (derived.currentPhase === "awaiting_elimination") {
    return <AwaitingEliminationView />;
  }
  if (derived.showsOutScreen) {
    return (
      <OutScreenView
        outPlace={derived.outPlace}
        poison={self_player.poison}
        onSeeDeck={() => c.setDeckSeen(true)}
      />
    );
  }
  if (derived.isEndPhase) {
    return (
      <GameEndSummary
        player={self_player}
        useUpgrades={gameState.use_upgrades}
        isMobile={c.sizes.isMobile}
        currentPhase={derived.currentPhase}
      />
    );
  }
  return null;
}

const LOADING_STEPS: ReadonlySet<string> = new Set<LoadingStep>([
  "Load cube",
  "Load deck",
  "Deal cards",
  "Open board",
  "Open lobby",
]);

function isLoadingStep(step: string): step is LoadingStep {
  return LOADING_STEPS.has(step);
}

function hasAnyGuideBlockingOverlay(c: Controller): boolean {
  return (
    c.surfaces.blocksGuides ||
    c.previewState.previewCard !== null ||
    c.battleEnd.blocksGuides ||
    c.activeBuildUpgradeAnimation !== null
  );
}

function overlaySidebarTopInset(
  usesOverlaySidebar: boolean,
  showsBattle: boolean,
  battleLifeRailHeight: number,
): number {
  if (!usesOverlaySidebar || !showsBattle) return 0;
  return battleLifeRailHeight - SIDE_PANEL_HEADER_HEIGHT;
}

function GameTableLayout({
  c,
  gameState,
  guideContext,
  derived,
  battleLifeRailRef,
  battleLifeRailHeight,
  setSidePanelHost,
}: {
  c: Controller;
  gameState: ActiveGameState;
  guideContext: NonNullable<Controller["guideContext"]>;
  derived: ActiveDerived;
  battleLifeRailRef: (node: HTMLDivElement | null) => void;
  battleLifeRailHeight: number;
  setSidePanelHost: (node: HTMLElement | null) => void;
}): ReactElement {
  const guideRootRef = useRef<HTMLDivElement>(null);
  const { surfaces, battleEnd, actions } = c;
  const { self_player } = gameState;
  const timelinePhase = derived.displayBattleResolution
    ? "battle"
    : self_player.phase;
  const topInset = overlaySidebarTopInset(
    c.usesOverlaySidebar,
    derived.showsBattle,
    battleLifeRailHeight,
  );

  const banner = (
    <GameBanner
      isSpectator={c.isSpectator}
      spectatePlayer={c.watching?.target ?? null}
      inSuddenDeath={derived.inSuddenDeath}
    />
  );

  const sidebarChrome = (
    <GameSidebarChrome
      gameState={gameState}
      battleViewForDisplay={derived.battleViewForDisplay}
      inFight={derived.showsBattle}
      fightSidebarView={c.fightSidebarView}
      onFightSidebarViewChange={c.setFightSidebarView}
      usesOverlaySidebar={c.usesOverlaySidebar}
      shellMode={c.shellMode}
      overlaySidebarOpen={c.usesOverlaySidebar && surfaces.drawerOpen}
      overlaySidebarTopInset={topInset}
      battleSidebarLayout={c.battleSidebarLayout}
      scouting={surfaces.scouting}
      onScout={surfaces.scout}
      onCloseDrawer={() => surfaces.setDrawerOpen(false)}
      isSpectator={c.isSpectator}
      isEndPhase={derived.isEndPhase}
      canSpectate={derived.canSpectate}
      watchUrl={derived.watchUrl}
      voice={c.voiceControls}
      onYourLifeChange={c.handleYourLifeChange}
      onOpponentLifeChange={c.handleOpponentLifeChange}
      onCreateTreasure={c.handleCreateTreasure}
      onUntapAll={() => c.untapAll(false)}
      onPassTurn={actions.battlePassTurn}
      onCreateOpponentTreasure={c.handleCreateOpponentTreasure}
      onUntapOpponentAll={() => c.untapAll(true)}
    />
  );

  return (
    <div className="game-table h-dvh overflow-hidden flex flex-col">
      <GameReconnectAndStatusOverlays
        isConnected={c.isConnected}
        serverNotice={c.serverNotice}
        serverNoticeHidden={surfaces.isServerStatusHidden(c.serverNotice)}
        onDismissServerStatus={surfaces.dismissServerStatus}
      />
      <div ref={guideRootRef} className="relative flex flex-col flex-1 min-h-0">
        <GuideProvider
          gameId={c.gameId}
          playerId={c.session?.playerId}
          playerName={self_player.name}
          selfPhase={self_player.phase}
          guideContext={guideContext}
          isSpectator={c.isSpectator}
          hasOverlayOpen={hasAnyGuideBlockingOverlay(c)}
          closeGameplayOverlays={c.closeGameplayOverlays}
          completionTrigger={c.guideCompletionTrigger}
        >
          <GameTopBar
            gameState={gameState}
            timelinePhase={timelinePhase}
            isOut={derived.isOut}
            isSpectator={c.isSpectator}
            isEndPhase={derived.isEndPhase}
            displayBattleResolution={derived.displayBattleResolution}
            selfPlacement={derived.selfPlacement}
            outPlace={derived.outPlace}
            guideMinimized={surfaces.guideMinimized}
            usesOverlaySidebar={c.usesOverlaySidebar}
            onToggleSidebar={() => surfaces.setDrawerOpen(!surfaces.drawerOpen)}
            onOpenRulesPanel={c.openRulesPanel}
            onCloseActions={() => surfaces.close("actions")}
          />

          {derived.showsBattle ? (
            <GameBattleStage
              c={c}
              gameState={gameState}
              derived={derived}
              banner={banner}
              sidebarChrome={sidebarChrome}
              battleLifeRailRef={battleLifeRailRef}
              setSidePanelHost={setSidePanelHost}
            />
          ) : (
            <FrameFelt
              banner={banner}
              sidePanels={<SidePanelFrame ref={setSidePanelHost} />}
            >
              <FrameBoard>
                <GamePhaseBoard c={c} gameState={gameState} derived={derived} />
              </FrameBoard>
              {sidebarChrome}
            </FrameFelt>
          )}

          <GameBottomBar
            gameId={c.gameId}
            gameState={gameState}
            actionBarPhase={timelinePhase}
            actionBarBattle={derived.battleViewForDisplay}
            displayBattleResolution={derived.displayBattleResolution}
            isEndPhase={derived.isEndPhase}
            isSpectator={c.isSpectator}
            watchesOutPlayer={c.isSpectator && derived.isOut}
            canSpectate={derived.canSpectate}
            shareUrl={derived.shareUrl}
            watchUrl={derived.watchUrl}
            canRoll={c.canRoll}
            canReady={derived.canReady}
            canContinue={derived.canContinue}
            needsUpgrade={derived.needsUpgrade}
            selectedUpgradeId={c.selectedUpgradeId}
            hasPendingBuildUpgrades={derived.hasPendingBuildUpgrades}
            hasUnrevealedBattleUpgrades={derived.hasUnrevealedBattleUpgrades}
            pendingPhaseAction={c.phaseActionState.pending}
            buildReadyPending={c.buildReadyPending}
            battleSubmitPending={battleEnd.submitPending}
            changingResult={battleEnd.changingResult}
            actionMenuOpen={surfaces.actionMenuOpen}
            showSubmitHandPopover={surfaces.submitHandOpen}
            showSubmitResultPopover={c.showSubmitResultPopover}
            buildSubmitGuideActive={derived.buildSubmitGuideActive}
            battleSubmitGuideActive={derived.battleSubmitGuideActive}
            onDraftRoll={actions.draftRoll}
            onGoToBuild={c.handleGoToBuild}
            onBuildUnready={actions.buildUnready}
            onBuildReadySubmit={c.handleBuildReadySubmit}
            onBattleResultSubmit={c.handleBattleResultSubmit}
            onContinue={c.handleContinue}
            onOpenUpgradesModal={c.openUpgradesModal}
            onOpenBattleRevealUpgradesModal={() =>
              c.openBattleRevealUpgradesModal()
            }
            onToggleBuildSubmitPopover={c.toggleBuildSubmitPopover}
            onToggleBattleSubmitPopover={c.toggleBattleSubmitPopover}
            onOpenActionMenu={() => c.openGameSurface({ kind: "actions" })}
            onCloseSurface={surfaces.close}
            onStartChangingResult={battleEnd.startChangingResult}
            onCancelChangingResult={battleEnd.cancelChangingResult}
            onOpenShareModal={() => c.openGameSurface({ kind: "share" })}
          />
          {!c.isSpectator && (
            <GameGuideLayer
              rootRef={guideRootRef}
              context={guideContext}
              sidebarOpen={surfaces.drawerOpen}
              setSidebarOpen={surfaces.setDrawerOpen}
              scouting={surfaces.scouting}
              setScouting={surfaces.scout}
              onVisibleGuideStepChange={c.setVisibleGuideStep}
            />
          )}
        </GuideProvider>
      </div>
    </div>
  );
}

function GameContent(): ReactElement {
  const [battleLifeRailRef, battleLifeRailHeight] = useElementHeight();
  const [sidePanelHost, setSidePanelHost] = useState<HTMLElement | null>(null);
  const c = useGameController();
  const { gameState, guideContext, derived, surfaces, battleEnd, actions } = c;
  const previewContextValue = useMemo(
    () => ({ setPreviewCard: c.setPreviewCard }),
    [c.setPreviewCard],
  );

  if (c.needsSessionGuard || !gameState || !guideContext || !derived) {
    return (
      <GameSessionGuard
        gameId={c.gameId}
        isSpectator={c.isSpectator}
        isSpectateMode={c.isSpectateMode}
        isConnected={c.isConnected}
        hasGameState={Boolean(gameState)}
        seat={c.seat}
        spectate={c.spectate}
        watchingTarget={c.watching?.target ?? null}
        loadingSteps={c.loadingSteps.filter(isLoadingStep)}
        onClaim={(playerName) => {
          void c.claim(playerName);
        }}
        onTakeBack={c.takeBack}
      />
    );
  }

  return (
    <CardPreviewContext.Provider value={previewContextValue}>
      <SidePanelHostContext.Provider value={sidePanelHost}>
        <GameTableLayout
          c={c}
          gameState={gameState}
          guideContext={guideContext}
          derived={derived}
          battleLifeRailRef={battleLifeRailRef}
          battleLifeRailHeight={battleLifeRailHeight}
          setSidePanelHost={setSidePanelHost}
        />
        <GameOverlays
          gameId={c.gameId}
          gameState={gameState}
          isSpectator={c.isSpectator}
          previewCard={c.previewState.previewCard}
          previewAppliedUpgrades={c.previewState.previewAppliedUpgrades}
          previewCounters={c.previewState.previewCounters}
          onClosePreview={() => c.setPreviewCard(null)}
          actionMenuOpen={surfaces.actionMenuOpen}
          battleSelectedCard={surfaces.selectedCard}
          onBattleSelectedCardChange={surfaces.setSelectedCard}
          spectateRequests={c.spectateRequests}
          upgradesWindow={surfaces.upgradesWindow}
          upgradesModalMode={derived.upgradesModalMode}
          confirmingReveal={battleEnd.confirmingReveal}
          activeBuildUpgradeAnimation={c.activeBuildUpgradeAnimation}
          onClearBuildUpgradeAnimation={() =>
            c.setActiveBuildUpgradeAnimation(null)
          }
          activeRevealAnimation={battleEnd.activeRevealAnimation}
          onCompleteRevealAnimation={battleEnd.completeRevealAnimation}
          shareOpen={surfaces.shareOpen}
          shareUrl={derived.shareUrl}
          shareText={derived.shareText}
          rulesPanel={surfaces.guideSurface}
          guideOnScreen={surfaces.guideOnScreen}
          guideMinimized={surfaces.guideMinimized}
          guideBehindPanel={surfaces.topSurface?.kind !== "guide"}
          onGuideMinimizedChange={surfaces.setGuideMinimized}
          onCloseSurface={surfaces.close}
          onToggleZonePanel={c.toggleZonePanel}
          onApplyUpgrade={c.handleApplyUpgrade}
          onRevealUpgrades={c.handleRevealUpgrades}
          onRevealAndSubmit={battleEnd.confirmRevealAndSubmit}
          onSkipRevealAndSubmit={battleEnd.skipRevealAndSubmit}
          onCancelRevealChoice={battleEnd.cancelRevealChoice}
          onUntapAll={() => c.untapAll(false)}
          onUntapOpponentAll={() => c.untapAll(true)}
          onRollDie={c.handleRollDie}
          actions={actions}
        />
      </SidePanelHostContext.Provider>
    </CardPreviewContext.Provider>
  );
}

export function Game(): ReactElement {
  return (
    <ContextStripProvider>
      <GameContent />
    </ContextStripProvider>
  );
}
