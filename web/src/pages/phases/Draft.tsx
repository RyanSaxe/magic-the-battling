/** Draft phase board: renders the current pack, player pool, desktop upgrade rail, and token counters. */
import { useState, useCallback, type ReactElement } from "react";
import { Card } from "../../components/card";
import type { GameState, Card as CardType, CardDestination } from "../../types";
import { LayoutResetControl } from "../../components/common/LayoutResetControl";
import { UpgradeGrid } from "../../components/common/UpgradeGrid";
import { ZoneLayout } from "../../components/common/ZoneLayout";
import { useSavedLayout, type BoardSize } from "../../hooks/useSavedLayout";
import { useResizableLayout } from "../../hooks/useResizableLayout";
import {
  TREASURE_TOKEN_IMAGE,
  POISON_COUNTER_IMAGE,
} from "../../constants/assets";
import { draftLayoutConfig } from "./phaseLayouts";

interface DraftPhaseProps {
  gameState: GameState;
  actions: {
    draftSwap: (
      packCardId: string,
      playerCardId: string,
      destination: CardDestination,
    ) => void;
    draftRoll: () => void;
    draftDone: () => void;
  };
  isMobile?: boolean;
  showDesktopUpgradeRail?: boolean;
}

type SelectionZone = "pack" | "pool";

interface CardWithIndex {
  card: CardType;
  index: number;
  zone: SelectionZone;
  isInHand: boolean;
}

interface AppliedUpgradeCard extends CardType {
  upgrade_target: CardType;
}

function hasUpgradeTarget(card: CardType): card is AppliedUpgradeCard {
  return card.upgrade_target !== null;
}

function DraftTokensOverlay({
  treasures,
  poison,
}: {
  treasures: number;
  poison: number;
}): ReactElement {
  return (
    <>
      <div className="absolute bottom-0 left-0 pointer-events-none z-20 flex">
        <div
          className="relative draft-token-frame draft-token-frame--treasure"
          data-guide-target="draft-mobile-treasure"
        >
          <img
            src={TREASURE_TOKEN_IMAGE}
            alt="Treasure"
            className="h-[56px] sm:h-[84px] block shadow-lg"
            style={{ borderRadius: "var(--card-border-radius)" }}
          />
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/80 text-amber-400 text-xs sm:text-sm font-bold px-1.5 sm:px-2 py-0.5 rounded-full leading-none">
            {treasures}
          </span>
        </div>
      </div>
      <div className="absolute bottom-0 right-0 pointer-events-none z-20 flex">
        <div className="relative draft-token-frame draft-token-frame--poison">
          <img
            src={POISON_COUNTER_IMAGE}
            alt="Poison"
            className="h-[56px] sm:h-[84px] block shadow-lg"
            style={{ borderRadius: "var(--card-border-radius)" }}
          />
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/80 text-purple-400 text-xs sm:text-sm font-bold px-1.5 sm:px-2 py-0.5 rounded-full leading-none">
            {poison}
          </span>
        </div>
      </div>
    </>
  );
}

