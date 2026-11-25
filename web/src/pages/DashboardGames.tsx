import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
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
import { useRequireAuth } from "../hooks/pages/useAuthSession";
import { useDashboardGames } from "../hooks/pages/useDashboardData";

/** Every finished game the player has played, newest first, searchable by cube, preset, opponent or card. */
export function DashboardGames() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useRequireAuth("/dashboard/games");
  const { addToast } = useToast();
  const handleLoadMoreError = useCallback(
    () => addToast("Failed to load games", "error"),
    [addToast],
  );
  const {
    searchText,
    setSearchText,
    search,
    current,
    shown,
    failed,
    retry,
    loadingMore,
    loadMore,
  } = useDashboardGames(user, handleLoadMoreError);

  if (authLoading || !user) return null;

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
            onClick: retry,
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
