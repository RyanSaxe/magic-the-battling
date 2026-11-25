import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/authState";
import { useToast } from "../contexts";
import { DashboardFrame } from "../components/dashboard/DashboardFrame";
import { GameTile } from "../components/dashboard/GameTile";
import {
  ListHeader,
  LoadMoreButton,
  ResultGrid,
} from "../components/dashboard/ResultList";
import {
  Count,
  NoticeTile,
  SectionCounts,
  WinsCount,
} from "../components/dashboard/Section";
import { getMyGames } from "../api/client";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import type { GameSummary } from "../types";

const SEARCH_DELAY_MS = 300;

/** A list of games, stamped with the search it was loaded for. */
interface LoadedGames {
  search: string;
  games: GameSummary[];
  hasMore: boolean;
  totalGames: number;
  totalWins: number;
}

/** Every finished game the player has played, newest first, searchable by cube, preset, opponent or card. */
export function DashboardGames() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { addToast } = useToast();
  const [searchText, setSearchText] = useState("");
  const search = useDebouncedValue(searchText.trim(), SEARCH_DELAY_MS);
  const [loaded, setLoaded] = useState<LoadedGames | null>(null);
  const [failedSearch, setFailedSearch] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!authLoading && !user)
      navigate("/login?returnTo=/dashboard/games", { replace: true });
  }, [authLoading, user, navigate]);

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

  const loadMore = async () => {
    if (!loaded) return;
    setLoadingMore(true);
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
      addToast("Failed to load games", "error");
    } finally {
      setLoadingMore(false);
    }
  };

  if (authLoading || !user) return null;

  const current = loaded?.search === search ? loaded : null;
  const failed = failedSearch === search && !current;
  // While a new search loads, the last list stays on screen, dimmed, instead of flashing away.
  const shown = current ?? loaded;

  return (
    <DashboardFrame>
      <ListHeader
        title="Games"
        counts={
          current && (
            <SectionCounts className="flex items-baseline gap-4">
              <Count value={current.totalGames}>
                {" "}
                {search ? "matching " : ""}
                {current.totalGames === 1 ? "game" : "games"}
              </Count>
              <WinsCount wins={current.totalWins} games={current.totalGames} />
            </SectionCounts>
          )
        }
        search={{
          label: "Search games",
          placeholder: "Cube, preset, player or card",
          value: searchText,
          onChange: setSearchText,
        }}
      />
      {failed ? (
        <NoticeTile
          action={{
            label: "Retry",
            onClick: () => {
              setFailedSearch(null);
              setAttempt((n) => n + 1);
            },
          }}
        >
          Your games didn&apos;t load.
        </NoticeTile>
      ) : !shown ? (
        <NoticeTile>Loading...</NoticeTile>
      ) : shown.games.length === 0 ? (
        shown.search ? (
          <NoticeTile
            action={{ label: "Clear search", onClick: () => setSearchText("") }}
          >
            No games match &ldquo;{shown.search}&rdquo;.
          </NoticeTile>
        ) : (
          <NoticeTile
            action={{ label: "New Game", onClick: () => navigate("/play") }}
          >
            You haven&apos;t finished a game yet.
          </NoticeTile>
        )
      ) : (
        <ResultGrid busy={!current}>
          {shown.games.map((game) => (
            <GameTile key={game.game_id} game={game} />
          ))}
        </ResultGrid>
      )}
      {current?.hasMore && (
        <LoadMoreButton loading={loadingMore} onClick={loadMore} />
      )}
    </DashboardFrame>
  );
}
