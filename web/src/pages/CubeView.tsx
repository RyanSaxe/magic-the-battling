import { useCallback, useState, type ReactElement } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/authState";
import { useToast } from "../contexts";
import { AddCubeModal } from "../components/dashboard/AddCubeModal";
import { DashboardFrame } from "../components/dashboard/DashboardFrame";
import {
  DetailHero,
  HeroLink,
  type HeroAction,
} from "../components/dashboard/DetailHero";
import {
  GameHistory,
  type LoadGames,
} from "../components/dashboard/GameHistory";
import {
  Breadcrumb,
  NoticeTile,
  SectionTitle,
} from "../components/dashboard/Section";
import {
  followCube,
  getCubeGames,
  getCubeSummary,
  unfollowCube,
} from "../api/client";
import { useAsyncAction } from "../hooks/useAsyncResource";
import { useFirstLoad } from "../hooks/useFirstLoad";
import type { CubeSummary } from "../types";
import { formatWhen, modeLabel, upgradesLabel } from "../utils/accountFormat";
import { unknownToAppError } from "../utils/appError";

const ALL_GAMES = { playMode: null, useUpgrades: null, mineOnly: false };

function renderCommunityGamesTitle(total: number | null): ReactElement {
  return (
    <SectionTitle>
      Community Game History{total === null ? "" : ` (${total})`}
    </SectionTitle>
  );
}

function buildCubeHeroStats(
  summary: CubeSummary | null,
): Array<{ label: string; value: number | string }> {
  const setup = summary?.popular_setup;
  return [
    { label: "Games Played", value: summary?.game_count ?? "—" },
    { label: "Players", value: summary?.human_player_count ?? "—" },
    {
      label: "Last Played",
      value: summary?.last_played ? formatWhen(summary.last_played) : "—",
    },
    {
      label: "Popular Setup",
      value: setup
        ? `${modeLabel(setup.play_mode)} · ${upgradesLabel(setup.use_upgrades)}`
        : "—",
    },
  ];
}

function buildCubeHeroActions(options: {
  canAct: boolean;
  isFollowing: boolean;
  changingFollow: boolean;
  onToggleFollow: () => void;
  onSave: () => void;
}): HeroAction[] {
  if (!options.canAct) return [];
  return [
    {
      label: options.isFollowing ? "✓ Following" : "Follow",
      onClick: options.onToggleFollow,
      disabled: options.changingFollow,
      pressed: options.isFollowing,
    },
    { label: "Save", onClick: options.onSave },
  ];
}

async function runCubeFollowToggle(
  cubeId: string,
  summary: CubeSummary,
): Promise<CubeSummary> {
  if (summary.follow_id === null) {
    const follow = await followCube(cubeId);
    return { ...summary, is_following: true, follow_id: follow.id };
  }
  await unfollowCube(summary.follow_id);
  return { ...summary, is_following: false, follow_id: null };
}

function CubeSaveModal({
  open,
  cubeId,
  onClose,
  onSaved,
  addToast,
}: {
  open: boolean;
  cubeId: string;
  onClose: () => void;
  onSaved: () => void;
  addToast: (message: string, type?: "error" | "info" | "warning") => void;
}): ReactElement | null {
  if (!open) return null;
  return (
    <AddCubeModal
      initialCubeId={cubeId}
      onClose={onClose}
      onCreated={onSaved}
      addToast={addToast}
    />
  );
}

export function CubeView(): ReactElement {
  const { cubeId = "" } = useParams<{ cubeId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { addToast } = useToast();
  const [showSaveModal, setShowSaveModal] = useState(false);
  // Waits for sign-in to be known, since the summary says whether this player follows the cube.
  const loadSummary = useCallback(() => getCubeSummary(cubeId), [cubeId]);
  const summaryLoad = useFirstLoad(loadSummary, !authLoading);
  const summary =
    summaryLoad.state.status === "loaded" ? summaryLoad.state.value : null;

  const loadGames = useCallback<LoadGames>(
    (filters, offset) =>
      getCubeGames(cubeId, {
        offset,
        playMode: filters.playMode ?? undefined,
        useUpgrades: filters.useUpgrades ?? undefined,
      }),
    [cubeId],
  );

  const { run: toggleFollow, pending: changingFollow } = useAsyncAction(
    useCallback(async () => {
      if (!summary) return;
      try {
        const updated = await runCubeFollowToggle(cubeId, summary);
        summaryLoad.update({ status: "loaded", value: updated });
      } catch (err) {
        addToast(
          unknownToAppError(err, "follow-cube", "Failed to change the follow")
            .message,
          "error",
        );
      }
    }, [summary, summaryLoad, cubeId, addToast]),
  );

  const title = summary?.cube_name ?? cubeId;
  const actions = buildCubeHeroActions({
    canAct: Boolean(user && summary),
    isFollowing: Boolean(summary?.is_following),
    changingFollow,
    onToggleFollow: () => {
      void toggleFollow();
    },
    onSave: () => setShowSaveModal(true),
  });
  const loadFailed = summaryLoad.state.status === "failed";

  return (
    <>
      <DashboardFrame>
        {user && (
          <Breadcrumb
            to="/dashboard/discover"
            label="Discover Cubes"
            current={title}
          />
        )}
        <DetailHero
          imageUri={summary?.cube_image_uri}
          badge={{ label: "Community Cube", tone: "Cube" }}
          title={title}
          links={
            <>
              <span>
                CubeCobra ID:{" "}
                <strong className="font-semibold text-[var(--ivory)]">
                  {cubeId}
                </strong>
              </span>
              <HeroLink
                href={`https://cubecobra.com/cube/list/${encodeURIComponent(cubeId)}`}
              >
                View Full Card List on CubeCobra ↗
              </HeroLink>
            </>
          }
          actions={actions}
          play={{
            label: "Play",
            onClick: () => {
              void navigate(`/play?cubeId=${encodeURIComponent(cubeId)}`);
            },
          }}
          stats={buildCubeHeroStats(summary)}
        />
        {loadFailed && (
          <NoticeTile action={{ label: "Retry", onClick: summaryLoad.retry }}>
            This cube&apos;s details didn&apos;t load.
          </NoticeTile>
        )}
        <GameHistory
          loadGames={loadGames}
          initialFilters={ALL_GAMES}
          title={renderCommunityGamesTitle}
        />
      </DashboardFrame>

      <CubeSaveModal
        open={showSaveModal}
        cubeId={cubeId}
        onClose={() => setShowSaveModal(false)}
        onSaved={() => {
          setShowSaveModal(false);
          addToast("Saved to Cubes & Decks", "info");
        }}
        addToast={addToast}
      />
    </>
  );
}
