/**
 * Paginated, filterable, and searchable data hooks for dashboard lists.
 *
 * Centralizes cancellation-safe list loading, stale-filter stamping, retry
 * handling, and pagination without `try ... finally` blocks in TSX components.
 */
import { useCallback, useEffect, useState } from "react";
import {
  discoverCubes,
  followCube,
  getFollowing,
  getMyGames,
  unfollowCube,
  type CubeGamesPage,
  type DiscoverResult,
} from "../../api/client";
import type { GameSummary, PlayMode } from "../../types";
import { unknownToAppError } from "../../utils/appError";
import {
  NO_FOLLOWS,
  findFollow,
  withDiscoverResults,
  withFollow,
  withFollowPending,
  withFollowSettled,
  withFollowingPage,
  withoutFollow,
  type Follows,
} from "../../pages/dashboardState";
import { useAsyncAction } from "../useAsyncResource";
import { useDebouncedValue } from "../useDebouncedValue";

const SEARCH_DELAY_MS = 300;

export interface GameFilters {
  playMode: PlayMode | null;
  useUpgrades: boolean | null;
  mineOnly: boolean;
}

export type LoadGames = (
  filters: GameFilters,
  offset: number,
) => Promise<CubeGamesPage>;

/** A loaded list, stamped with the filters it was loaded for, so a list for older filters never shows. */
interface LoadedHistoryGames {
  filters: GameFilters;
  games: GameSummary[];
  hasMore: boolean;
  totalGames: number;
}

export function useGameHistory(
  loadGames: LoadGames,
  initialFilters: GameFilters,
  onLoadMoreError: () => void,
) {
  const [filters, setFilters] = useState<GameFilters>(initialFilters);
  const [loaded, setLoaded] = useState<LoadedHistoryGames | null>(null);
  const [failedFilters, setFailedFilters] = useState<GameFilters | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadGames(filters, 0)
      .then((page) => {
        if (cancelled) return;
        setLoaded({
          filters,
          games: page.games,
          hasMore: page.has_more,
          totalGames: page.total_games,
        });
      })
      .catch(() => {
        if (!cancelled) setFailedFilters(filters);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, loadGames, attempt]);

  const current = loaded?.filters === filters ? loaded : null;
  const failed = failedFilters === filters && !current;

  const { run: loadMore, pending: loadingMore } = useAsyncAction(
    useCallback(async () => {
      if (!current) return;
      try {
        const page = await loadGames(filters, current.games.length);
        setLoaded((prev) =>
          prev && prev.filters === filters
            ? {
                ...prev,
                games: [...prev.games, ...page.games],
                hasMore: page.has_more,
                totalGames: page.total_games,
              }
            : prev,
        );
      } catch {
        onLoadMoreError();
      }
    }, [current, filters, loadGames, onLoadMoreError]),
  );

  const change = useCallback((update: Partial<GameFilters>) => {
    setFilters((prev) => ({ ...prev, ...update }));
  }, []);

  const retry = useCallback(() => {
    setFailedFilters(null);
    setAttempt((n) => n + 1);
  }, []);

  return {
    filters,
    change,
    current,
    failed,
    retry,
    loadingMore,
    loadMore,
  };
}

/** A list of games, stamped with the search it was loaded for. */
interface LoadedDashboardGames {
  search: string;
  games: GameSummary[];
  hasMore: boolean;
  totalGames: number;
  totalWins: number;
}

export function useDashboardGames(user: unknown, onLoadMoreError: () => void) {
  const [searchText, setSearchText] = useState("");
  const search = useDebouncedValue(searchText.trim(), SEARCH_DELAY_MS);
  const [loaded, setLoaded] = useState<LoadedDashboardGames | null>(null);
  const [failedSearch, setFailedSearch] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getMyGames(0, search)
      .then((data) => {
        if (cancelled) return;
        setLoaded({
          search,
          games: data.games,
          hasMore: data.has_more,
          totalGames: data.total_games,
          totalWins: data.total_wins,
        });
      })
      .catch(() => {
        if (!cancelled) setFailedSearch(search);
      });
    return () => {
      cancelled = true;
    };
  }, [user, search, attempt]);

  const { run: loadMore, pending: loadingMore } = useAsyncAction(
    useCallback(async () => {
      if (!loaded) return;
      try {
        const data = await getMyGames(loaded.games.length, loaded.search);
        setLoaded((prev) =>
          prev && prev.search === loaded.search
            ? {
                ...prev,
                games: [...prev.games, ...data.games],
                hasMore: data.has_more,
              }
            : prev,
        );
      } catch {
        onLoadMoreError();
      }
    }, [loaded, onLoadMoreError]),
  );

  const retry = useCallback(() => {
    setFailedSearch(null);
    setAttempt((n) => n + 1);
  }, []);

  const current = loaded?.search === search ? loaded : null;
  const failed = failedSearch === search && !current;
  // While a new search loads, the last list stays on screen, dimmed, instead of flashing away.
  const shown = current ?? loaded;

  return {
    searchText,
    setSearchText,
    search,
    current,
    shown,
    failed,
    retry,
    loadingMore,
    loadMore,
  };
}