function DraftPackContent({
  currentPack,
  packDims,
  selectedCardId,
  onSelectCard,
}: {
  currentPack: CardType[];
  packDims: { width: number; height: number; columns: number };
  selectedCardId: string | undefined;
  onSelectCard: (item: CardWithIndex) => void;
}): ReactElement {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 min-h-0 overflow-auto">
        {currentPack.length === 0 ? (
          <div className="text-center">
            <div className="text-[var(--ivory-felt)] text-sm">
              No pack available
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${packDims.columns}, ${packDims.width}px)`,
              gap: "6px",
              justifyContent: "center",
              maxWidth: "100%",
              overflow: "hidden",
            }}
          >
            {currentPack.map((card, index) => (
              <Card
                key={card.id}
                card={card}
                onClick={() =>
                  onSelectCard({ card, index, zone: "pack", isInHand: false })
                }
                selected={selectedCardId === card.id}
                dimensions={packDims}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DraftPoolContent({
  pool,
  handIds,
  poolDims,
  selectedCardId,
  upgradedCardIds,
  getAppliedUpgrades,
  onSelectCard,
}: {
  pool: CardType[];
  handIds: ReadonlySet<string>;
  poolDims: { width: number; height: number; columns: number };
  selectedCardId: string | undefined;
  upgradedCardIds: ReadonlySet<string>;
  getAppliedUpgrades: (cardId: string) => CardType[];
  onSelectCard: (item: CardWithIndex) => void;
}): ReactElement {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 min-h-0 overflow-auto">
        {pool.length === 0 ? (
          <div className="flex items-center justify-center">
            <div className="text-[var(--ivory-felt)] text-sm text-center">
              Swap cards from the pack to build your pool
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${poolDims.columns}, ${poolDims.width}px)`,
              gap: "6px",
              justifyContent: "center",
              maxWidth: "100%",
              overflow: "hidden",
            }}
          >
            {pool.map((card, index) => (
              <Card
                key={card.id}
                card={card}
                onClick={() =>
                  onSelectCard({
                    card,
                    index,
                    zone: "pool",
                    isInHand: handIds.has(card.id),
                  })
                }
                selected={selectedCardId === card.id}
                dimensions={poolDims}
                upgraded={upgradedCardIds.has(card.id)}
                appliedUpgrades={getAppliedUpgrades(card.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DraftOverlay({
  treasures,
  poison,
  stage,
  round,
  persistedLayout,
  onClearConstraints,
  isMobile,
}: {
  treasures: number;
  poison: number;
  stage: number;
  round: number;
  persistedLayout: ReturnType<typeof useSavedLayout>["resolution"];
  onClearConstraints: () => void;
  isMobile: boolean | undefined;
}): ReactElement {
  return (
    <>
      <DraftTokensOverlay treasures={treasures} poison={poison} />
      {persistedLayout.canReset ? (
        <LayoutResetControl
          phaseLabel="Draft"
          currentStage={stage}
          currentRound={round}
          originStage={persistedLayout.originStage}
          originRound={persistedLayout.originRound}
          isInherited={persistedLayout.source === "inherited"}
          onConfirm={onClearConstraints}
          position={isMobile ? "bottom-right" : "top-right"}
        />
      ) : null}
    </>
  );
}

function resolveDraftCardClick(options: {
  selectedCard: CardWithIndex | null;
  clicked: CardWithIndex;
  draftSwap: DraftPhaseProps["actions"]["draftSwap"];
}): CardWithIndex | null {
  const { selectedCard, clicked, draftSwap } = options;
  if (selectedCard?.card.id === clicked.card.id) return null;
  if (!selectedCard || selectedCard.zone === clicked.zone) return clicked;
  const packCard = clicked.zone === "pack" ? clicked.card : selectedCard.card;
  const poolCard = clicked.zone === "pool" ? clicked.card : selectedCard.card;
  const poolIsInHand =
    clicked.zone === "pool" ? clicked.isInHand : selectedCard.isInHand;
  draftSwap(packCard.id, poolCard.id, poolIsInHand ? "hand" : "sideboard");
  return null;
}

function resolveDraftUpgradeRailCount(
  showDesktopUpgradeRail: boolean,
  upgrades: CardType[],
): number {
  return showDesktopUpgradeRail ? upgrades.length : 0;
}

function DraftUpgradeRailContent({
  upgradeZoneFrame,
  upgrades,
  fallbackDims,
}: {
  upgradeZoneFrame:
    | ReturnType<typeof useResizableLayout>["zoneFrames"]["upgrades"]
    | null;
  upgrades: CardType[];
  fallbackDims: ReturnType<typeof useResizableLayout>["dims"]["upgrades"];
}): ReactElement | null {
  if (!upgradeZoneFrame) return null;
  return (
    <UpgradeGrid
      upgrades={upgrades}
      fallbackDims={fallbackDims}
      frame={upgradeZoneFrame}
    />
  );
}

export function DraftPhase({
  gameState,
  actions,
  isMobile,
  showDesktopUpgradeRail = false,
}: DraftPhaseProps): ReactElement {
  const [selectedCard, setSelectedCard] = useState<CardWithIndex | null>(null);

  const { self_player } = gameState;
  const currentPack = self_player.current_pack ?? [];
  const pool = [...self_player.hand, ...self_player.sideboard];
  const handIds = new Set(self_player.hand.map((c) => c.id));
  const upgradeRailCount = resolveDraftUpgradeRailCount(
    showDesktopUpgradeRail,
    self_player.upgrades,
  );
  const hasDesktopUpgradeRail = upgradeRailCount > 0;

  const [measuredBoard, setMeasuredBoard] = useState<BoardSize | null>(null);
  const {
    constraints,
    setConstraints,
    clearConstraints,
    resolution: persistedLayout,
  } = useSavedLayout(
    {
      scopeKey: "phase:draft",
      stage: self_player.stage,
      round: self_player.round,
    },
    measuredBoard,
  );

  const {
    containerRef,
    dims,
    containerSize,
    zoneFrames,
    zoneRefs,
    dividerCallbacks,
  } = useResizableLayout({
    layoutConfig: draftLayoutConfig({
      packCount: currentPack.length,
      poolCount: pool.length,
      upgradeRailCount,
    }),
    constraints,
    onConstraintsChange: setConstraints,
    onConstraintsClear: clearConstraints,
    allowHorizontalResize: !isMobile,
  });
  // A saved layout belongs to a board size band, known once the board is measured.
  if (measuredBoard !== containerSize) setMeasuredBoard(containerSize);

  const appliedUpgradesList = self_player.upgrades.filter(hasUpgradeTarget);
  const upgradedCardIds = new Set(
    appliedUpgradesList.map((u) => u.upgrade_target.id),
  );
  const getAppliedUpgrades = (cardId: string): CardType[] =>
    appliedUpgradesList.filter((u) => u.upgrade_target.id === cardId);

  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (!target?.closest(".card")) {
      setSelectedCard(null);
    }
  }, []);

  const handleCardClick = useCallback(
    (clicked: CardWithIndex) => {
      setSelectedCard((current) =>
        resolveDraftCardClick({
          selectedCard: current,
          clicked,
          draftSwap: actions.draftSwap,
        }),
      );
    },
    [actions],
  );

  const upgradeZoneFrame = hasDesktopUpgradeRail ? zoneFrames.upgrades : null;
  const selectedCardId = selectedCard?.card.id;

  return (
    <ZoneLayout
      containerRef={containerRef}
      onClick={handleBackgroundClick}
      isMobile={isMobile}
      zoneHeights={{
        hand: zoneFrames.pack.outerHeight,
        sideboard: zoneFrames.pool.outerHeight,
        upgrades: upgradeZoneFrame?.outerHeight,
      }}
      zoneWidths={
        upgradeZoneFrame ? { upgrades: upgradeZoneFrame.outerWidth } : null
      }
      zoneRefs={{
        hand: zoneRefs.pack,
        sideboard: zoneRefs.pool,
        upgrades: zoneRefs.upgrades,
      }}
      overlay={
        <DraftOverlay
          treasures={self_player.treasures}
          poison={self_player.poison}
          stage={self_player.stage}
          round={self_player.round}
          persistedLayout={persistedLayout}
          onClearConstraints={clearConstraints}
          isMobile={isMobile}
        />
      }
      hasHand={true}
      hasBattlefield={false}
      hasSideboard={true}
      hasUpgrades={hasDesktopUpgradeRail}
      dividerCallbacks={dividerCallbacks}
      zoneTargetIds={{
        hand: "draft-pack",
        sideboard: "draft-pool",
      }}
      handLabel="Pack"
      handContent={
        <DraftPackContent
          currentPack={currentPack}
          packDims={dims.pack}
          selectedCardId={selectedCardId}
          onSelectCard={handleCardClick}
        />
      }
      battlefieldLabel={null}
      battlefieldContent={null}
      sideboardLabel="Pool"
      sideboardContent={
        <DraftPoolContent
          pool={pool}
          handIds={handIds}
          poolDims={dims.pool}
          selectedCardId={selectedCardId}
          upgradedCardIds={upgradedCardIds}
          getAppliedUpgrades={getAppliedUpgrades}
          onSelectCard={handleCardClick}
        />
      }
      upgradesLabel="Upgrades"
      upgradesContent={
        <DraftUpgradeRailContent
          upgradeZoneFrame={upgradeZoneFrame}
          upgrades={self_player.upgrades}
          fallbackDims={dims.upgrades}
        />
      }
    />
  );
}
