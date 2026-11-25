import { useCallback, type ReactElement } from "react";
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

type DashboardGamesShown = NonNullable<
  ReturnType<typeof useDashboardGames>["shown"]
>;

function GamesResults({
  failed,
  shown,
  busy,
  onRetry,
  onClearSearch,
  onNewGame,
}: {
  failed: boolean;
  shown: DashboardGamesShown | null;
  busy: boolean;
  onRetry: () => void;
  onClearSearch: () => void;
  onNewGame: () => void;
}): ReactElement {
  if (failed) {
    return (
      <NoticeTile action={{ label: "Retry", onClick: onRetry }}>
        Your games didn&apos;t load.
      </NoticeTile>
    );
  }
  if (!shown) {
    return <NoticeTile>Loading...</NoticeTile>;
  }
  if (shown.games.length === 0) {
    if (shown.search) {
      return (
        <NoticeTile action={{ label: "Clear search", onClick: onClearSearch }}>
          No games match &ldquo;{shown.search}&rdquo;.
        </NoticeTile>
      );
    }
    return (
      <NoticeTile action={{ label: "New Game", onClick: onNewGame }}>
        You haven&apos;t finished a game yet.
      </NoticeTile>
    );
  }
  return (
    <ResultGrid busy={busy}>
      {shown.games.map((game) => (
        <GameTile key={game.game_id} game={game} />
      ))}
    </ResultGrid>
  );
}

/** Every finished game the player has played, newest first, searchable by cube, preset, opponent or card. */
export function DashboardGames(): ReactElement | null {
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
      <GamesResults
        failed={failed}
        shown={shown}
        busy={!current}
        onRetry={retry}
        onClearSearch={() => setSearchText("")}
        onNewGame={() => {
          void navigate("/play");
        }}
      />
      {current?.hasMore && (
        <LoadMoreButton
          loading={loadingMore}
          onClick={() => {
            void loadMore();
          }}
        />
      )}
    </DashboardFrame>
  );
}
