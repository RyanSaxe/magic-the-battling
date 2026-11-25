import { useCallback, type ReactElement } from "react";
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
import { isFollowPending, isFollowing, type Follows } from "./dashboardState";

type DiscoverState = ReturnType<typeof useDashboardDiscover>;
type DiscoverShown = NonNullable<DiscoverState["shown"]>;
type DiscoverResult = DiscoverShown["results"][number];

function discoverCountLabel(search: string, total: number): string {
  const adjective = search ? "matching" : "popular";
  const noun = total === 1 ? "cube" : "cubes";
  return `${adjective} ${noun}`;
}

function DiscoverResults({
  failed,
  shown,
  busy,
  follows,
  onRetry,
  onClearSearch,
  onNavigate,
  onFollow,
  onUnfollow,
}: {
  failed: boolean;
  shown: DiscoverShown | null;
  busy: boolean;
  follows: Follows;
  onRetry: () => void;
  onClearSearch: () => void;
  onNavigate: (to: string) => void;
  onFollow: (result: DiscoverResult) => void;
  onUnfollow: (cubeId: string) => void;
}): ReactElement {
  if (failed) {
    return (
      <NoticeTile action={{ label: "Retry", onClick: onRetry }}>
        The cubes didn&apos;t load.
      </NoticeTile>
    );
  }
  if (!shown) {
    return <NoticeTile>Loading...</NoticeTile>;
  }
  if (shown.results.length === 0) {
    if (shown.search) {
      return (
        <NoticeTile action={{ label: "Clear search", onClick: onClearSearch }}>
          No cubes match &ldquo;{shown.search}&rdquo;.
        </NoticeTile>
      );
    }
    return (
      <NoticeTile
        action={{ label: "New Game", onClick: () => onNavigate("/play") }}
      >
        No cube has a finished game yet.
      </NoticeTile>
    );
  }

  return (
    <ResultGrid busy={busy}>
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
              onNavigate(`/play?cubeId=${encodeURIComponent(result.cube_id)}`)
            }
            menuItems={[
              {
                label: "View",
                onSelect: (): void => onNavigate(href),
              },
              following
                ? {
                    label: "Unfollow",
                    onSelect: (): void => onUnfollow(result.cube_id),
                    danger: true,
                    disabled: pending,
                  }
                : {
                    label: "Follow",
                    onSelect: (): void => onFollow(result),
                    disabled: pending,
                  },
            ]}
          />
        );
      })}
    </ResultGrid>
  );
}

/** The cubes most played on Pitfight, searchable by name or CubeCobra id, to follow or play. */
export function DashboardDiscover(): ReactElement | null {
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
                {discoverCountLabel(search, current.total)}
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
      <DiscoverResults
        failed={failed}
        shown={shown}
        busy={!current}
        follows={follows}
        onRetry={retry}
        onClearSearch={() => setSearchText("")}
        onNavigate={(to) => {
          void navigate(to);
        }}
        onFollow={(result) => {
          void follow(result);
        }}
        onUnfollow={(cubeId) => {
          void unfollow(cubeId);
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
