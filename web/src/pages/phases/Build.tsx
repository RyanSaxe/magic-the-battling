/** Build phase board: manages hand construction, basic land selection, companion choice, and upgrade overlays. */
import {
  useState,
  useCallback,
  useMemo,
  type ComponentProps,
  type ReactElement,
} from "react";
import type { GameState, Card as CardType, ZoneName } from "../../types";
import type { GameActions } from "../../hooks/useGame";
import { Card } from "../../components/card";
import { CardSlot } from "../../components/common/CardSlot";
import { BasicLandSlot } from "../../components/common/BasicLandSlot";
import { TreasureCard } from "../../components/common/TreasureCard";
import { PoisonCard } from "../../components/common/PoisonCard";
import { CardGrid } from "../../components/common/CardGrid";
import { LayoutResetControl } from "../../components/common/LayoutResetControl";
import { UpgradeGrid } from "../../components/common/UpgradeGrid";
import { ZoneLayout } from "../../components/common/ZoneLayout";
import { useSavedLayout, type BoardSize } from "../../hooks/useSavedLayout";
import { useResizableLayout } from "../../hooks/useResizableLayout";
import { useBuildPhaseSync } from "../../hooks/usePhaseHelpers";
import { buildLayoutConfig } from "./phaseLayouts";

type Selection =
  | { type: "card"; cardId: string; zone: "hand" | "sideboard" }
  | { type: "empty"; slotIndex: number }
  | null;

type BuildActions = Pick<
  GameActions,
  | "buildMove"
  | "buildSwap"
  | "buildSetBasics"
  | "buildReady"
  | "buildUnready"
  | "buildApplyUpgrade"
  | "buildSetCompanion"
  | "buildRemoveCompanion"
>;

interface BuildPhaseProps {
  gameState: GameState;
  actions: BuildActions;
  selectedBasics: string[];
  onBasicsChange: (basics: string[]) => void;
  onHandSlotsChange?: (slots: (string | null)[]) => void;
  onCardHover?: (cardId: string, zone: ZoneName) => void;
  onCardHoverEnd?: () => void;
  onQuickUpgrade?: (targetCardId: string) => void;
  onQuickApplyUpgrade?: (upgradeId: string) => void;
  isMobile?: boolean;
  showDesktopUpgradeRail?: boolean;
}

interface AppliedUpgradeCard extends CardType {
  upgrade_target: CardType;
}

const BASIC_LAND_SLOTS = [
  { key: "basic-slot-0", index: 0 },
  { key: "basic-slot-1", index: 1 },
  { key: "basic-slot-2", index: 2 },
] as const;

function hasUpgradeTarget(card: CardType): card is AppliedUpgradeCard {
  return card.upgrade_target !== null;
}

function isCompanion(card: CardType): boolean {
  return card.oracle_text?.includes("Companion —") ?? false;
}

function QuickUpgradeButton({
  card,
  canQuickUpgrade,
  pinned,
  hasCompanionButton = false,
  onQuickUpgrade,
}: {
  card: CardType;
  canQuickUpgrade: boolean;
  pinned: boolean;
  hasCompanionButton?: boolean;
  onQuickUpgrade: ((targetCardId: string) => void) | undefined;
}): ReactElement | null {
  if (!canQuickUpgrade) return null;
  return (
    <CardPill
      pinned={pinned}
      className={hasCompanionButton ? "card-pill-raised btn-game" : "btn-game"}
      onClick={(e) => {
        e.stopPropagation();
        onQuickUpgrade?.(card.id);
      }}
      aria-label={`Upgrade ${card.name}`}
      title="Upgrade (U)"
    >
      Upgrade
    </CardPill>
  );
}

