import { useRef, useState } from "react";
import { Card } from "../../components/card";
import { CardGrid } from "../../components/common/CardGrid";
import { LayoutResetControl } from "../../components/common/LayoutResetControl";
import { ZoneDivider } from "../../components/common/ZoneDivider";
import { ZoneLabel } from "../../components/common/ZoneLabel";
import {
  THE_VANQUISHER_IMAGE,
  TREASURE_TOKEN_IMAGE,
} from "../../constants/assets";
import {
  useCardLayout,
  ZONE_LAYOUT_PADDING,
  type CardLayoutConfig,
} from "../../hooks/useCardLayout";
import { usePersistedConstraints } from "../../hooks/usePersistedConstraints";
import { useZoneDividers } from "../../hooks/useZoneDividers";
import type { GameState, Card as CardType } from "../../types";

interface RewardPhaseProps {
  gameState: GameState;
  actions: {
    rewardPickUpgrade: (upgradeId: string) => void;
    rewardDone: (upgradeId?: string) => void;
  };
  selectedUpgradeId: string | null;
  onUpgradeSelect: (upgradeId: string | null) => void;
  selectedPoolCardId: string | null;
  onPoolCardSelect: (cardId: string | null) => void;
  isMobile?: boolean;
}

type RewardItem = { key: string; card: CardType };

const STATIC_DIVIDER_CALLBACKS = {
  onDragStart: () => {},
  onDrag: () => {},
  onDragEnd: () => {},
};

function EmptyZoneTile({
  dimensions,
  label,
}: {
  dimensions: { width: number; height: number };
  label: string;
}) {
  return (
    <div
      className="modal-chrome border gold-border rounded-lg flex items-center justify-center px-3 text-center text-xs text-gray-300 shadow-md"
      style={{ width: dimensions.width, height: dimensions.height }}
    >
      {label}
    </div>
  );
}

function formatPoisonSummary(
  poisonDealt: number | undefined,
  poisonTaken: number | undefined,
): string {
  const parts: string[] = [];
  if (poisonDealt) parts.push(`Dealt ${poisonDealt}`);
  if (poisonTaken) parts.push(`Took ${poisonTaken}`);
  return parts.length > 0 ? `${parts.join(" / ")} poison` : "No poison";
}

function createRewardCard(
  key: string,
  name: string,
  imageUrl: string,
  typeLine: string,
  oracleText: string | null,
): CardType {
  return {
    id: key,
    name,
    image_url: imageUrl,
    flip_image_url: null,
    png_url: imageUrl,
    flip_png_url: null,
    type_line: typeLine,
    tokens: [],
    elo: null,
    upgrade_target: null,
    oracle_text: oracleText,
    colors: [],
    cmc: 0,
  };
}

