/** Reward phase board: shows battle loot, stage-end upgrade choices, and the player's card pool. */
import {
  useCallback,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import { Card } from "../../components/card";
import { CardGrid } from "../../components/common/CardGrid";
import { LayoutResetControl } from "../../components/common/LayoutResetControl";
import { ZoneDivider } from "../../components/common/ZoneDivider";
import { ZoneLabel } from "../../components/common/ZoneLabel";
import {
  THE_VANQUISHER_IMAGE,
  TREASURE_TOKEN_IMAGE,
} from "../../constants/assets";
import { useSavedLayout, type BoardSize } from "../../hooks/useSavedLayout";
import { useResizableLayout } from "../../hooks/useResizableLayout";
import type {
  GameState,
  Card as CardType,
  LastBattleResult,
} from "../../types";
import { rewardLayoutConfig } from "./phaseLayouts";
import { rewardZoneStyles } from "./rewardZoneStyles";

interface RewardPhaseProps {
  gameState: GameState;
  actions: {
    rewardDone: (upgradeId?: string) => void;
  };
  selectedUpgradeId: string | null;
  onUpgradeSelect: (upgradeId: string | null) => void;
  selectedPoolCardId: string | null;
  onPoolCardSelect: (cardId: string | null) => void;
  isMobile?: boolean;
  isDesktop: boolean;
}

type RewardItem = { key: string; card: CardType };

interface AppliedUpgradeCard extends CardType {
  upgrade_target: CardType;
}

function hasUpgradeTarget(card: CardType): card is AppliedUpgradeCard {
  return card.upgrade_target !== null;
}

function EmptyZoneTile({
  dimensions,
  label,
}: {
  dimensions: { width: number; height: number };
  label: string;
}): ReactElement {
  return (
    <div
      className="modal-chrome border gold-border rounded-lg flex items-center justify-center px-3 text-center text-xs text-[var(--ivory-muted)] shadow-md"
      style={{ width: dimensions.width, height: dimensions.height }}
    >
      {label}
    </div>
  );
}

function createRewardCard(options: {
  id: string;
  name: string;
  imageUrl: string;
  typeLine: string;
  oracleText: string | null;
}): CardType {
  return {
    id: options.id,
    name: options.name,
    image_url: options.imageUrl,
    flip_image_url: null,
    png_url: options.imageUrl,
    flip_png_url: null,
    type_line: options.typeLine,
    tokens: [],
    elo: null,
    upgrade_target: null,
    oracle_text: options.oracleText,
    colors: [],
    cmc: 0,
  };
}

function buildRewardItems(
  lastBattleResult: LastBattleResult | null,
): RewardItem[] {
  const items: RewardItem[] = [];
  if (lastBattleResult?.treasures_gained) {
    items.push({
      key: "treasure",
      card: createRewardCard({
        id: "reward:treasure",
        name: `Treasure x${lastBattleResult.treasures_gained}`,
        imageUrl: TREASURE_TOKEN_IMAGE,
        typeLine: "Token Artifact — Treasure",
        oracleText: "Tap, Sacrifice this artifact: Add one mana of any color.",
      }),
    });
  }
  if (lastBattleResult?.vanquisher_gained) {
    items.push({
      key: "vanquisher",
      card: createRewardCard({
        id: "reward:vanquisher",
        name: "The Vanquisher",
        imageUrl: THE_VANQUISHER_IMAGE,
        typeLine: "Artifact",
        oracleText: "Your hand size increases by 1.",
      }),
    });
  }
  if (lastBattleResult?.card_gained) {
    items.push({
      key: lastBattleResult.card_gained.id,
      card: lastBattleResult.card_gained,
    });
  }
  return items;
}

function LootContent({
  rewardItems,
  hasUpgradeSection,
  columns,
  rewardsDims,
  selectedRewardCardId,
  onToggleRewardCard,
}: {
  rewardItems: RewardItem[];
  hasUpgradeSection: boolean;
  columns: number;
  rewardsDims: { width: number; height: number };
  selectedRewardCardId: string | null;
  onToggleRewardCard: (cardId: string) => void;
}): ReactElement {
  if (rewardItems.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-full">
        <EmptyZoneTile dimensions={rewardsDims} label="No loot this round" />
      </div>
    );
  }
  const grid = (
    <CardGrid columns={columns} cardWidth={rewardsDims.width}>
      {rewardItems.map((item) => (
        <Card
          key={item.key}
          card={item.card}
          dimensions={rewardsDims}
          selected={selectedRewardCardId === item.card.id}
          onClick={() => onToggleRewardCard(item.card.id)}
        />
      ))}
    </CardGrid>
  );
  if (hasUpgradeSection) return grid;
  return (
    <div className="flex items-center justify-center min-h-full">{grid}</div>
  );
}

