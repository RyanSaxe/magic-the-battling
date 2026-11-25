import { useCallback, type ReactElement, type ReactNode } from "react";
import { useToast } from "../../contexts";
import {
  useGameHistory,
  type GameFilters,
  type LoadGames,
} from "../../hooks/pages/useDashboardData";
import type { GameSummary, PlayMode } from "../../types";
import {
  countLabel,
  modeLabel,
  upgradesLabel,
} from "../../utils/accountFormat";
import { FilterGroup, FilterMenu } from "./FilterMenu";
import { RecapCard } from "./GameTile";
import { LoadMoreButton } from "./ResultList";
import { NoticeTile } from "./Section";
import { SegmentedFilter } from "./SegmentedFilter";

export type { GameFilters, LoadGames };

type ModeChoice = "all" | PlayMode;
type UpgradesChoice = "all" | "on" | "off";

const UPGRADES_CHOICE: Record<UpgradesChoice, boolean | null> = {
  all: null,
  on: true,
  off: false,
};

function upgradesChoice(useUpgrades: boolean | null): UpgradesChoice {
  if (useUpgrades === null) return "all";
  return useUpgrades ? "on" : "off";
}

/** What the filter button says: "All games", "Deck", "Cube · Upgrades On". */
function shownGames({ playMode, useUpgrades }: GameFilters): string {
  const narrowed: string[] = [];
  if (playMode !== null) narrowed.push(modeLabel(playMode));
  if (useUpgrades !== null) narrowed.push(upgradesLabel(useUpgrades));
  return narrowed.join(" · ") || "All games";
}

function GameHistoryFilters({
  filters,
  onChange,
}: {
  filters: GameFilters;
  onChange: (patch: Partial<GameFilters>) => void;
}): ReactElement {
  return (
    <FilterMenu shown={shownGames(filters)}>
      <FilterGroup title="Mode">
        <SegmentedFilter<ModeChoice>
          label="Mode"
          className="w-full"
          value={filters.playMode ?? "all"}
          onChange={(value) =>
            onChange({ playMode: value === "all" ? null : value })
          }
          options={[
            { value: "all", label: "All" },
            { value: "limited", label: "Cube" },
            { value: "constructed", label: "Deck" },
          ]}
        />
      </FilterGroup>
      <FilterGroup title="Upgrades">
        <SegmentedFilter<UpgradesChoice>
          label="Upgrades"
          className="w-full"
          value={upgradesChoice(filters.useUpgrades)}
          onChange={(value) =>
            onChange({ useUpgrades: UPGRADES_CHOICE[value] })
          }
          options={[
            { value: "all", label: "All" },
            { value: "on", label: "On" },
            { value: "off", label: "Off" },
          ]}
        />
      </FilterGroup>
    </FilterMenu>
  );
}

function GameHistoryBody({
  failed,
  games,
  filters,
  onRetry,
  onClearFilters,
}: {
  failed: boolean;
  games: GameSummary[] | null;
  filters: GameFilters;
  onRetry: () => void;
  onClearFilters: () => void;
}): ReactElement {
  if (failed) {
    return (
      <NoticeTile action={{ label: "Retry", onClick: onRetry }}>
        The games didn&apos;t load.
      </NoticeTile>
    );
  }
  if (!games) {
    return <NoticeTile>Loading...</NoticeTile>;
  }
  if (games.length === 0) {
    const isFiltered =
      filters.playMode !== null || filters.useUpgrades !== null;
    return (
      <NoticeTile
        action={
          isFiltered
            ? {
                label: "Show all modes and upgrades",
                onClick: onClearFilters,
              }
            : undefined
        }
      >
        {filters.mineOnly
          ? "You have no finished games here yet."
          : "No finished games here yet."}
      </NoticeTile>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 min-[1600px]:grid-cols-3">
      {games.map((game) => (
        <RecapCard key={game.game_id} game={game} />
      ))}
    </div>
  );
}

function GameHistoryToolbar({
  scoped,
  title,
  totalGames,
  filters,
  onChange,
}: {
  scoped: boolean;
  title?: (totalGames: number | null) => ReactNode;
  totalGames: number | null;
  filters: GameFilters;
  onChange: (patch: Partial<GameFilters>) => void;
}): ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {scoped && (
        <SegmentedFilter
          label="Whose games"
          variant="heading"
          className="w-full sm:w-auto"
          value={filters.mineOnly ? "mine" : "everyone"}
          onChange={(value) => onChange({ mineOnly: value === "mine" })}
          options={[
            { value: "mine", label: "My Games" },
            { value: "everyone", label: "All Players" },
          ]}
        />
      )}
      {title?.(totalGames)}
      {scoped && totalGames !== null && (
        <span className="text-xs tabular-nums text-[var(--ivory-muted)]">
          {countLabel(totalGames, "game")}
        </span>
      )}
      <GameHistoryFilters filters={filters} onChange={onChange} />
    </div>
  );
}

interface GameHistoryProps {
  loadGames: LoadGames;
  initialFilters: GameFilters;
  /** Offers My Games and All Players. Without it the list is everyone's games. */
  scoped?: boolean;
  /** What the toolbar calls the list, given its total once it has loaded. */
  title?: (totalGames: number | null) => ReactNode;
}

/** A cube's finished games, newest first, with one menu to narrow them by mode and upgrades. */
export function GameHistory({
  loadGames,
  initialFilters,
  scoped = false,
  title,
}: GameHistoryProps): ReactElement {
  const { addToast } = useToast();
  const handleLoadMoreError = useCallback(
    () => addToast("Failed to load games", "error"),
    [addToast],
  );
  const { filters, change, current, failed, retry, loadingMore, loadMore } =
    useGameHistory(loadGames, initialFilters, handleLoadMoreError);

  return (
    <section aria-label="Game history" className="flex flex-col gap-3">
      <GameHistoryToolbar
        scoped={scoped}
        title={title}
        totalGames={current?.totalGames ?? null}
        filters={filters}
        onChange={change}
      />

      <GameHistoryBody
        failed={failed}
        games={current ? current.games : null}
        filters={filters}
        onRetry={retry}
        onClearFilters={() => change({ playMode: null, useUpgrades: null })}
      />

      {current?.hasMore && (
        <LoadMoreButton
          loading={loadingMore}
          onClick={() => {
            void loadMore();
          }}
        />
      )}
    </section>
  );
}
