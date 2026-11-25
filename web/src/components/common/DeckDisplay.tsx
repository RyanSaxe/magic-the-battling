import { useState, useCallback, useMemo, type ReactElement } from "react";
import type { Card as CardType } from "../../types";
import type { ZoneConstraints } from "../../hooks/computeConstrainedLayout";
import { Card } from "../card";
import { useResizableLayout } from "../../hooks/useResizableLayout";
import { BasicLandCard } from "./BasicLandCard";
import { CardGrid } from "./CardGrid";
import { LayoutResetControl } from "./LayoutResetControl";
import { TreasureCard } from "./TreasureCard";
import { PoisonCard } from "./PoisonCard";
import { ZoneLayout } from "./ZoneLayout";
import { badgeCls } from "./ZoneLabel";
import { UpgradeGrid } from "./UpgradeGrid";
import { deckLayoutConfig } from "./deckLayout";
import {
  buildAppliedUpgradeMap,
  type UpgradeDisplayScope,
} from "../../utils/upgrades";

export interface DeckDisplayResizeState {
  constraints: ZoneConstraints | null;
  setConstraints: (constraints: ZoneConstraints) => void;
  clearConstraints: () => void;
}

export type HiddenDeckZone = "hand" | "sideboard" | "upgrades";

const NARROW_HIDDEN_ZONE_WIDTH = 200;
const EMPTY_HIDDEN_ZONES: readonly HiddenDeckZone[] = [];

function HiddenZonePill({
  compact = false,
}: {
  compact?: boolean;
}): ReactElement {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <span className={badgeCls}>
        {compact ? "Hidden" : "Hidden until game over"}
      </span>
    </div>
  );
}

interface DeckDisplayResetControl {
  phaseLabel: string;
  currentStage: number;
  currentRound: number;
  message?: string;
}

interface DeckDisplayProps {
  hand: CardType[];
  sideboard: CardType[];
  basics: string[];
  treasures: number;
  poison: number;
  upgrades: CardType[];
  companionIds: Set<string>;
  className?: string;
  enableResize?: boolean;
  isMobile?: boolean;
  layoutStateKey?: string;
  resizeState?: DeckDisplayResizeState;
  resetControl?: DeckDisplayResetControl;
  upgradeDisplayScope?: UpgradeDisplayScope;
  hiddenZones?: readonly HiddenDeckZone[];
}

function buildKeyedBasicLands(
  basics: string[],
): Array<{ key: string; name: string }> {
  const seen = new Map<string, number>();
  return basics.map((name) => {
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    return { key: `${name}-${count}`, name };
  });
}

interface DeckCardGridSectionProps {
  hidden: boolean;
  cards: CardType[];
  columns: number;
  dimensions: { width: number; height: number };
  companionIds: Set<string>;
  selectedCardId: string | null;
  upgradedCardIds: Set<string>;
  appliedUpgradesByCardId: Map<string, CardType[]>;
  onCardClick: (cardId: string) => void;
}

function DeckCardGridSection({
  hidden,
  cards,
  columns,
  dimensions,
  companionIds,
  selectedCardId,
  upgradedCardIds,
  appliedUpgradesByCardId,
  onCardClick,
}: DeckCardGridSectionProps): ReactElement {
  if (hidden) return <HiddenZonePill />;

  return (
    <CardGrid columns={columns} cardWidth={dimensions.width}>
      {cards.map((card) => (
        <Card
          key={card.id}
          card={card}
          dimensions={dimensions}
          isCompanion={companionIds.has(card.id)}
          onClick={() => onCardClick(card.id)}
          selected={selectedCardId === card.id}
          upgraded={upgradedCardIds.has(card.id)}
          appliedUpgrades={appliedUpgradesByCardId.get(card.id)}
        />
      ))}
    </CardGrid>
  );
}

function useDeckResizeControls(options: {
  layoutStateKey?: string;
  resizeState?: DeckDisplayResizeState;
}): {
  activeConstraints: ZoneConstraints | null;
  setConstraints: (constraints: ZoneConstraints) => void;
  clearConstraints: () => void;
} {
  const localKey = options.layoutStateKey ?? "__default__";
  const [localState, setLocalState] = useState<{
    key: string;
    constraints: ZoneConstraints | null;
  }>({ key: localKey, constraints: null });

  const localConstraints =
    localState.key === localKey ? localState.constraints : null;
  const clearLocal = useCallback(() => {
    setLocalState({ key: localKey, constraints: null });
  }, [localKey]);
  const setLocal = useCallback(
    (constraints: ZoneConstraints) => {
      setLocalState({ key: localKey, constraints });
    },
    [localKey],
  );

  return {
    activeConstraints: options.resizeState?.constraints ?? localConstraints,
    setConstraints: options.resizeState?.setConstraints ?? setLocal,
    clearConstraints: options.resizeState?.clearConstraints ?? clearLocal,
  };
}