/** A page of cubes, stamped with the search it was loaded for. */
interface LoadedCubes {
  search: string;
  results: DiscoverResult[];
  hasMore: boolean;
  total: number;
}

export function useDashboardDiscover(
  user: unknown,
  onError: (msg: string) => void,
) {
  const [searchText, setSearchText] = useState("");
  const search = useDebouncedValue(searchText.trim(), SEARCH_DELAY_MS);
  const [loaded, setLoaded] = useState<LoadedCubes | null>(null);
  const [failedSearch, setFailedSearch] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [follows, setFollows] = useState<Follows>(NO_FOLLOWS);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getFollowing(0)
      .then((page) => {
        if (!cancelled) setFollows((prev) => withFollowingPage(prev, page, 0));
      })
      .catch(() => {
        // Without the first Following page, unfollowing still finds the follow by paging Following then.
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    discoverCubes(0, search)
      .then((data) => {
        if (cancelled) return;
        setLoaded({
          search,
          results: data.results,
          hasMore: data.has_more,
          total: data.total,
        });
        setFollows((prev) => withDiscoverResults(prev, data.results));
      })
      .catch(() => {
        if (!cancelled) setFailedSearch(search);
      });
    return () => {
      cancelled = true;
    };
  }, [user, search, attempt]);

  const { run: loadMore, pending: loadingMore } = useAsyncAction(
    useCallback(async () => {
      if (!loaded) return;
      try {
        const data = await discoverCubes(loaded.results.length, loaded.search);
        setLoaded((prev) =>
          prev && prev.search === loaded.search
            ? {
                ...prev,
                results: [...prev.results, ...data.results],
                hasMore: data.has_more,
              }
            : prev,
        );
        setFollows((prev) => withDiscoverResults(prev, data.results));
      } catch {
        onError("Failed to load cubes");
      }
    }, [loaded, onError]),
  );

  const loadFollowingPage = useCallback(async (offset: number) => {
    const page = await getFollowing(offset);
    setFollows((prev) => withFollowingPage(prev, page, offset));
    return page;
  }, []);

  const follow = useCallback(
    async (result: DiscoverResult) => {
      setFollows((prev) => withFollowPending(prev, result.cube_id));
      try {
        const record = await followCube(result.cube_id);
        // POST /follow returns the follow without cube stats, and Discover already has them.
        setFollows((prev) =>
          withFollow(prev, {
            ...record,
            game_count: result.game_count,
            human_player_count: result.player_count,
            last_played: result.last_played,
          }),
        );
      } catch (err) {
        setFollows((prev) => withFollowSettled(prev, result.cube_id));
        onError(
          unknownToAppError(err, "follow-cube", "Failed to follow").message,
        );
      }
    },
    [onError],
  );

  const unfollow = useCallback(
    async (cubeId: string) => {
      setFollows((prev) => withFollowPending(prev, cubeId));
      try {
        const record = await findFollow(follows, cubeId, loadFollowingPage);
        // A cube on no Following page is no longer followed, so there is nothing to delete.
        if (record) await unfollowCube(record.id);
        setFollows((prev) => withoutFollow(prev, cubeId));
      } catch {
        setFollows((prev) => withFollowSettled(prev, cubeId));
        onError("Failed to unfollow");
      }
    },
    [follows, loadFollowingPage, onError],
  );

  const retry = useCallback(() => {
    setFailedSearch(null);
    setAttempt((n) => n + 1);
  }, []);

  const current = loaded?.search === search ? loaded : null;
  const failed = failedSearch === search && !current;
  // While a new search loads, the last list stays on screen, dimmed, instead of flashing away.
  const shown = current ?? loaded;

  return {
    searchText,
    setSearchText,
    search,
    current,
    shown,
    failed,
    retry,
    loadingMore,
    loadMore,
    follows,
    follow,
    unfollow,
  };
}