function SideboardCardItem({
  card,
  locked,
  sbDims,
  selected,
  isActiveCompanion,
  upgraded,
  appliedUpgrades,
  canQuickUpgrade,
  onQuickUpgrade,
  onCardHover,
  onCardHoverEnd,
  onCardClick,
  onSetCompanion,
  onRemoveCompanion,
}: {
  card: CardType;
  locked: boolean;
  sbDims: { width: number; height: number };
  selected: boolean;
  isActiveCompanion: boolean;
  upgraded: boolean;
  appliedUpgrades: CardType[];
  canQuickUpgrade: boolean;
  onQuickUpgrade: ((targetCardId: string) => void) | undefined;
  onCardHover: ((cardId: string, zone: ZoneName) => void) | undefined;
  onCardHoverEnd: (() => void) | undefined;
  onCardClick: (card: CardType) => void;
  onSetCompanion: (cardId: string) => void;
  onRemoveCompanion: () => void;
}): ReactElement {
  const cardIsCompanion = isCompanion(card);

  return (
    <div
      className="relative group"
      onMouseEnter={
        onCardHover ? (): void => onCardHover(card.id, "sideboard") : undefined
      }
      onMouseLeave={onCardHoverEnd}
    >
      <Card
        card={card}
        onClick={() => onCardClick(card)}
        selected={selected}
        isCompanion={isActiveCompanion}
        dimensions={sbDims}
        upgraded={upgraded}
        appliedUpgrades={appliedUpgrades}
      />
      <QuickUpgradeButton
        card={card}
        canQuickUpgrade={canQuickUpgrade}
        pinned={selected}
        hasCompanionButton={cardIsCompanion}
        onQuickUpgrade={onQuickUpgrade}
      />
      {cardIsCompanion && (
        <CardPill
          pinned
          disabled={locked}
          className={`card-pill-companion ${
            isActiveCompanion
              ? "is-set disabled:opacity-50 disabled:cursor-not-allowed"
              : "btn-game"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            if (isActiveCompanion) {
              onRemoveCompanion();
            } else {
              onSetCompanion(card.id);
            }
          }}
          aria-pressed={isActiveCompanion}
          aria-label="Set as companion"
          title="Set as companion"
        >
          <span className="label-short">Companion</span>
          <span className="label-long">
            {isActiveCompanion ? "✓ Companion" : "Set Companion"}
          </span>
        </CardPill>
      )}
    </div>
  );
}

function nextSideboardSelection(options: {
  card: CardType;
  selection: Selection;
  actions: BuildActions;
  tryQueueSideboardToHandMove: () => boolean;
}): Selection {
  const { card, selection, actions, tryQueueSideboardToHandMove } = options;
  if (selection?.type === "card" && selection.cardId === card.id) return null;
  if (selection?.type === "card" && selection.zone === "hand") {
    actions.buildSwap({
      cardAId: selection.cardId,
      sourceA: "hand",
      cardBId: card.id,
      sourceB: "sideboard",
    });
    return null;
  }
  if (selection?.type === "empty") {
    if (tryQueueSideboardToHandMove()) {
      actions.buildMove({
        cardId: card.id,
        source: "sideboard",
        destination: "hand",
        slot: selection.slotIndex,
      });
    }
    return null;
  }
  return { type: "card", cardId: card.id, zone: "sideboard" };
}

function nextEmptySlotSelection(options: {
  slotIndex: number;
  selection: Selection;
  sideboard: CardType[];
  actions: BuildActions;
  tryQueueSideboardToHandMove: () => boolean;
}): Selection {
  const {
    slotIndex,
    selection,
    sideboard,
    actions,
    tryQueueSideboardToHandMove,
  } = options;
  if (selection?.type === "card" && selection.zone === "sideboard") {
    const card = sideboard.find((c) => c.id === selection.cardId);
    if (card && tryQueueSideboardToHandMove()) {
      actions.buildMove({
        cardId: selection.cardId,
        source: "sideboard",
        destination: "hand",
        slot: slotIndex,
      });
    }
    return null;
  }
  if (selection?.type === "empty" && selection.slotIndex === slotIndex) {
    return null;
  }
  return { type: "empty", slotIndex };
}

function nextHandCardSelection(options: {
  card: CardType;
  selection: Selection;
  actions: BuildActions;
}): Selection {
  const { card, selection, actions } = options;
  if (selection?.type === "card" && selection.cardId === card.id) return null;
  if (selection?.type === "card" && selection.zone === "sideboard") {
    actions.buildSwap({
      cardAId: card.id,
      sourceA: "hand",
      cardBId: selection.cardId,
      sourceB: "sideboard",
    });
    return null;
  }
  return { type: "card", cardId: card.id, zone: "hand" };
}

function BuildHandGrid({
  handSlots,
  columns,
  handDims,
  emptySlotLabel,
  selection,
  upgradedCardIds,
  getAppliedUpgrades,
  canQuickUpgrade,
  onQuickUpgrade,
  onCardHover,
  onCardHoverEnd,
  onHandCardClick,
  onEmptySlotClick,
}: {
  handSlots: Array<{
    slotKey: string;
    slotIndex: number;
    card: CardType | null;
  }>;
  columns: number;
  handDims: { width: number; height: number };
  emptySlotLabel: string;
  selection: Selection;
  upgradedCardIds: ReadonlySet<string>;
  getAppliedUpgrades: (cardId: string) => CardType[];
  canQuickUpgrade: boolean;
  onQuickUpgrade: ((targetCardId: string) => void) | undefined;
  onCardHover: ((cardId: string, zone: ZoneName) => void) | undefined;
  onCardHoverEnd: (() => void) | undefined;
  onHandCardClick: (card: CardType) => void;
  onEmptySlotClick: (slotIndex: number) => void;
}): ReactElement {
  return (
    <CardGrid columns={columns} cardWidth={handDims.width}>
      {handSlots.map(({ slotKey, slotIndex, card }) => {
        if (card) {
          const selected =
            selection?.type === "card" && selection.cardId === card.id;
          return (
            <div
              key={card.id}
              className="relative group"
              onMouseEnter={
                onCardHover
                  ? (): void => onCardHover(card.id, "hand")
                  : undefined
              }
              onMouseLeave={onCardHoverEnd}
            >
              <Card
                card={card}
                onClick={() => onHandCardClick(card)}
                selected={selected}
                dimensions={handDims}
                upgraded={upgradedCardIds.has(card.id)}
                appliedUpgrades={getAppliedUpgrades(card.id)}
              />
              <QuickUpgradeButton
                card={card}
                canQuickUpgrade={canQuickUpgrade}
                pinned={selected}
                onQuickUpgrade={onQuickUpgrade}
              />
            </div>
          );
        }
        const slotSelected =
          selection?.type === "empty" && selection.slotIndex === slotIndex;
        return (
          <CardSlot
            key={slotKey}
            label={emptySlotLabel}
            dimensions={handDims}
            selected={slotSelected}
            onClick={() => onEmptySlotClick(slotIndex)}
          />
        );
      })}
    </CardGrid>
  );
}

function buildUpgradeLookup(upgrades: CardType[]): {
  upgradedCardIds: Set<string>;
  getAppliedUpgrades: (cardId: string) => CardType[];
  hasUnappliedUpgrade: boolean;
} {
  const applied = upgrades.filter(hasUpgradeTarget);
  return {
    upgradedCardIds: new Set(applied.map((u) => u.upgrade_target.id)),
    getAppliedUpgrades: (cardId: string): CardType[] =>
      applied.filter((u) => u.upgrade_target.id === cardId),
    hasUnappliedUpgrade: upgrades.some((u) => !u.upgrade_target),
  };
}

function BuildResetOverlay({
  stage,
  round,
  persistedLayout,
  onClearConstraints,
}: {
  stage: number;
  round: number;
  persistedLayout: ReturnType<typeof useSavedLayout>["resolution"];
  onClearConstraints: () => void;
}): ReactElement | null {
  if (!persistedLayout.canReset) return null;
  return (
    <LayoutResetControl
      phaseLabel="Build"
      currentStage={stage}
      currentRound={round}
      originStage={persistedLayout.originStage}
      originRound={persistedLayout.originRound}
      isInherited={persistedLayout.source === "inherited"}
      onConfirm={onClearConstraints}
      position="top-right"
    />
  );
}

function useBuildBoardLayout({
  stage,
  round,
  maxHandSize,
  poolSize,
  hasDesktopUpgradeRail,
  upgradeCount,
}: {
  stage: number;
  round: number;
  maxHandSize: number;
  poolSize: number;
  hasDesktopUpgradeRail: boolean;
  upgradeCount: number;
}): {
  containerRef: ReturnType<typeof useResizableLayout>["containerRef"];
  dims: ReturnType<typeof useResizableLayout>["dims"];
  zoneRefs: ReturnType<typeof useResizableLayout>["zoneRefs"];
  dividerCallbacks: ReturnType<typeof useResizableLayout>["dividerCallbacks"];
  persistedLayout: ReturnType<typeof useSavedLayout>["resolution"];
  clearConstraints: () => void;
  zoneHeights: {
    hand: number;
    battlefield: number;
    sideboard: number;
    upgrades: number | undefined;
  };
  zoneWidths: { upgrades: number } | null;
  upgradeFrame:
    | ReturnType<typeof useResizableLayout>["zoneFrames"]["commandZone"]
    | null;
} {
  const [measuredBoard, setMeasuredBoard] = useState<BoardSize | null>(null);
  const {
    constraints,
    setConstraints,
    clearConstraints,
    resolution: persistedLayout,
  } = useSavedLayout({ scopeKey: "phase:build", stage, round }, measuredBoard);

  const {
    containerRef,
    dims,
    containerSize,
    zoneFrames,
    zoneRefs,
    dividerCallbacks,
  } = useResizableLayout({
    layoutConfig: buildLayoutConfig({
      handSize: maxHandSize,
      sideboardCount: poolSize,
      upgradeRailCount: hasDesktopUpgradeRail ? upgradeCount : 0,
    }),
    constraints,
    onConstraintsChange: setConstraints,
    onConstraintsClear: clearConstraints,
  });
  // A saved layout belongs to a board size band, known once the board is measured.
  if (measuredBoard !== containerSize) setMeasuredBoard(containerSize);

  const upgradeFrame = hasDesktopUpgradeRail ? zoneFrames.commandZone : null;
  return {
    containerRef,
    dims,
    zoneRefs,
    dividerCallbacks,
    persistedLayout,
    clearConstraints,
    zoneHeights: {
      hand: zoneFrames.hand.outerHeight,
      battlefield: zoneFrames.battlefield.outerHeight,
      sideboard: zoneFrames.sideboard.outerHeight,
      upgrades: upgradeFrame?.outerHeight,
    },
    zoneWidths: upgradeFrame ? { upgrades: upgradeFrame.outerWidth } : null,
    upgradeFrame,
  };
}

function deriveBuildPhaseDisplay(options: {
  locked: boolean;
  hasUnappliedUpgrade: boolean;
  hasQuickUpgradeHandler: boolean;
  showDesktopUpgradeRail: boolean;
  upgradeCount: number;
  commandZone: CardType[];
  isMobile: boolean;
}): {
  canQuickUpgrade: boolean;
  hasDesktopUpgradeRail: boolean;
  selectedCompanionId: string | null;
  emptySlotLabel: string;
  layoutClassName: string;
} {
  return {
    canQuickUpgrade:
      !options.locked &&
      options.hasUnappliedUpgrade &&
      options.hasQuickUpgradeHandler,
    hasDesktopUpgradeRail:
      options.showDesktopUpgradeRail && options.upgradeCount > 0,
    selectedCompanionId: options.commandZone[0]?.id ?? null,
    emptySlotLabel: options.isMobile
      ? "+\nCard"
      : "Click here and a card below to add that card to your hand",
    layoutClassName: `transition-opacity ${options.locked ? "opacity-60" : ""}`,
  };
}

function BuildUpgradeRailContent({
  upgradeFrame,
  upgrades,
  fallbackDims,
  renderOverlay,
}: {
  upgradeFrame:
    | ReturnType<typeof useResizableLayout>["zoneFrames"]["commandZone"]
    | null;
  upgrades: CardType[];
  fallbackDims: ReturnType<typeof useResizableLayout>["dims"]["commandZone"];
  renderOverlay: (upgrade: CardType) => ReactElement | null;
}): ReactElement | null {
  if (!upgradeFrame) return null;
  return (
    <UpgradeGrid
      upgrades={upgrades}
      fallbackDims={fallbackDims}
      frame={upgradeFrame}
      renderOverlay={renderOverlay}
    />
  );
}

export function BuildPhase({
  gameState,
  actions,
  selectedBasics,
  onBasicsChange,
  onHandSlotsChange,
  onCardHover,
  onCardHoverEnd,
  onQuickUpgrade,
  onQuickApplyUpgrade,
  isMobile = false,
  showDesktopUpgradeRail = false,
}: BuildPhaseProps): ReactElement {
  const { self_player } = gameState;
  const maxHandSize = self_player.hand_size;
  const locked = self_player.build_ready;
  // Build is sized for the whole pool, which moves don't change, so nothing resizes while building or on a reload.
  const poolSize = self_player.hand.length + self_player.sideboard.length;
  const selectedBasicsCount = selectedBasics.filter(Boolean).length;

  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (!target?.closest(".card, .card-slot")) {
      setSelection(null);
    }
  }, []);
  const handSlots = useMemo(() => {
    const handById = new Map(self_player.hand.map((card) => [card.id, card]));
    return Array.from({ length: maxHandSize }, (_, slot) => {
      const id = self_player.hand_slots[slot];
      return {
        slotKey: `empty-hand-slot-${slot}`,
        slotIndex: slot,
        card: id ? (handById.get(id) ?? null) : null,
      };
    });
  }, [self_player.hand, self_player.hand_slots, maxHandSize]);
  const handSlotIds = useMemo(
    () => handSlots.map(({ card }) => card?.id ?? null),
    [handSlots],
  );

  const { tryQueueSideboardToHandMove } = useBuildPhaseSync({
    handSlotIds,
    handLength: self_player.hand.length,
    sideboardLength: self_player.sideboard.length,
    maxHandSize,
    chosenBasics: self_player.chosen_basics,
    selectedBasicsCount,
    hasUserInteracted,
    onHandSlotsChange,
    onHydrateBasics: onBasicsChange,
  });

  const handleBasicPick = (index: number, name: string): void => {
    if (locked) return;
    setHasUserInteracted(true);
    const next = [...selectedBasics];
    next[index] = name;
    onBasicsChange(next);
    actions.buildSetBasics(next.filter(Boolean));
  };

  const { upgradedCardIds, getAppliedUpgrades, hasUnappliedUpgrade } =
    buildUpgradeLookup(self_player.upgrades);
  const display = deriveBuildPhaseDisplay({
    locked,
    hasUnappliedUpgrade,
    hasQuickUpgradeHandler: Boolean(onQuickUpgrade),
    showDesktopUpgradeRail,
    upgradeCount: self_player.upgrades.length,
    commandZone: self_player.command_zone,
    isMobile,
  });
  const board = useBuildBoardLayout({
    stage: self_player.stage,
    round: self_player.round,
    maxHandSize,
    poolSize,
    hasDesktopUpgradeRail: display.hasDesktopUpgradeRail,
    upgradeCount: self_player.upgrades.length,
  });

  const handDims = {
    width: board.dims.hand.width,
    height: board.dims.hand.height,
  };
  const bfDims = {
    width: board.dims.battlefield.width,
    height: board.dims.battlefield.height,
  };
  const sbDims = {
    width: board.dims.sideboard.width,
    height: board.dims.sideboard.height,
  };
  const isCardSelected = (cardId: string): boolean =>
    selection?.type === "card" && selection.cardId === cardId;

  const renderUpgradeApplyButton = (upgrade: CardType): ReactElement | null => {
    if (locked || upgrade.upgrade_target || !onQuickApplyUpgrade) return null;
    return (
      <CardPill
        className="btn-game"
        onClick={(e) => {
          e.stopPropagation();
          onQuickApplyUpgrade(upgrade.id);
        }}
        aria-label={`Apply ${upgrade.name}`}
        title="Apply"
      >
        Apply
      </CardPill>
    );
  };

  return (
    <ZoneLayout
      containerRef={board.containerRef}
      className={display.layoutClassName}
      onClick={handleBackgroundClick}
      isMobile={isMobile}
      zoneHeights={board.zoneHeights}
      zoneWidths={board.zoneWidths}
      zoneRefs={{
        hand: board.zoneRefs.hand,
        battlefield: board.zoneRefs.battlefield,
        sideboard: board.zoneRefs.sideboard,
        upgrades: board.zoneRefs.commandZone,
      }}
      overlay={
        <BuildResetOverlay
          stage={self_player.stage}
          round={self_player.round}
          persistedLayout={board.persistedLayout}
          onClearConstraints={board.clearConstraints}
        />
      }
      hasHand={true}
      hasBattlefield={true}
      hasSideboard={poolSize > 0}
      hasUpgrades={display.hasDesktopUpgradeRail}
      containerTargetId="build-workspace"
      dividerCallbacks={locked ? null : board.dividerCallbacks}
      zoneTargetIds={{
        hand: "build-hand",
        battlefield: "build-battlefield",
        sideboard: "build-sideboard",
      }}
      handLabel="Hand"
      handContent={
        <BuildHandGrid
          handSlots={handSlots}
          columns={board.dims.hand.columns}
          handDims={handDims}
          emptySlotLabel={display.emptySlotLabel}
          selection={selection}
          upgradedCardIds={upgradedCardIds}
          getAppliedUpgrades={getAppliedUpgrades}
          canQuickUpgrade={display.canQuickUpgrade}
          onQuickUpgrade={onQuickUpgrade}
          onCardHover={onCardHover}
          onCardHoverEnd={onCardHoverEnd}
          onHandCardClick={(card) => {
            if (!locked) {
              setSelection(nextHandCardSelection({ card, selection, actions }));
            }
          }}
          onEmptySlotClick={(slotIndex) => {
            if (!locked) {
              setSelection(
                nextEmptySlotSelection({
                  slotIndex,
                  selection,
                  sideboard: self_player.sideboard,
                  actions,
                  tryQueueSideboardToHandMove,
                }),
              );
            }
          }}
        />
      }
      battlefieldLabel="Battlefield"
      battlefieldContent={
        <CardGrid
          columns={board.dims.battlefield.columns}
          cardWidth={bfDims.width}
        >
          {BASIC_LAND_SLOTS.map(({ key, index }) => (
            <BasicLandSlot
              key={key}
              selected={selectedBasics[index] ?? null}
              dimensions={bfDims}
              onPick={(name) => handleBasicPick(index, name)}
              isMobile={isMobile}
            />
          ))}
          <TreasureCard count={self_player.treasures} dimensions={bfDims} />
          <PoisonCard count={self_player.poison} dimensions={bfDims} />
        </CardGrid>
      }
      sideboardLabel="Sideboard"
      sideboardContent={
        <CardGrid
          columns={board.dims.sideboard.columns}
          cardWidth={sbDims.width}
        >
          {self_player.sideboard.map((card) => (
            <SideboardCardItem
              key={card.id}
              card={card}
              locked={locked}
              sbDims={sbDims}
              selected={isCardSelected(card.id)}
              isActiveCompanion={card.id === display.selectedCompanionId}
              upgraded={upgradedCardIds.has(card.id)}
              appliedUpgrades={getAppliedUpgrades(card.id)}
              canQuickUpgrade={display.canQuickUpgrade}
              onQuickUpgrade={onQuickUpgrade}
              onCardHover={onCardHover}
              onCardHoverEnd={onCardHoverEnd}
              onCardClick={(clickedCard) => {
                if (!locked) {
                  setSelection(
                    nextSideboardSelection({
                      card: clickedCard,
                      selection,
                      actions,
                      tryQueueSideboardToHandMove,
                    }),
                  );
                }
              }}
              onSetCompanion={actions.buildSetCompanion}
              onRemoveCompanion={actions.buildRemoveCompanion}
            />
          ))}
        </CardGrid>
      }
      upgradesLabel="Upgrades"
      upgradesContent={
        <BuildUpgradeRailContent
          upgradeFrame={board.upgradeFrame}
          upgrades={self_player.upgrades}
          fallbackDims={board.dims.commandZone}
          renderOverlay={renderUpgradeApplyButton}
        />
      }
    />
  );
}

/** A pill on a card's bottom edge. It shows while the card is hovered or the keyboard is on it, or always while pinned. */
function CardPill({
  pinned = false,
  className,
  ...button
}: ComponentProps<"button"> & { pinned?: boolean }): ReactElement {
  // Read as focus arrives, because a clicked pill also matches :focus-visible once any key is down.
  const [hasKeyboardFocus, setHasKeyboardFocus] = useState(false);
  const visibility =
    pinned || hasKeyboardFocus
      ? "opacity-100 pointer-events-auto"
      : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto";

  return (
    <div className="card-overlay">
      <button
        type="button"
        className={`card-pill rounded-full font-semibold transition-opacity duration-150 ${visibility} ${className}`}
        onFocus={(event) =>
          setHasKeyboardFocus(event.currentTarget.matches(":focus-visible"))
        }
        onBlur={() => setHasKeyboardFocus(false)}
        {...button}
      />
    </div>
  );
}
