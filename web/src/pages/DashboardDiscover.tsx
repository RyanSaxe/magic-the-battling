import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../contexts";
import { CubeTile } from "../components/dashboard/CubeTile";
import { DashboardFrame } from "../components/dashboard/DashboardFrame";
import {
  ListHeader,
  LoadMoreButton,
  ResultGrid,
} from "../components/dashboard/ResultList";
import {
  Count,
  NoticeTile,
  SectionCounts,
} from "../components/dashboard/Section";
import { useRequireAuth } from "../hooks/pages/useAuthSession";
import { useDashboardDiscover } from "../hooks/pages/useDashboardData";
import { countLabel, cubeTitle, formatWhen } from "../utils/accountFormat";
import { isFollowPending, isFollowing } from "./dashboardState";

/** The cubes most played on Pitfight, searchable by name or CubeCobra id, to follow or play. */
export function DashboardDiscover() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useRequireAuth("/dashboard/discover");
  const { addToast } = useToast();
  const handleError = useCallback(
    (msg: string) => addToast(msg, "error"),
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
    follows,
    follow,
    unfollow,
  } = useDashboardDiscover(user, handleError);

  if (authLoading || !user) return null;

  return (
    <DashboardFrame>
      <ListHeader
        title="Discover"
        counts={
          current &&
          current.total > 0 && (
            <SectionCounts>
              <Count value={current.total}>
                {" "}
                {search
                  ? current.total === 1
                    ? "matching cube"
                    : "matching cubes"
                  : current.total === 1
                    ? "popular cube"
                    : "popular cubes"}
              </Count>
            </SectionCounts>
          )
        }
        search={{
          label: "Search cubes",
          placeholder: "Cube name or CubeCobra ID",
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
          The cubes didn&apos;t load.
        </NoticeTile>
      ) : !shown ? (
        <NoticeTile>Loading...</NoticeTile>
      ) : shown.results.length === 0 ? (
        shown.search ? (
          <NoticeTile
            action={{ label: "Clear search", onClick: () => setSearchText("") }}
          >
            No cubes match &ldquo;{shown.search}&rdquo;.
          </NoticeTile>
        ) : (
          <NoticeTile
            action={{ label: "New Game", onClick: () => navigate("/play") }}
          >
            No cube has a finished game yet.
          </NoticeTile>
        )
      ) : (
        <ResultGrid busy={!current}>
          {shown.results.map((result) => {
            const following = isFollowing(follows, result.cube_id);
            const pending = isFollowPending(follows, result.cube_id);
            const href = `/cube/${encodeURIComponent(result.cube_id)}`;
            return (
              <CubeTile
                key={result.cube_id}
                title={cubeTitle(result)}
                cubeId={result.cube_id}
                imageUri={result.cube_image_uri}
                badge={following ? "Following" : "Cube"}
                chips={[
                  countLabel(result.player_count, "player"),
                  countLabel(result.game_count, "community game"),
                ]}
                footer={
                  result.last_played
                    ? `Last played ${formatWhen(result.last_played)}`
                    : "No games yet"
                }
                href={href}
                onPlay={() =>
                  navigate(`/play?cubeId=${encodeURIComponent(result.cube_id)}`)
                }
                menuItems={[
                  { label: "View", onSelect: () => navigate(href) },
                  following
                    ? {
                        label: "Unfollow",
                        onSelect: () => unfollow(result.cube_id),
                        danger: true,
                        disabled: pending,
                      }
                    : {
                        label: "Follow",
                        onSelect: () => follow(result),
                        disabled: pending,
                      },
                ]}
              />
            );
          })}
        </ResultGrid>
      )}
      {current?.hasMore && (
        <LoadMoreButton loading={loadingMore} onClick={loadMore} />
      )}
    </DashboardFrame>
  );
}