function buildDeckResizeLayoutProps(options: {
  enableResize: boolean;
  hasUpgrades: boolean;
  zoneFrames: ReturnType<typeof useResizableLayout>["zoneFrames"];
  zoneRefs: ReturnType<typeof useResizableLayout>["zoneRefs"];
  dividerCallbacks: ReturnType<typeof useResizableLayout>["dividerCallbacks"];
}): {
  zoneHeights: {
    hand: number;
    battlefield: number;
    sideboard: number;
    upgrades: number;
  } | null;
  zoneWidths: { upgrades: number } | null;
  zoneRefs:
    | {
        hand: React.RefCallback<HTMLDivElement>;
        battlefield: React.RefCallback<HTMLDivElement>;
        sideboard: React.RefCallback<HTMLDivElement>;
        upgrades: React.RefCallback<HTMLDivElement>;
      }
    | undefined;
  dividerCallbacks:
    | ReturnType<typeof useResizableLayout>["dividerCallbacks"]
    | null;
} {
  if (!options.enableResize) {
    return {
      zoneHeights: null,
      zoneWidths: null,
      zoneRefs: undefined,
      dividerCallbacks: null,
    };
  }
  return {
    zoneHeights: {
      hand: options.zoneFrames.hand.outerHeight,
      battlefield: options.zoneFrames.battlefield.outerHeight,
      sideboard: options.zoneFrames.sideboard.outerHeight,
      upgrades: options.zoneFrames.commandZone.outerHeight,
    },
    zoneWidths: options.hasUpgrades
      ? { upgrades: options.zoneFrames.commandZone.outerWidth }
      : null,
    zoneRefs: {
      hand: options.zoneRefs.hand,
      battlefield: options.zoneRefs.battlefield,
      sideboard: options.zoneRefs.sideboard,
      upgrades: options.zoneRefs.commandZone,
    },
    dividerCallbacks: options.dividerCallbacks,
  };
}

function resolveDeckZoneCounts(options: {
  hiddenZones: readonly HiddenDeckZone[];
  handLength: number;
  sideboardLength: number;
  basicsLength: number;
  upgradesLength: number;
}): {
  handHidden: boolean;
  sideboardHidden: boolean;
  upgradesHidden: boolean;
  handCount: number;
  sideboardCount: number;
  battlefieldCount: number;
  commandZoneCount: number;
} {
  const handHidden = options.hiddenZones.includes("hand");
  const sideboardHidden = options.hiddenZones.includes("sideboard");
  const upgradesHidden = options.hiddenZones.includes("upgrades");
  // A hidden zone is laid out as if it held one card, so its size says nothing about what it holds.
  return {
    handHidden,
    sideboardHidden,
    upgradesHidden,
    handCount: handHidden ? 1 : options.handLength,
    sideboardCount: sideboardHidden ? 1 : options.sideboardLength,
    battlefieldCount: options.basicsLength + 2,
    commandZoneCount: upgradesHidden ? 1 : options.upgradesLength,
  };
}

function DeckResetOverlay({
  show,
  resetControl,
  isMobile,
  onConfirm,
}: {
  show: boolean;
  resetControl?: DeckDisplayResetControl;
  isMobile: boolean;
  onConfirm: () => void;
}): ReactElement | null {
  if (!show || !resetControl) return null;
  return (
    <LayoutResetControl
      phaseLabel={resetControl.phaseLabel}
      currentStage={resetControl.currentStage}
      currentRound={resetControl.currentRound}
      originStage={null}
      originRound={null}
      isInherited={false}
      onConfirm={onConfirm}
      position={isMobile ? "bottom-right" : "top-right"}
      message={resetControl.message}
    />
  );
}

