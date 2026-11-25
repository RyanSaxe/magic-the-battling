import { useCallback, useState, type ReactNode } from "react";
import { useObservedElement } from "../../hooks/pages/useObservedElement";
import type { Card as CardType, PlayerView } from "../../types";
import type { ScoutingTab } from "../../hooks/useGameSurfaces";
import {
  CARD_ASPECT_RATIO,
  bestFitNoClip,
  type ZoneDims,
} from "../../hooks/cardSizeUtils";
import { Card } from "../card";
import { UpgradeStack } from "./UpgradeStack";
import {
  POISON_COUNTER_IMAGE,
  TREASURE_TOKEN_IMAGE,
} from "../../constants/assets";
import { POISON_TO_LOSE } from "../../constants/rules";
import { StandingsRank } from "../common/StandingsRank";
import { getLastResultWord, getPlayerActivity } from "../../utils/format";
import {
  getSidebarPlacementRank,
  getStanding,
  isSidebarLastPlace,
} from "../../utils/playerPlacement";
import {
  SegmentedFilter,
  type SegmentOption,
} from "../dashboard/SegmentedFilter";
import {
  buildAppliedUpgradeMap,
  getAppliedUpgrades,
  getUpgradeDisplayScope,
  getUnappliedUpgrades,
} from "../../utils/upgrades";

interface PlayerDetailPanelProps {
  player: PlayerView;
  /** Everyone in the game, whom the player is ranked among. */
  players: PlayerView[];
  currentPlayer: PlayerView;
  useUpgrades: boolean;
  activeTab: ScoutingTab;
  onTabChange: (tab: ScoutingTab) => void;
  /** Inside a phone's drawer, where scouting takes the list's place, a Back button returns to the list. */
  onBack?: () => void;
}

const DEFAULT_CARD_DIMS: ZoneDims = {
  width: 84,
  height: 118,
  rows: 1,
  columns: 1,
};

function getState(
  player: PlayerView,
  players: PlayerView[],
): { title: string; detail: string; tone?: "ready" | "out" } {
  const standing = getStanding(player);
  const gameOver = players.some(
    ({ phase }) => phase === "winner" || phase === "game_over",
  );
  if (standing === "ghost") {
    return {
      title: "Ghost",
      detail: gameOver
        ? "No longer fights"
        : "Out, fights on with their last build",
    };
  }
  if (standing === "out") {
    return { title: "Out", detail: "No longer fights", tone: "out" };
  }
  if (player.is_puppet) {
    return player.in_sudden_death
      ? {
          title: "Sudden Death",
          detail: "Puppet, loser is eliminated",
          tone: "out",
        }
      : { title: "Puppet", detail: "Replays a past game" };
  }
  const round = `Round ${player.stage}-${player.round}`;
  const activity = getPlayerActivity(player) ?? "Game Over";
  if (player.in_sudden_death) {
    return {
      title: "Sudden Death",
      detail: `${activity} · ${round}`,
      tone: "out",
    };
  }
  const ready = player.phase === "build" && player.build_ready;
  return { title: activity, detail: round, tone: ready ? "ready" : undefined };
}

function countLabel(count: number): string {
  return `${count} card${count === 1 ? "" : "s"}`;
}

/** A token beside its count, so the count doesn't cover the art. */
function TokenCount({
  image,
  count,
  outOf,
  label,
}: {
  image: string;
  count: number;
  outOf?: number;
  label: string;
}): ReactNode {
  return (
    <div className="scouting-cell scouting-token-count">
      <img src={image} alt="" className="scouting-token" />
      <div>
        <div className="scouting-count">
          {count}
          {outOf && <span className="scouting-out-of">/{outOf}</span>}
        </div>
        <div className="scouting-key">{label}</div>
      </div>
    </div>
  );
}

function NextFightCell({
  odds,
  oddsUnknown,
}: {
  odds: number;
  oddsUnknown: boolean;
}): ReactNode {
  return (
    <div className="scouting-cell">
      <div className="scouting-key">Next fight</div>
      {oddsUnknown ? (
        <div className="scouting-value scouting-none">Not known yet</div>
      ) : (
        <div className="scouting-value">
          {Math.round(odds * 100)}%
          <span className="scouting-note">to face you</span>
        </div>
      )}
    </div>
  );
}