export function RewardPhase({
  gameState,
  actions,
  selectedUpgradeId,
  onUpgradeSelect,
  selectedPoolCardId,
  onPoolCardSelect,
  isMobile = false,
}: RewardPhaseProps) {
  void actions;

  const rewardsZoneRef = useRef<HTMLDivElement | null>(null);
  const upgradesZoneRef = useRef<HTMLDivElement | null>(null);
  const poolZoneRef = useRef<HTMLDivElement | null>(null);
  const [selectedRewardCardId, setSelectedRewardCardId] = useState<
    string | null
  >(null);

  const { self_player, available_upgrades } = gameState;
  const { last_battle_result } = self_player;
  const isStageIncreasing = self_player.is_stage_increasing;
  const hasUpgradeSection =
    gameState.use_upgrades && isStageIncreasing && available_upgrades.length > 0;
  const appliedUpgradesList = self_player.upgrades.filter((u) => u.upgrade_target);
  const upgradedCardIds = new Set(
    appliedUpgradesList.map((u) => u.upgrade_target!.id),
  );
  const getAppliedUpgrades = (cardId: string) =>
    appliedUpgradesList.filter((u) => u.upgrade_target!.id === cardId);

  const rewardItems: RewardItem[] = [];
  if (last_battle_result?.treasures_gained) {
    rewardItems.push({
      key: "treasure",
      card: createRewardCard(
        "reward:treasure",
        `Treasure x${last_battle_result.treasures_gained}`,
        TREASURE_TOKEN_IMAGE,
        "Token Artifact — Treasure",
        "Tap, Sacrifice this artifact: Add one mana of any color.",
      ),
    });
  }
  if (last_battle_result?.vanquisher_gained) {
    rewardItems.push({
      key: "vanquisher",
      card: createRewardCard(
        "reward:vanquisher",
        "The Vanquisher",
        THE_VANQUISHER_IMAGE,
        "Artifact",
        "Your hand size increases by 1.",
      ),
    });
  }
  if (last_battle_result?.card_gained) {
    rewardItems.push({
      key: last_battle_result.card_gained.id,
      card: last_battle_result.card_gained,
    });
  }

  const poolCards = [...self_player.hand, ...self_player.sideboard];
  const rewardsCount = Math.max(rewardItems.length, 1);
  const poolCount = hasUpgradeSection ? Math.max(poolCards.length, 1) : 0;

  const {
    constraints,
    setConstraints,
    clearConstraints,
    resolution: persistedLayout,
  } = usePersistedConstraints({
    scopeKey: "phase:reward",
    stage: self_player.stage,
    round: self_player.round,
  });

  const activeConstraints = hasUpgradeSection ? constraints : null;
  const rewardLayoutConfig = {
    zones: {
      rewards: {
        count: rewardsCount,
        maxCardWidth: 300,
        priority: "fill",
        maxRows: 1,
      },
      upgrades: {
        count: hasUpgradeSection ? available_upgrades.length : 0,
        maxCardWidth: 200,
      },
      pool: { count: poolCount, maxCardWidth: 180 },
    },
    layout: { top: ["rewards"], bottomLeft: ["upgrades", "pool"] },
    ...ZONE_LAYOUT_PADDING,
    maxTopFraction: hasUpgradeSection ? 0.2 : undefined,
    alwaysComputeFrames: hasUpgradeSection,
  } satisfies CardLayoutConfig;

  const [containerRef, dims, containerSize, zoneFrames] = useCardLayout({
    ...rewardLayoutConfig,
    constraints: activeConstraints,
  });

  const dividerCallbacks = useZoneDividers({
    containerHeight: containerSize.height,
    containerWidth: containerSize.width,
    currentLayout: dims,
    layoutConfig: rewardLayoutConfig,
    allowHorizontalResize: false,
    measureInitialConstraints: hasUpgradeSection
      ? () => {
          const rewardsOuter =
            rewardsZoneRef.current?.getBoundingClientRect().height ?? 0;
          const upgradesOuter =
            upgradesZoneRef.current?.getBoundingClientRect().height ?? 0;
          const poolOuter = poolZoneRef.current?.getBoundingClientRect().height ?? 0;
          const sectionGap = ZONE_LAYOUT_PADDING.sectionGap;
          const sectionPadV =
            ZONE_LAYOUT_PADDING.sectionPadTop + ZONE_LAYOUT_PADDING.sectionPadBottom;

          const lowerOuter = upgradesOuter + poolOuter + sectionGap;
          const usableH = rewardsOuter + lowerOuter;
          const upgradesInner = Math.max(0, upgradesOuter - sectionPadV);
          const poolInner = Math.max(0, poolOuter - sectionPadV);
          const totalInner = upgradesInner + poolInner;

          return usableH > 0
            ? {
                topFraction: rewardsOuter / usableH,
                leftFraction: 0.7,
                bottomLeftSplit:
                  totalInner > 0 ? upgradesInner / totalInner : 0.5,
                usableHeight: usableH,
                bottomInnerHeight: Math.max(
                  0,
                  lowerOuter - sectionGap - 2 * sectionPadV,
                ),
                usableWidth: containerSize.width,
              }
            : null;
        }
      : undefined,
    constraints: activeConstraints,
    onConstraintsChange: setConstraints,
    onConstraintsClear: clearConstraints,
  });

  const rewardsDims = {
    width: dims.rewards.width,
    height: dims.rewards.height,
  };
  const upgradesDims = {
    width: dims.upgrades.width,
    height: dims.upgrades.height,
  };
  const poolDims = {
    width: dims.pool.width,
    height: dims.pool.height,
  };

  const controlledStyle = (height?: number) =>
    zoneFrames && height != null
      ? { height, flex: "0 0 auto" as const }
      : undefined;

  const rewardsStyle = controlledStyle(zoneFrames?.rewards?.outerHeight);
  const upgradesStyle = controlledStyle(zoneFrames?.upgrades?.outerHeight);
  const poolStyle = zoneFrames
    ? {
        minHeight: zoneFrames.pool.outerHeight,
        flex: "1 1 auto" as const,
      }
    : undefined;

  const isWinner = last_battle_result?.winner_name === self_player.name;
  const isDraw = last_battle_result?.is_draw;
  const resultLabel = !last_battle_result
    ? "Rewards"
    : isDraw
      ? "Draw"
      : isWinner
        ? "Victory!"
        : "Defeat";
  const resultClass = !last_battle_result
    ? "text-amber-300"
    : isDraw
      ? "text-yellow-400"
      : isWinner
        ? "text-green-400"
        : "text-red-400";
  const opponentLabel = last_battle_result
    ? `vs ${last_battle_result.opponent_name}`
    : "No battle result";
  const poisonLabel = last_battle_result
    ? formatPoisonSummary(
        last_battle_result.poison_dealt,
        last_battle_result.poison_taken,
      )
    : "No rewards this round";

  return (
    <div className="zone-divider-bg p-[2px] flex-1 min-h-0 flex flex-col">
      <div className="shrink-0 top-attached-rail top-attached-rail-pad text-[11px] sm:text-sm">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-4">
          <div className="min-w-0 truncate text-left text-gray-300 leading-tight">
            {opponentLabel}
          </div>
          <div className={`font-semibold text-center leading-tight ${resultClass}`}>
            {resultLabel}
          </div>
          <div className="min-w-0 truncate text-right text-gray-300 leading-tight">
            {poisonLabel}
          </div>
        </div>
      </div>
      <ZoneDivider
        orientation="horizontal"
        interactive={false}
        {...STATIC_DIVIDER_CALLBACKS}
      />

      <div
        ref={containerRef}
        className="relative flex flex-col flex-1 min-h-0"
        style={{ gap: dividerCallbacks.topDivider ? 0 : 2 }}
      >
        {hasUpgradeSection && persistedLayout.canReset && (
          <LayoutResetControl
            phaseLabel="Reward"
            currentStage={self_player.stage}
            currentRound={self_player.round}
            originStage={persistedLayout.originStage}
            originRound={persistedLayout.originRound}
            isInherited={persistedLayout.source === "inherited"}
            onConfirm={clearConstraints}
            position={isMobile ? "bottom-right" : "top-right"}
          />
        )}

        <div
          ref={rewardsZoneRef}
          className={`zone-pack w-full px-3 pt-5 pb-3 relative ${hasUpgradeSection ? "" : "flex-1 min-h-0"}`}
          style={rewardsStyle}
          data-guide-target="reward-summary"
        >
          <ZoneLabel>Rewards</ZoneLabel>
          {rewardItems.length === 0 ? (
            <div className="flex items-center justify-center min-h-full">
              <EmptyZoneTile
                dimensions={rewardsDims}
                label="No rewards this round"
              />
            </div>
          ) : !hasUpgradeSection ? (
            <div className="flex items-center justify-center min-h-full">
              <CardGrid columns={dims.rewards.columns} cardWidth={rewardsDims.width}>
                {rewardItems.map((item) => (
                  <Card
                    key={item.key}
                    card={item.card}
                    dimensions={rewardsDims}
                    selected={selectedRewardCardId === item.card.id}
                    onClick={() =>
                      setSelectedRewardCardId((current) =>
                        current === item.card.id ? null : item.card.id,
                      )
                    }
                  />
                ))}
              </CardGrid>
            </div>
          ) : (
            <CardGrid columns={dims.rewards.columns} cardWidth={rewardsDims.width}>
              {rewardItems.map((item) => (
                <Card
                  key={item.key}
                  card={item.card}
                  dimensions={rewardsDims}
                  selected={selectedRewardCardId === item.card.id}
                  onClick={() =>
                    setSelectedRewardCardId((current) =>
                      current === item.card.id ? null : item.card.id,
                    )
                  }
                />
              ))}
            </CardGrid>
          )}
          <div
            data-guide-target="reward-progression"
            className="mt-4 rounded-lg border border-amber-500/15 bg-black/25 px-3 py-2 text-center text-xs text-gray-300"
          >
            <span className="text-amber-300 font-medium">Round progression:</span>{" "}
            every third reward increases starting hand size by 1.
            {hasUpgradeSection ? " This reward also includes an upgrade choice." : ""}
          </div>
        </div>

        {hasUpgradeSection && dividerCallbacks.topDivider && (
          <ZoneDivider
            orientation="horizontal"
            interactive={!isMobile}
            {...dividerCallbacks.topDivider}
          />
        )}

        {hasUpgradeSection && (
          <div
            className={`flex flex-col min-h-0 w-full ${zoneFrames ? "" : "flex-1"}`}
            style={zoneFrames ? { flex: "1 1 auto", minHeight: 0 } : undefined}
          >
            <div
              ref={upgradesZoneRef}
              className="zone-upgrades w-full px-3 pt-5 pb-3 relative"
              style={upgradesStyle}
            >
              <ZoneLabel
                dragCallbacks={dividerCallbacks.topDivider}
              >
                Upgrades
              </ZoneLabel>
              <CardGrid
                columns={dims.upgrades.columns}
                cardWidth={upgradesDims.width}
              >
                {available_upgrades.map((upgrade) => (
                  <Card
                    key={upgrade.id}
                    card={upgrade}
                    dimensions={upgradesDims}
                    selected={selectedUpgradeId === upgrade.id}
                    onClick={() =>
                      onUpgradeSelect(
                        selectedUpgradeId === upgrade.id ? null : upgrade.id,
                      )
                    }
                  />
                ))}
              </CardGrid>
            </div>

            {dividerCallbacks.bottomLeftSplitDivider && (
              <ZoneDivider
                orientation="horizontal"
                interactive={!isMobile}
                {...dividerCallbacks.bottomLeftSplitDivider}
              />
            )}

            <div
              ref={poolZoneRef}
                className={`zone-sideboard w-full px-3 pt-5 pb-3 relative min-h-0 ${zoneFrames ? "" : "flex-1"}`}
                style={poolStyle}
              >
                <ZoneLabel
                  dragCallbacks={dividerCallbacks.bottomLeftSplitDivider}
                >
                  Pool
                </ZoneLabel>
              {poolCards.length === 0 ? (
                <div className="flex items-center justify-center min-h-full">
                  <EmptyZoneTile dimensions={poolDims} label="No pool cards" />
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${dims.pool.columns}, ${poolDims.width}px)`,
                    gap: "6px",
                    justifyContent: "center",
                    alignContent: "start",
                    maxWidth: "100%",
                    overflow: "hidden",
                  }}
                >
                  {poolCards.map((card) => (
                    <Card
                      key={card.id}
                      card={card}
                      dimensions={poolDims}
                      upgraded={upgradedCardIds.has(card.id)}
                      appliedUpgrades={getAppliedUpgrades(card.id)}
                      selected={selectedPoolCardId === card.id}
                      onClick={() =>
                        onPoolCardSelect(
                          selectedPoolCardId === card.id ? null : card.id,
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