export function DeckDisplay(props: DeckDisplayProps): ReactElement {
  const enableResize = Boolean(props.enableResize);
  const isMobile = Boolean(props.isMobile);
  const upgradeDisplayScope = props.upgradeDisplayScope ?? "all_applied";
  const hiddenZones = props.hiddenZones ?? EMPTY_HIDDEN_ZONES;

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const handleCardClick = useCallback((cardId: string) => {
    setSelectedCardId((prev) => (prev === cardId ? null : cardId));
  }, []);
  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    if (e.target instanceof Element && !e.target.closest(".card")) {
      setSelectedCardId(null);
    }
  }, []);

  const counts = resolveDeckZoneCounts({
    hiddenZones,
    handLength: props.hand.length,
    sideboardLength: props.sideboard.length,
    basicsLength: props.basics.length,
    upgradesLength: props.upgrades.length,
  });
  const { upgradedCardIds, appliedUpgradesByCardId } = useMemo(
    () => buildAppliedUpgradeMap(props.upgrades, upgradeDisplayScope),
    [upgradeDisplayScope, props.upgrades],
  );

  const hasUpgrades = counts.commandZoneCount > 0;
  const { activeConstraints, setConstraints, clearConstraints } =
    useDeckResizeControls({
      layoutStateKey: props.layoutStateKey,
      resizeState: props.resizeState,
    });

  const layoutConfig = useMemo(
    () =>
      deckLayoutConfig({
        handCount: counts.handCount,
        battlefieldCount: counts.battlefieldCount,
        sideboardCount: counts.sideboardCount,
        upgradeCount: counts.commandZoneCount,
      }),
    [
      counts.battlefieldCount,
      counts.commandZoneCount,
      counts.handCount,
      counts.sideboardCount,
    ],
  );

  const { containerRef, dims, zoneFrames, zoneRefs, dividerCallbacks } =
    useResizableLayout({
      layoutConfig,
      constraints: enableResize ? activeConstraints : null,
      onConstraintsChange: setConstraints,
      onConstraintsClear: clearConstraints,
    });

  const bfDims = {
    width: dims.battlefield.width,
    height: dims.battlefield.height,
  };
  const keyedBasics = buildKeyedBasicLands(props.basics);
  const resizeControlProps = buildDeckResizeLayoutProps({
    enableResize,
    hasUpgrades,
    zoneFrames,
    zoneRefs,
    dividerCallbacks,
  });

  return (
    <ZoneLayout
      containerRef={containerRef}
      className={props.className}
      onClick={handleBackgroundClick}
      isMobile={isMobile}
      {...resizeControlProps}
      hasHand={counts.handCount > 0}
      hasBattlefield={counts.battlefieldCount > 0}
      hasSideboard={counts.sideboardCount > 0}
      hasUpgrades={hasUpgrades}
      overlay={
        <DeckResetOverlay
          show={enableResize && Boolean(activeConstraints)}
          resetControl={props.resetControl}
          isMobile={isMobile}
          onConfirm={clearConstraints}
        />
      }
      handLabel="Hand"
      handContent={
        <DeckCardGridSection
          hidden={counts.handHidden}
          cards={props.hand}
          columns={dims.hand.columns}
          dimensions={{ width: dims.hand.width, height: dims.hand.height }}
          companionIds={props.companionIds}
          selectedCardId={selectedCardId}
          upgradedCardIds={upgradedCardIds}
          appliedUpgradesByCardId={appliedUpgradesByCardId}
          onCardClick={handleCardClick}
        />
      }
      battlefieldLabel="Battlefield"
      battlefieldContent={
        <CardGrid columns={dims.battlefield.columns} cardWidth={bfDims.width}>
          {keyedBasics.map(({ key, name }) => (
            <BasicLandCard key={key} name={name} dimensions={bfDims} />
          ))}
          <TreasureCard count={props.treasures} dimensions={bfDims} />
          <PoisonCard count={props.poison} dimensions={bfDims} />
        </CardGrid>
      }
      sideboardLabel="Sideboard"
      sideboardContent={
        <DeckCardGridSection
          hidden={counts.sideboardHidden}
          cards={props.sideboard}
          columns={dims.sideboard.columns}
          dimensions={{
            width: dims.sideboard.width,
            height: dims.sideboard.height,
          }}
          companionIds={props.companionIds}
          selectedCardId={selectedCardId}
          upgradedCardIds={upgradedCardIds}
          appliedUpgradesByCardId={appliedUpgradesByCardId}
          onCardClick={handleCardClick}
        />
      }
      upgradesLabel="Upgrades"
      upgradesContent={
        counts.upgradesHidden ? (
          <HiddenZonePill
            compact={
              zoneFrames.commandZone.outerWidth < NARROW_HIDDEN_ZONE_WIDTH
            }
          />
        ) : (
          <UpgradeGrid
            upgrades={props.upgrades}
            fallbackDims={dims.commandZone}
            frame={zoneFrames.commandZone}
            selectedId={selectedCardId}
            onSelect={handleCardClick}
          />
        )
      }
    />
  );
}