function Standings({
  player,
  players,
  isSelf,
  viewerFighting,
}: {
  player: PlayerView;
  players: PlayerView[];
  isSelf: boolean;
  viewerFighting: boolean;
}): ReactNode {
  const { title, detail, tone } = getState(player, players);
  const result = player.last_result;
  const odds = isSelf ? null : player.pairing_probability;
  // The server has no odds during a Fight and sends 0 for everyone, except in Sudden Death, which fixes the pairing.
  const oddsUnknown = viewerFighting && !player.in_sudden_death;
  const hiddenInFight = viewerFighting && !isSelf;

  return (
    <div className={`scouting-standings${isSelf ? " is-self" : ""}`}>
      <div className="scouting-standing">
        <StandingsRank
          className="scouting-rank"
          rank={getSidebarPlacementRank(player, players)}
          isLast={isSidebarLastPlace(player, players)}
        />
        <div className="scouting-state">
          <div className={`scouting-state-title${tone ? ` is-${tone}` : ""}`}>
            {title}
          </div>
          <div className="scouting-state-detail">{detail}</div>
        </div>
      </div>
      {!hiddenInFight && (
        <div className="scouting-pair">
          <TokenCount
            image={POISON_COUNTER_IMAGE}
            count={player.poison}
            outOf={player.poison < POISON_TO_LOSE ? POISON_TO_LOSE : undefined}
            label="Poison"
          />
          <TokenCount
            image={TREASURE_TOKEN_IMAGE}
            count={player.treasures}
            label="Treasure"
          />
        </div>
      )}
      <div className="scouting-pair">
        <div className="scouting-cell">
          <div className="scouting-key">Last fight</div>
          {result ? (
            <div className={`scouting-value player-card-result-${result}`}>
              {getLastResultWord(result)}
            </div>
          ) : (
            <div className="scouting-value scouting-none">None yet</div>
          )}
        </div>
        {odds !== null && (
          <NextFightCell odds={odds} oddsUnknown={oddsUnknown} />
        )}
      </div>
    </div>
  );
}

function SectionHeading({
  title,
  count,
}: {
  title: string;
  count?: number;
}): ReactNode {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--ivory-muted)]">
        {title}
      </span>
      {count !== undefined && (
        <span className="text-[10px] text-[var(--ivory-muted)]">
          {countLabel(count)}
        </span>
      )}
    </div>
  );
}

function AdaptiveCardSection({
  title,
  cards,
  showUpgradeTargets = false,
  companionIds,
  upgradedCardIds,
  appliedUpgradesByCardId,
  emptyText,
  guideTarget,
  maxWidth = 108,
  minWidth = 46,
  minColumns = 1,
  measureKey,
}: {
  title: string;
  cards: CardType[];
  showUpgradeTargets?: boolean;
  companionIds?: Set<string>;
  upgradedCardIds?: Set<string>;
  appliedUpgradesByCardId?: Map<string, CardType[]>;
  emptyText: string;
  guideTarget?: string;
  maxWidth?: number;
  minWidth?: number;
  minColumns?: number;
  measureKey?: string;
}): ReactNode {
  const [dims, setDims] = useState<ZoneDims>(DEFAULT_CARD_DIMS);

  const resolveBestFit = useCallback(
    (width: number, height: number) => {
      const next = bestFitNoClip({
        count: cards.length,
        availWidth: width,
        availHeight: height,
        gap: 8,
        maxWidth,
        preferredMinWidth: minWidth,
      });

      if (cards.length < minColumns || next.columns >= minColumns) {
        return next;
      }

      const columns = Math.min(cards.length, minColumns);
      const rows = Math.ceil(cards.length / columns);
      const widthByColumns = Math.floor(
        (width - 8 * Math.max(0, columns - 1)) / columns,
      );
      const widthByRows = Math.floor(
        (height - 8 * Math.max(0, rows - 1)) / (rows * CARD_ASPECT_RATIO),
      );
      const forcedWidth = Math.max(
        1,
        Math.floor(Math.min(maxWidth, widthByColumns, widthByRows)),
      );

      return {
        width: forcedWidth,
        height: Math.round(forcedWidth * CARD_ASPECT_RATIO),
        rows,
        columns,
      };
    },
    [cards.length, maxWidth, minColumns, minWidth],
  );

  const bodyRef = useObservedElement<HTMLDivElement>(
    (node) => {
      const width = Math.max(node.clientWidth, 0);
      const height = Math.max(node.clientHeight, 0);
      const next = resolveBestFit(width, height);
      setDims((prev) =>
        prev.width === next.width &&
        prev.height === next.height &&
        prev.rows === next.rows &&
        prev.columns === next.columns
          ? prev
          : next,
      );
    },
    {
      deps: [resolveBestFit],
      remeasureFrames: true,
      remeasureKey: measureKey,
    },
  );

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <SectionHeading title={title} count={cards.length} />
      <div className="mb-2 mt-1 border-t gold-divider" />
      <div
        ref={bodyRef}
        className="flex-1 min-h-0 overflow-hidden"
        data-guide-target={guideTarget}
      >
        {cards.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-[color:rgba(212,175,55,0.25)] px-4 text-center text-sm text-[var(--ivory-muted)]">
            {emptyText}
          </div>
        ) : (
          <div
            className="grid h-full content-start justify-center gap-2"
            style={{
              gridTemplateColumns: `repeat(${Math.max(
                1,
                dims.columns,
              )}, ${dims.width}px)`,
            }}
          >
            {cards.map((card) =>
              showUpgradeTargets ? (
                <UpgradeStack
                  key={card.id}
                  upgrade={card}
                  dimensions={{ width: dims.width, height: dims.height }}
                />
              ) : (
                <Card
                  key={card.id}
                  card={card}
                  dimensions={{ width: dims.width, height: dims.height }}
                  isCompanion={companionIds?.has(card.id)}
                  upgraded={upgradedCardIds?.has(card.id)}
                  appliedUpgrades={appliedUpgradesByCardId?.get(card.id)}
                />
              ),
            )}
          </div>
        )}
      </div>
    </section>
  );
}