type DividerCallbacks = ReturnType<
  typeof useResizableLayout
>["dividerCallbacks"];

function RewardUpgradesSection({
  availableUpgrades,
  poolCards,
  selectedUpgradeId,
  onUpgradeSelect,
  selectedPoolCardId,
  onPoolCardSelect,
  upgradesDims,
  upgradesColumns,
  poolDims,
  poolColumns,
  upgradesStyle,
  poolStyle,
  cappedZoneAlignment,
  isMobile,
  dividerCallbacks,
  setUpgradesNode,
  setPoolNode,
  upgradedCardIds,
  getAppliedUpgrades,
}: {
  availableUpgrades: CardType[];
  poolCards: CardType[];
  selectedUpgradeId: string | null;
  onUpgradeSelect: (upgradeId: string | null) => void;
  selectedPoolCardId: string | null;
  onPoolCardSelect: (cardId: string | null) => void;
  upgradesDims: { width: number; height: number };
  upgradesColumns: number;
  poolDims: { width: number; height: number };
  poolColumns: number;
  upgradesStyle: CSSProperties;
  poolStyle: CSSProperties;
  cappedZoneAlignment: string;
  isMobile: boolean;
  dividerCallbacks: DividerCallbacks;
  setUpgradesNode: (node: HTMLDivElement | null) => void;
  setPoolNode: (node: HTMLDivElement | null) => void;
  upgradedCardIds: ReadonlySet<string>;
  getAppliedUpgrades: (cardId: string) => CardType[];
}): ReactElement {
  return (
    <div
      className="flex flex-col min-h-0 w-full"
      style={{ flex: "1 1 auto", minHeight: 0 }}
    >
      <div
        ref={setUpgradesNode}
        className={`zone-upgrades w-full px-3 pt-5 pb-3 relative ${cappedZoneAlignment}`}
        style={upgradesStyle}
        data-guide-target="reward-upgrades"
      >
        <ZoneLabel dragCallbacks={dividerCallbacks.topDivider}>
          Upgrades
        </ZoneLabel>
        <CardGrid columns={upgradesColumns} cardWidth={upgradesDims.width}>
          {availableUpgrades.map((upgrade) => (
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
        ref={setPoolNode}
        className={`zone-sideboard w-full px-3 pt-5 pb-3 relative min-h-0 ${cappedZoneAlignment}`}
        style={poolStyle}
      >
        <ZoneLabel dragCallbacks={dividerCallbacks.bottomLeftSplitDivider}>
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
              gridTemplateColumns: `repeat(${poolColumns}, ${poolDims.width}px)`,
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
  );
}

function RewardResetOverlay({
  show,
  stage,
  round,
  persistedLayout,
  onClearConstraints,
  isMobile,
}: {
  show: boolean;
  stage: number;
  round: number;
  persistedLayout: ReturnType<typeof useSavedLayout>["resolution"];
  onClearConstraints: () => void;
  isMobile: boolean;
}): ReactElement | null {
  if (!show || !persistedLayout.canReset) return null;
  return (
    <LayoutResetControl
      phaseLabel="Round Wrap-Up"
      currentStage={stage}
      currentRound={round}
      originStage={persistedLayout.originStage}
      originRound={persistedLayout.originRound}
      isInherited={persistedLayout.source === "inherited"}
      onConfirm={onClearConstraints}
      position={isMobile ? "bottom-right" : "top-right"}
    />
  );
}

function showRewardUpgrades(gameState: GameState): boolean {
  return (
    gameState.use_upgrades &&
    gameState.self_player.is_stage_increasing &&
    gameState.available_upgrades.length > 0
  );
}

function RewardTopDivider({
  show,
  topDivider,
  isMobile,
}: {
  show: boolean;
  topDivider: DividerCallbacks["topDivider"];
  isMobile: boolean;
}): ReactElement | null {
  if (!show || !topDivider) return null;
  return (
    <ZoneDivider
      orientation="horizontal"
      interactive={!isMobile}
      {...topDivider}
    />
  );
}

export function RewardPhase({
  gameState,
  actions,
  selectedUpgradeId,
  onUpgradeSelect,
  selectedPoolCardId,
  onPoolCardSelect,
  isMobile = false,
  isDesktop,
}: RewardPhaseProps): ReactElement {
  void actions;

  const [selectedRewardCardId, setSelectedRewardCardId] = useState<
    string | null
  >(null);

  const { self_player, available_upgrades } = gameState;
  const hasUpgradeSection = showRewardUpgrades(gameState);
  const appliedUpgradesList = self_player.upgrades.filter(hasUpgradeTarget);
  const upgradedCardIds = new Set(
    appliedUpgradesList.map((u) => u.upgrade_target.id),
  );
  const getAppliedUpgrades = (cardId: string): CardType[] =>
    appliedUpgradesList.filter((u) => u.upgrade_target.id === cardId);

  const rewardItems = buildRewardItems(self_player.last_battle_result);
  const poolCards = [...self_player.hand, ...self_player.sideboard];
  const rewardsCount = Math.max(rewardItems.length, 1);
  const poolCount = hasUpgradeSection ? Math.max(poolCards.length, 1) : 0;

  const [measuredBoard, setMeasuredBoard] = useState<BoardSize | null>(null);
  const {
    constraints,
    setConstraints,
    clearConstraints,
    resolution: persistedLayout,
  } = useSavedLayout(
    {
      scopeKey: "phase:reward",
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
    layoutConfig: rewardLayoutConfig({
      rewardCount: rewardsCount,
      hasUpgradeSection,
      upgradeCount: available_upgrades.length,
      poolCount,
      isDesktop,
    }),
    constraints: hasUpgradeSection ? constraints : null,
    onConstraintsChange: setConstraints,
    onConstraintsClear: clearConstraints,
    allowHorizontalResize: false,
  });
  // A saved layout belongs to a board size band, known once the board is measured.
  if (measuredBoard !== containerSize) setMeasuredBoard(containerSize);
  const rewardsRefSetter = zoneRefs.rewards;
  const upgradesRefSetter = zoneRefs.upgrades;
  const poolRefSetter = zoneRefs.pool;
  const setRewardsNode = useCallback(
    (node: HTMLDivElement | null) => rewardsRefSetter(node),
    [rewardsRefSetter],
  );
  const setUpgradesNode = useCallback(
    (node: HTMLDivElement | null) => upgradesRefSetter(node),
    [upgradesRefSetter],
  );
  const setPoolNode = useCallback(
    (node: HTMLDivElement | null) => poolRefSetter(node),
    [poolRefSetter],
  );

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

  const {
    rewards: rewardsStyle,
    upgrades: upgradesStyle,
    pool: poolStyle,
  } = rewardZoneStyles(zoneFrames, hasUpgradeSection);

  // The desktop cap can leave cards shorter than their zone, so center them there as the loot is on its own.
  const cappedZoneAlignment = isDesktop ? "flex flex-col justify-center" : "";

  return (
    <div className="zone-divider-bg flex-1 min-h-0 flex flex-col">
      <div
        ref={containerRef}
        className="relative flex flex-col flex-1 min-h-0"
        style={{ gap: dividerCallbacks.topDivider ? 0 : 2 }}
      >
        <RewardResetOverlay
          show={hasUpgradeSection}
          stage={self_player.stage}
          round={self_player.round}
          persistedLayout={persistedLayout}
          onClearConstraints={clearConstraints}
          isMobile={isMobile}
        />

        <div
          ref={setRewardsNode}
          className="zone-pack w-full px-3 pt-5 pb-3 relative"
          style={rewardsStyle}
          data-guide-target="reward-summary"
        >
          <ZoneLabel>Loot</ZoneLabel>
          <LootContent
            rewardItems={rewardItems}
            hasUpgradeSection={hasUpgradeSection}
            columns={dims.rewards.columns}
            rewardsDims={rewardsDims}
            selectedRewardCardId={selectedRewardCardId}
            onToggleRewardCard={(cardId) =>
              setSelectedRewardCardId((current) =>
                current === cardId ? null : cardId,
              )
            }
          />
        </div>

        <RewardTopDivider
          show={hasUpgradeSection}
          topDivider={dividerCallbacks.topDivider}
          isMobile={isMobile}
        />

        {hasUpgradeSection && (
          <RewardUpgradesSection
            availableUpgrades={available_upgrades}
            poolCards={poolCards}
            selectedUpgradeId={selectedUpgradeId}
            onUpgradeSelect={onUpgradeSelect}
            selectedPoolCardId={selectedPoolCardId}
            onPoolCardSelect={onPoolCardSelect}
            upgradesDims={upgradesDims}
            upgradesColumns={dims.upgrades.columns}
            poolDims={poolDims}
            poolColumns={dims.pool.columns}
            upgradesStyle={upgradesStyle}
            poolStyle={poolStyle}
            cappedZoneAlignment={cappedZoneAlignment}
            isMobile={isMobile}
            dividerCallbacks={dividerCallbacks}
            setUpgradesNode={setUpgradesNode}
            setPoolNode={setPoolNode}
            upgradedCardIds={upgradedCardIds}
            getAppliedUpgrades={getAppliedUpgrades}
          />
        )}
      </div>
    </div>
  );
}
