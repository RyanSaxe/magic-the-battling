import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type {
  GameState,
  Card as CardType,
  BuildSource,
  ZoneName,
} from "../../types";
import { Card } from "../../components/card";
import { CardSlot } from "../../components/common/CardSlot";
import { BasicLandSlot } from "../../components/common/BasicLandSlot";
import { TreasureCard } from "../../components/common/TreasureCard";
import { PoisonCard } from "../../components/common/PoisonCard";
import { CardGrid } from "../../components/common/CardGrid";
import { LayoutResetControl } from "../../components/common/LayoutResetControl";
import { UpgradeGrid } from "../../components/common/UpgradeGrid";
import { ZoneLayout } from "../../components/common/ZoneLayout";
import { ZONE_LAYOUT_PADDING } from "../../hooks/useCardLayout";
import { usePersistedConstraints } from "../../hooks/usePersistedConstraints";
import { useResizableLayout } from "../../hooks/useResizableLayout";
import { getUpgradeZoneLayoutBounds } from "../../utils/upgradeGrid";

type Selection =
  | { type: "card"; cardId: string; zone: "hand" | "sideboard" }
  | { type: "empty"; slotIndex: number }
  | null;

interface BuildPhaseProps {
  gameState: GameState;
  actions: {
    buildMove: (
      cardId: string,
      source: BuildSource,
      destination: BuildSource,
    ) => void;
    buildSwap: (
      cardAId: string,
      sourceA: BuildSource,
      cardBId: string,
      sourceB: BuildSource,
    ) => void;
    buildReady: (
      basics: string[],
      playDrawPreference: "play" | "draw",
      handOrder?: string[],
    ) => void;
    buildUnready: () => void;
    buildApplyUpgrade: (upgradeId: string, targetCardId: string) => void;
    buildSetCompanion: (cardId: string) => void;
    buildRemoveCompanion: () => void;
  };
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

function syncHandSlots(
  prevSlots: (CardType | null)[],
  hand: CardType[],
  maxHandSize: number,
): (CardType | null)[] {
  const handIds = new Set(hand.map((c) => c.id));
  const idToCard = new Map(hand.map((c) => [c.id, c]));
  const newSlots: (CardType | null)[] = new Array(maxHandSize).fill(null);

  // Keep existing slot assignments for cards still in hand
  for (let i = 0; i < Math.min(prevSlots.length, maxHandSize); i++) {
    const prev = prevSlots[i];
    if (prev && handIds.has(prev.id)) {
      newSlots[i] = idToCard.get(prev.id)!;
      handIds.delete(prev.id);
    }
  }

  // Place any unslotted hand cards at first empty slot
  for (const id of handIds) {
    const emptyIdx = newSlots.indexOf(null);
    if (emptyIdx !== -1) {
      newSlots[emptyIdx] = idToCard.get(id)!;
    }
  }

  return newSlots;
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
}: BuildPhaseProps) {
  const { self_player } = gameState;
  const maxHandSize = self_player.hand_size;
  const locked = self_player.build_ready;
  const hasSideboard = self_player.sideboard.length > 0;
  const selectedBasicsCount = selectedBasics.filter(Boolean).length;

  const hasUserInteracted = useRef(false);
  const pendingHandAddsRef = useRef(0);
  const pendingHandAddsTimeoutRef = useRef<number | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    if (!(e.target as HTMLElement).closest(".card, .card-slot")) {
      setSelection(null);
    }
  }, []);
  const [slotOrder, setSlotOrder] = useState<(string | null)[]>([]);

  const handSlots = useMemo(() => {
    const result = syncHandSlots(
      slotOrder.map((id) =>
        id ? (self_player.hand.find((c) => c.id === id) ?? null) : null,
      ),
      self_player.hand,
      maxHandSize,
    );
    return result;
  }, [slotOrder, self_player.hand, maxHandSize]);

  useEffect(() => {
    onHandSlotsChange?.(handSlots.map((c) => c?.id ?? null));
  }, [handSlots, onHandSlotsChange]);

  const setSlotCard = useCallback((index: number, card: CardType) => {
    setSlotOrder((prev) => {
      const next = [...prev];
      while (next.length <= index) next.push(null);
      next[index] = card.id;
      return next;
    });
  }, []);

  const clearPendingHandAdds = useCallback(() => {
    pendingHandAddsRef.current = 0;
    if (pendingHandAddsTimeoutRef.current !== null) {
      window.clearTimeout(pendingHandAddsTimeoutRef.current);
      pendingHandAddsTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Clear optimistic move guards once authoritative state updates arrive.
    clearPendingHandAdds();
  }, [self_player.hand.length, self_player.sideboard.length, clearPendingHandAdds]);

  useEffect(
    () => () => {
      clearPendingHandAdds();
    },
    [clearPendingHandAdds],
  );

  const tryQueueSideboardToHandMove = useCallback(() => {
    const availableSlots =
      maxHandSize - self_player.hand.length - pendingHandAddsRef.current;
    if (availableSlots <= 0) return false;

    pendingHandAddsRef.current += 1;
    if (pendingHandAddsTimeoutRef.current !== null) {
      window.clearTimeout(pendingHandAddsTimeoutRef.current);
    }
    // Fallback so a dropped/failed response doesn't leave the guard stuck.
    pendingHandAddsTimeoutRef.current = window.setTimeout(() => {
      pendingHandAddsRef.current = 0;
      pendingHandAddsTimeoutRef.current = null;
    }, 2000);
    return true;
  }, [maxHandSize, self_player.hand.length]);

  useEffect(() => {
    if (
      !hasUserInteracted.current &&
      self_player.chosen_basics?.length &&
      selectedBasicsCount === 0
    ) {
      onBasicsChange([...self_player.chosen_basics]);
    }
  }, [self_player.chosen_basics, selectedBasicsCount, onBasicsChange]);

  const handleBasicPick = (index: number, name: string) => {
    if (locked) return;
    hasUserInteracted.current = true;
    const next = [...selectedBasics];
    next[index] = name;
    onBasicsChange(next);
  };

  const appliedUpgrades = self_player.upgrades.filter((u) => u.upgrade_target);
  const upgradedCardIds = new Set(
    appliedUpgrades.map((u) => u.upgrade_target!.id),
  );
  const getAppliedUpgrades = (cardId: string) =>
    appliedUpgrades.filter((u) => u.upgrade_target!.id === cardId);
  const hasUnappliedUpgrade = self_player.upgrades.some((u) => !u.upgrade_target);
  const canQuickUpgrade = !locked && hasUnappliedUpgrade && !!onQuickUpgrade;
  const hasDesktopUpgradeRail =
    showDesktopUpgradeRail && self_player.upgrades.length > 0;

  const isCompanion = (card: CardType) =>
    card.oracle_text?.includes("Companion —") ?? false;
  const selectedCompanionId = self_player.command_zone[0]?.id ?? null;

  const handleEmptySlotClick = (slotIndex: number) => {
    if (locked) return;
    if (selection?.type === "card" && selection.zone === "sideboard") {
      const card = self_player.sideboard.find((c) => c.id === selection.cardId);
      if (!card) {
        setSelection(null);
        return;
      }
      if (!tryQueueSideboardToHandMove()) {
        setSelection(null);
        return;
      }
      setSlotCard(slotIndex, card);
      actions.buildMove(selection.cardId, "sideboard", "hand");
      setSelection(null);
    } else if (
      selection?.type === "empty" &&
      selection.slotIndex === slotIndex
    ) {
      setSelection(null);
    } else {
      setSelection({ type: "empty", slotIndex });
    }
  };

  const handleHandCardClick = (card: CardType, slotIndex: number) => {
    if (locked) return;
    if (selection?.type === "card" && selection.cardId === card.id) {
      setSelection(null);
    } else if (selection?.type === "card" && selection.zone === "sideboard") {
      const sideboardCard = self_player.sideboard.find(
        (c) => c.id === selection.cardId,
      );
      if (sideboardCard) setSlotCard(slotIndex, sideboardCard);
      actions.buildSwap(card.id, "hand", selection.cardId, "sideboard");
      setSelection(null);
    } else {
      setSelection({ type: "card", cardId: card.id, zone: "hand" });
    }
  };

  const handleSideboardCardClick = (card: CardType) => {
    if (locked) return;
    if (selection?.type === "card" && selection.cardId === card.id) {
      setSelection(null);
    } else if (selection?.type === "card" && selection.zone === "hand") {
      const handSlotIndex = handSlots.findIndex(
        (c) => c?.id === selection.cardId,
      );
      if (handSlotIndex !== -1) setSlotCard(handSlotIndex, card);
      actions.buildSwap(selection.cardId, "hand", card.id, "sideboard");
      setSelection(null);
    } else if (selection?.type === "empty") {
      if (!tryQueueSideboardToHandMove()) {
        setSelection(null);
        return;
      }
      setSlotCard(selection.slotIndex, card);
      actions.buildMove(card.id, "sideboard", "hand");
      setSelection(null);
    } else {
      setSelection({ type: "card", cardId: card.id, zone: "sideboard" });
    }
  };

  const [stableSBCount, setStableSBCount] = useState(self_player.sideboard.length);
  if (self_player.sideboard.length > stableSBCount) {
    setStableSBCount(self_player.sideboard.length);
  }

  const {
    constraints,
    setConstraints,
    clearConstraints,
    resolution: persistedLayout,
  } = usePersistedConstraints({
    scopeKey: "phase:build",
    stage: self_player.stage,
    round: self_player.round,
  });

  const battlefieldCount = 3 + 1 + 1; // 3 basic slots + treasure + poison
  const upgradeCount = hasDesktopUpgradeRail ? self_player.upgrades.length : 0;
  const layoutConfig = {
    zones: {
      hand: { count: maxHandSize },
      battlefield: { count: battlefieldCount, priority: "fill" as const, maxRows: 1 },
      sideboard: { count: stableSBCount },
      commandZone: {
        count: upgradeCount,
        ...getUpgradeZoneLayoutBounds(upgradeCount),
      },
    },
    layout: {
      top: ["hand"],
      bottomLeft: ["battlefield", "sideboard"],
      bottomRight: hasDesktopUpgradeRail ? ["commandZone"] : [],
    },
    ...ZONE_LAYOUT_PADDING,
  };

  const { containerRef, dims, zoneFrames, zoneRefs, dividerCallbacks } =
    useResizableLayout({
      layoutConfig,
      constraints,
      onConstraintsChange: setConstraints,
      onConstraintsClear: clearConstraints,
    });

  const handDims = { width: dims.hand.width, height: dims.hand.height };
  const bfDims = {
    width: dims.battlefield.width,
    height: dims.battlefield.height,
  };
  const sbDims = { width: dims.sideboard.width, height: dims.sideboard.height };
  const upgradeDims = {
    width: dims.commandZone.width,
    height: dims.commandZone.height,
    rows: dims.commandZone.rows,
    columns: dims.commandZone.columns,
  };

  const emptySlotLabel = isMobile
    ? "Tap here and a card below to add that card to your hand"
    : "Click here and a card below to add that card to your hand";

  const isCardSelected = (cardId: string) =>
    selection?.type === "card" && selection.cardId === cardId;

  const renderQuickUpgradeButton = (card: CardType) => {
    if (!canQuickUpgrade) return null;
    const selected = isCardSelected(card.id);
    const visibilityClasses = selected
      ? "opacity-100 pointer-events-auto"
      : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto";

    return (
      <button
        type="button"
        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 px-3 py-1.5 rounded-full text-xs font-semibold bg-purple-600 text-white shadow-md ring-1 ring-black/40 hover:bg-purple-500 transition-opacity duration-150 ${visibilityClasses}`}
        onClick={(e) => {
          e.stopPropagation();
          onQuickUpgrade?.(card.id);
        }}
        aria-label={`Upgrade ${card.name}`}
        title="Upgrade (U)"
      >
        Upgrade
      </button>
    );
  };

  const renderUpgradeApplyButton = (upgrade: CardType) => {
    if (locked || upgrade.upgrade_target || !onQuickApplyUpgrade) return null;

    return (
      <button
        type="button"
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 px-3 py-1.5 rounded-full text-xs font-semibold bg-purple-600 text-white shadow-md ring-1 ring-black/40 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto hover:bg-purple-500 transition-opacity duration-150"
        onClick={(e) => {
          e.stopPropagation();
          onQuickApplyUpgrade(upgrade.id);
        }}
        aria-label={`Apply ${upgrade.name}`}
        title="Apply"
      >
        Apply
      </button>
    );
  };

  const handItems = handSlots.map((card, i) => {
    if (card) {
      return (
        <div
          key={card.id}
          className="relative group"
          onMouseEnter={
            onCardHover ? () => onCardHover(card.id, "hand") : undefined
          }
          onMouseLeave={onCardHoverEnd}
        >
          <Card
            card={card}
            onClick={() => handleHandCardClick(card, i)}
            selected={isCardSelected(card.id)}
            dimensions={handDims}
            upgraded={upgradedCardIds.has(card.id)}
            appliedUpgrades={getAppliedUpgrades(card.id)}
          />
          {renderQuickUpgradeButton(card)}
        </div>
      );
    }
    const slotSelected =
      selection?.type === "empty" && selection.slotIndex === i;
    return (
      <CardSlot
        key={`empty-${i}`}
        label={emptySlotLabel}
        dimensions={handDims}
        selected={slotSelected}
        onClick={() => handleEmptySlotClick(i)}
      />
    );
  });

  const basicSlots = Array.from({ length: 3 }, (_, i) => (
    <BasicLandSlot
      key={i}
      selected={selectedBasics[i] ?? null}
      dimensions={bfDims}
      onPick={(name) => handleBasicPick(i, name)}
      isMobile={isMobile}
    />
  ));

  return (
    <>
      {self_player.in_sudden_death && (
        <div className="bg-red-900/80 border-b-2 border-red-500 px-4 py-3 text-center shrink-0">
          <div className="text-red-100 font-bold text-lg tracking-wider uppercase animate-pulse flex items-center justify-center gap-2">
            Sudden Death
            <span className="relative group cursor-help">
              <span className="text-red-300/80 text-sm not-italic">
                &#9432;
              </span>
              <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-64 p-2 bg-black/95 border border-red-500/50 rounded text-xs text-left text-red-100 font-normal normal-case tracking-normal opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                Multiple players reached lethal poison. The two with the lowest
                poison are reset to 9 and face off. A draw causes both players
                to rebuild. Play continues until one is eliminated.
              </span>
            </span>
          </div>
          <div className="text-red-200/80 text-xs mt-1">
            Build your deck - fight to survive!
          </div>
        </div>
      )}

      <ZoneLayout
        containerRef={containerRef}
        className={`transition-opacity ${locked ? "opacity-60" : ""}`}
        onClick={handleBackgroundClick}
        isMobile={isMobile}
        zoneHeights={{
          hand: zoneFrames.hand.outerHeight,
          battlefield: zoneFrames.battlefield.outerHeight,
          sideboard: zoneFrames.sideboard.outerHeight,
          upgrades: hasDesktopUpgradeRail ? zoneFrames.commandZone.outerHeight : undefined,
        }}
        zoneWidths={hasDesktopUpgradeRail ? {
          upgrades: zoneFrames.commandZone.outerWidth,
        } : null}
        zoneRefs={{
          hand: zoneRefs.hand,
          battlefield: zoneRefs.battlefield,
          sideboard: zoneRefs.sideboard,
          upgrades: zoneRefs.commandZone,
        }}
        overlay={
          persistedLayout.canReset ? (
            <LayoutResetControl
              phaseLabel="Build"
              currentStage={self_player.stage}
              currentRound={self_player.round}
              originStage={persistedLayout.originStage}
              originRound={persistedLayout.originRound}
              isInherited={persistedLayout.source === "inherited"}
              onConfirm={clearConstraints}
              position="top-right"
            />
          ) : null
        }
        hasHand={true}
        hasBattlefield={true}
        hasSideboard={hasSideboard}
        hasUpgrades={hasDesktopUpgradeRail}
        containerTargetId="build-workspace"
        dividerCallbacks={locked ? null : dividerCallbacks}
        zoneTargetIds={{
          hand: "build-hand",
          battlefield: "build-battlefield",
          sideboard: "build-sideboard",
        }}
        handLabel="Hand"
        handContent={
          <CardGrid columns={dims.hand.columns} cardWidth={handDims.width}>
            {handItems}
          </CardGrid>
        }
        battlefieldLabel="Battlefield"
        battlefieldContent={
          <CardGrid columns={dims.battlefield.columns} cardWidth={bfDims.width}>
            {basicSlots}
            <TreasureCard count={self_player.treasures} dimensions={bfDims} />
            <PoisonCard count={self_player.poison} dimensions={bfDims} />
          </CardGrid>
        }
        sideboardLabel="Sideboard"
        sideboardContent={
          <CardGrid columns={dims.sideboard.columns} cardWidth={sbDims.width}>
            {self_player.sideboard.map((card) => {
              const cardIsCompanion = isCompanion(card);
              const isActiveCompanion = card.id === selectedCompanionId;
              return (
                <div
                  key={card.id}
                  className="relative group"
                  onMouseEnter={
                    onCardHover
                      ? () => onCardHover(card.id, "sideboard")
                      : undefined
                  }
                  onMouseLeave={onCardHoverEnd}
                >
                  <Card
                    card={card}
                    onClick={() => handleSideboardCardClick(card)}
                    selected={isCardSelected(card.id)}
                    isCompanion={isActiveCompanion}
                    dimensions={sbDims}
                    upgraded={upgradedCardIds.has(card.id)}
                    appliedUpgrades={getAppliedUpgrades(card.id)}
                  />
                  {renderQuickUpgradeButton(card)}
                  {cardIsCompanion && (
                    <button
                      disabled={locked}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isActiveCompanion) {
                          actions.buildRemoveCompanion();
                        } else {
                          actions.buildSetCompanion(card.id);
                        }
                      }}
                      className={`absolute bottom-0 left-0 right-0 text-center text-[10px] font-medium py-0.5 rounded-b-lg disabled:opacity-50 disabled:cursor-not-allowed ${
                        isActiveCompanion
                          ? "bg-amber-500/90 text-black"
                          : "bg-purple-600/80 text-white hover:bg-purple-500/90"
                      }`}
                    >
                      {isActiveCompanion ? "Companion" : "Set Companion"}
                    </button>
                  )}
                </div>
              );
            })}
          </CardGrid>
        }
        upgradesLabel="Upgrades"
        upgradesContent={
          hasDesktopUpgradeRail ? (
            <UpgradeGrid
              upgrades={self_player.upgrades}
              fallbackDims={upgradeDims}
              frame={zoneFrames.commandZone}
              renderOverlay={renderUpgradeApplyButton}
            />
          ) : null
        }
      />
    </>
  );
}