const DETAIL_TABS: SegmentOption<ScoutingTab>[] = [
  { value: "seen", label: "Seen in Fight" },
  { value: "overview", label: "Overview" },
];

function OverviewUpgradesSection({
  useUpgrades,
  upgrades,
}: {
  useUpgrades: boolean;
  upgrades: CardType[];
}): ReactNode {
  if (!useUpgrades) return null;
  if (upgrades.length === 0) {
    return (
      <section>
        <SectionHeading title="Upgrades" />
        <div className="mt-1 border-t gold-divider" />
        <p className="pt-3 text-center text-sm text-[var(--ivory-muted)]">
          None applied
        </p>
      </section>
    );
  }
  return (
    <AdaptiveCardSection
      title="Upgrades"
      cards={upgrades}
      showUpgradeTargets
      emptyText="No upgrades applied."
      maxWidth={128}
      minWidth={36}
    />
  );
}

/** What a player has shown: the cards seen in their last fight, or an overview of their state. */
export function PlayerDetailPanel({
  player,
  players,
  currentPlayer,
  useUpgrades,
  activeTab,
  onTabChange,
  onBack,
}: PlayerDetailPanelProps): ReactNode {
  const isViewingSelf = player.name === currentPlayer.name;
  const viewerFighting = currentPlayer.phase === "battle";
  const seenHidden = viewerFighting && !isViewingSelf;
  const upgradeDisplayScope = getUpgradeDisplayScope(
    isViewingSelf,
    currentPlayer.phase,
  );
  const appliedUpgrades = getAppliedUpgrades(player.upgrades);
  const pendingUpgrades = getUnappliedUpgrades(currentPlayer.upgrades);
  const allUpgrades = isViewingSelf
    ? [...appliedUpgrades, ...pendingUpgrades]
    : appliedUpgrades;
  const { upgradedCardIds, appliedUpgradesByCardId } = buildAppliedUpgradeMap(
    player.upgrades,
    upgradeDisplayScope,
  );
  const companionIds = new Set(player.command_zone.map((card) => card.id));
  const showOverview = seenHidden || activeTab === "overview";

  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
      data-guide-target="sidebar-revealed-details"
    >
      {onBack && (
        <div className="border-b gold-divider px-4 pb-3 pt-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="btn-secondary shrink-0 rounded-md px-2.5 py-0.5 text-sm"
            >
              &larr; Back
            </button>
            <div className="min-w-0 flex-1 truncate text-base font-medium text-[var(--color-gold)]">
              {player.name}
            </div>
          </div>
        </div>
      )}

      {!seenHidden && (
        <div className="flex justify-center px-4 pb-3 pt-3">
          <SegmentedFilter
            label="Scouting view"
            options={DETAIL_TABS}
            value={activeTab}
            onChange={onTabChange}
          />
        </div>
      )}

      <div
        className={`flex flex-col flex-1 min-h-0 px-4 pb-4 ${seenHidden ? "pt-3" : ""}`}
      >
        {showOverview ? (
          <div className="scouting-overview flex h-full min-h-0 flex-col">
            <Standings
              player={player}
              players={players}
              isSelf={isViewingSelf}
              viewerFighting={viewerFighting}
            />
            <OverviewUpgradesSection
              useUpgrades={useUpgrades}
              upgrades={allUpgrades}
            />
          </div>
        ) : (
          <AdaptiveCardSection
            title="Seen in Fight"
            cards={player.most_recently_revealed_cards}
            companionIds={companionIds}
            upgradedCardIds={upgradedCardIds}
            appliedUpgradesByCardId={appliedUpgradesByCardId}
            emptyText="Nothing was revealed in a fight yet."
            guideTarget="sidebar-seen-in-battle"
            maxWidth={104}
            minColumns={onBack ? 1 : 2}
            measureKey={`${player.name}:${activeTab}`}
          />
        )}
      </div>
    </div>
  );
}
