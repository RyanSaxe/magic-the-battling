/**
 * Non-board screens rendered by `Game.tsx`: seat recovery / spectator selection,
 * game-ended notices, loading views, and end-of-game elimination/summary panes.
 */
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { getGameStatus } from "../../api/client";
import { getPlayerStateDisplayName } from "../../constants/phases";
import { useAuth } from "../../contexts/authState";
import { usePollingResource } from "../../hooks/useAsyncResource";
import type { SeatState } from "../../hooks/useGameSeat";
import type { SpectateRequestControls } from "../../hooks/useSpectateRequest";
import type { GameStatusResponse, SelfPlayerView } from "../../types";
import {
  getAppErrorMessage,
  unknownToAppError,
  type AppError,
} from "../../utils/appError";
import {
  getRememberedSeat,
  getRememberedSpectatorName,
  rememberSpectatorName,
} from "../../utils/deviceIdentity";
import { HomeButton } from "../common/AppHeader";
import { LoadingScreen } from "../common/LoadingScreen";
import type { LoadingStep } from "../common/loadingSteps";
import { NoticeFrame } from "../common/NoticeFrame";
import { PoisonCard } from "../common/PoisonCard";
import { BusyNotice, StatusNotice } from "../common/StatusNotice";
import { SurfaceCard } from "../common/SurfaceCard";
import { LINK, OPTION_BOX, TEXT_INPUT, FIELD_ERROR } from "../common/styles";
import { GameSummary } from "../GameSummary";

// A seat lost for these reasons has no way back from this tab, so the page offers to watch instead.
const SEAT_GONE_CODES = new Set(["INVALID_SESSION", "PLAYER_NOT_IN_GAME"]);

function subscribeToOtherTabs(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return (): void => window.removeEventListener("storage", onChange);
}

export function GameGoneNotice({ gameId }: { gameId: string }): ReactNode {
  const navigate = useNavigate();
  // Closing a game ends this tab's connection just before that tab forgets the seat, which has no results to show.
  const rememberedName = useSyncExternalStore(
    subscribeToOtherTabs,
    () => getRememberedSeat(gameId)?.name ?? null,
  );
  const newGame = (
    <button
      onClick={() => {
        void navigate("/play");
      }}
      className="btn btn-secondary flex-1 py-2"
    >
      New Game
    </button>
  );
  const home = (
    <button
      onClick={() => {
        void navigate("/");
      }}
      className="btn btn-secondary flex-1 py-2"
    >
      Home
    </button>
  );
  if (rememberedName) {
    return (
      <StatusNotice
        title="This game has ended"
        actions={
          <>
            <button
              onClick={() => {
                void navigate(
                  `/game/${gameId}/share/${encodeURIComponent(rememberedName)}`,
                );
              }}
              className="btn btn-primary w-full py-2"
            >
              See Results
            </button>
            {newGame}
            {home}
          </>
        }
      >
        Your final results as {rememberedName} are on the game&apos;s share
        page.
      </StatusNotice>
    );
  }
  return (
    <StatusNotice
      title="Game not found"
      actions={
        <>
          <button
            onClick={() => {
              void navigate("/play");
            }}
            className="btn btn-primary flex-1 py-2"
          >
            New Game
          </button>
          {home}
        </>
      }
    >
      This game has ended or the link is wrong. Check the link, or start a new
      game.
    </StatusNotice>
  );
}

function SpectateRequestStateView({
  spectate,
  onBackToPlayers,
}: {
  spectate: SpectateRequestControls;
  onBackToPlayers: (leaveRequest: () => void) => void;
}): ReactNode {
  const request = spectate.state;
  if (request.kind === "sending") {
    return (
      <NoticeFrame>
        <BusyNotice label={`Asking to watch ${request.target}...`} />
      </NoticeFrame>
    );
  }

  if (request.kind === "waiting") {
    return (
      <NoticeFrame home={<HomeButton onHome={spectate.cancel} />}>
        <StatusNotice
          title={`Waiting for ${request.target}`}
          actions={
            <button
              onClick={() => onBackToPlayers(spectate.cancel)}
              className="btn btn-secondary flex-1 py-2"
            >
              Cancel
            </button>
          }
        >
          {request.target} has been asked to let you watch. You&apos;ll start
          watching as soon as they allow it.
        </StatusNotice>
      </NoticeFrame>
    );
  }

  if (request.kind === "denied" || request.kind === "expired") {
    const isDenied = request.kind === "denied";
    return (
      <NoticeFrame>
        <StatusNotice
          title={isDenied ? "Request denied" : "Request expired"}
          actions={
            <button
              onClick={() => onBackToPlayers(spectate.dismiss)}
              className="btn btn-secondary flex-1 py-2"
            >
              Try Again
            </button>
          }
        >
          {isDenied
            ? `${request.target} denied your request to watch.`
            : `${request.target} didn't answer your request to watch in time.`}
        </StatusNotice>
      </NoticeFrame>
    );
  }

  return null;
}

function PlayerSelectionAction({
  playerName,
  accountSeatName,
  isWatchable,
  autoApproveSpectators,
  onReconnect,
  onQuickWatch,
  onSelectPlayer,
}: {
  playerName: string;
  accountSeatName: string | null;
  isWatchable: boolean;
  autoApproveSpectators: boolean;
  onReconnect: (name: string) => void;
  onQuickWatch: (name: string) => void;
  onSelectPlayer: (name: string) => void;
}): ReactNode {
  if (playerName === accountSeatName) {
    return (
      <button
        onClick={() => onReconnect(playerName)}
        className="btn btn-primary text-sm py-1 px-3"
      >
        Reconnect
      </button>
    );
  }
  if (!isWatchable) return null;
  return (
    <button
      onClick={() =>
        autoApproveSpectators
          ? onQuickWatch(playerName)
          : onSelectPlayer(playerName)
      }
      className="btn btn-secondary text-sm py-1 px-3"
    >
      Watch
    </button>
  );
}

function WatchRequestForm({
  selectedPlayer,
  spectatorName,
  hasAccount,
  onSpectatorNameChange,
  onBack,
  onSubmit,
}: {
  selectedPlayer: string;
  spectatorName: string;
  hasAccount: boolean;
  onSpectatorNameChange: (name: string) => void;
  onBack: () => void;
  onSubmit: () => void;
}): ReactNode {
  return (
    <div className="space-y-4">
      <p className="text-[var(--ivory-muted)] break-words">
        Request to watch <strong>{selectedPlayer}</strong>&apos;s game
      </p>
      <div>
        <label
          htmlFor="spectator-name-input"
          className="block text-[var(--ivory-muted)] mb-1"
        >
          Your Name
        </label>
        <input
          id="spectator-name-input"
          type="text"
          value={spectatorName}
          onChange={(e) => !hasAccount && onSpectatorNameChange(e.target.value)}
          disabled={hasAccount}
          className={`${TEXT_INPUT} disabled:opacity-50`}
          placeholder="Enter your name"
        />
      </div>
      <div className="flex gap-3">
        <button onClick={onBack} className="btn btn-secondary flex-1 py-2">
          Back
        </button>
        <button
          onClick={onSubmit}
          disabled={!spectatorName.trim()}
          className="btn btn-primary flex-1 py-2"
        >
          Request to Watch
        </button>
      </div>
    </div>
  );
}

function PlayerSelectionList({
  gameId,
  status,
  accountSeatName,
  spectateOnly,
  onReconnect,
  onQuickWatch,
  onSelectPlayer,
  onNavigate,
}: {
  gameId: string;
  status: GameStatusResponse;
  accountSeatName: string | null;
  spectateOnly: boolean;
  onReconnect: (name: string) => void;
  onQuickWatch: (name: string) => void;
  onSelectPlayer: (name: string) => void;
  onNavigate: (path: string) => void;
}): ReactNode {
  const humanPlayers = status.players.filter((p) => !p.is_puppet);
  const watchableNames = new Set(
    humanPlayers
      .filter(
        (p) =>
          p.phase !== "eliminated" &&
          p.phase !== "awaiting_elimination" &&
          p.phase !== "winner" &&
          p.phase !== "game_over",
      )
      .map((p) => p.name),
  );

  return (
    <>
      <p className="text-[var(--ivory-muted)] mb-4">
        {accountSeatName
          ? "Reconnect to your seat or watch a player"
          : "Select a player to watch"}
      </p>
      <div className="space-y-3 mb-6">
        {humanPlayers.map((player) => (
          <div
            key={player.name}
            className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 ${OPTION_BOX} p-3`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <div
                className={`w-2 h-2 shrink-0 rounded-full ${
                  player.is_connected
                    ? "bg-green-500"
                    : "bg-[var(--ivory-faint)]"
                }`}
              />
              <div className="flex min-w-0 flex-wrap items-center gap-x-3">
                <span className="min-w-0 break-words text-white">
                  {player.name}
                </span>
                <span className="min-w-0 break-words text-[var(--ivory-muted)] text-sm">
                  ({getPlayerStateDisplayName(player.phase)})
                </span>
              </div>
            </div>
            <div className="ml-auto flex gap-2 empty:hidden">
              <PlayerSelectionAction
                playerName={player.name}
                accountSeatName={accountSeatName}
                isWatchable={watchableNames.has(player.name)}
                autoApproveSpectators={status.auto_approve_spectators}
                onReconnect={onReconnect}
                onQuickWatch={onQuickWatch}
                onSelectPlayer={onSelectPlayer}
              />
            </div>
          </div>
        ))}
      </div>
      {!spectateOnly && !accountSeatName && (
        <div
          className={`${OPTION_BOX} px-3 py-2.5 mb-4 text-[13px] leading-snug text-[var(--ivory-muted)]`}
        >
          To take your seat back, open this link in the browser you joined from.
          If you played with an account,{" "}
          <button
            onClick={() =>
              onNavigate(
                `/login?returnTo=${encodeURIComponent(`/game/${gameId}/play`)}`,
              )
            }
            className={`${LINK} underline`}
          >
            log in
          </button>
          .
        </div>
      )}
      <button
        onClick={() => onNavigate("/")}
        className="btn btn-secondary w-full py-2"
      >
        Back to Home
      </button>
    </>
  );
}

function resolveSelectionError({
  error,
  spectateState,
  reconnectRefused,
}: {
  error: string;
  spectateState: SpectateRequestControls["state"];
  reconnectRefused?: AppError;
}): string {
  if (error) return error;
  if (spectateState.kind === "choosing" && spectateState.error?.message) {
    return spectateState.error.message;
  }
  if (!reconnectRefused) return "";
  return getAppErrorMessage(
    reconnectRefused,
    "rejoin-game",
    "Could not reconnect.",
  );
}

function StatusErrorView({
  gameId,
  statusError,
  onReload,
  onHome,
}: {
  gameId: string;
  statusError: AppError;
  onReload: () => void;
  onHome: () => void;
}): ReactNode {
  if (statusError.code === "GAME_NOT_FOUND") {
    return (
      <NoticeFrame>
        <GameGoneNotice gameId={gameId} />
      </NoticeFrame>
    );
  }
  return (
    <NoticeFrame>
      <StatusNotice
        title="Can't reach the server"
        actions={
          <>
            <button onClick={onReload} className="btn btn-primary flex-1 py-2">
              Try again
            </button>
            <button onClick={onHome} className="btn btn-secondary flex-1 py-2">
              Home
            </button>
          </>
        }
      >
        {getAppErrorMessage(
          statusError,
          "game-status",
          "The game could not be loaded. Check your connection.",
        )}
      </StatusNotice>
    </NoticeFrame>
  );
}

const ACTIVE_SPECTATE_REQUEST_KINDS = new Set([
  "sending",
  "waiting",
  "denied",
  "expired",
]);

function findAccountSeatName(
  status: GameStatusResponse,
  username: string | undefined,
  spectateOnly: boolean,
): string | null {
  if (spectateOnly || !username) return null;
  const hasSeat = status.players.some(
    (p) => !p.is_puppet && p.name === username,
  );
  return hasSeat ? username : null;
}

function toGameStatusError(rawError: unknown): AppError | null {
  if (!rawError) return null;
  return unknownToAppError(rawError, "game-status", "Failed to load the game");
}

function PlayerSelectionSurface({
  gameId,
  status,
  accountSeatName,
  shownError,
  selectedPlayer,
  spectatorName,
  hasAccount,
  spectateOnly,
  onSpectatorNameChange,
  onSelectPlayer,
  onReconnect,
  onQuickWatch,
  onSubmitWatch,
  onNavigate,
}: {
  gameId: string;
  status: GameStatusResponse;
  accountSeatName: string | null;
  shownError: string;
  selectedPlayer: string | null;
  spectatorName: string;
  hasAccount: boolean;
  spectateOnly: boolean;
  onSpectatorNameChange: (name: string) => void;
  onSelectPlayer: (name: string | null) => void;
  onReconnect: (name: string) => void;
  onQuickWatch: (name: string) => void;
  onSubmitWatch: () => void;
  onNavigate: (path: string) => void;
}): ReactNode {
  return (
    <NoticeFrame>
      <SurfaceCard>
        <h2 className="text-xl font-bold text-white mb-5">
          {accountSeatName ? "Join Game" : "Watch a game"}
        </h2>

        {shownError && (
          <p role="alert" className={`${FIELD_ERROR} mb-4`}>
            {shownError}
          </p>
        )}

        {selectedPlayer ? (
          <WatchRequestForm
            selectedPlayer={selectedPlayer}
            spectatorName={spectatorName}
            hasAccount={hasAccount}
            onSpectatorNameChange={onSpectatorNameChange}
            onBack={() => onSelectPlayer(null)}
            onSubmit={onSubmitWatch}
          />
        ) : (
          <PlayerSelectionList
            gameId={gameId}
            status={status}
            accountSeatName={accountSeatName}
            spectateOnly={spectateOnly}
            onReconnect={onReconnect}
            onQuickWatch={onQuickWatch}
            onSelectPlayer={onSelectPlayer}
            onNavigate={onNavigate}
          />
        )}
      </SurfaceCard>
    </NoticeFrame>
  );
}

export function PlayerSelectionModal({
  gameId,
  reconnectRefused,
  spectate,
  onReconnect,
  spectateOnly = false,
}: {
  gameId: string;
  reconnectRefused?: AppError;
  spectate: SpectateRequestControls;
  onReconnect: (playerName: string) => void;
  spectateOnly?: boolean;
}): ReactNode {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [typedSpectatorName, setTypedSpectatorName] = useState(
    () => getRememberedSpectatorName() ?? "",
  );
  const spectatorName = user ? user.username : typedSpectatorName;
  const [error, setError] = useState("");

  const statusResource = usePollingResource<GameStatusResponse>(
    () => getGameStatus(gameId),
    [gameId],
    {
      intervalMs: 3000,
      maxConsecutiveFailures: 3,
      shouldStopOnError: (err) =>
        unknownToAppError(err, "game-status", "Failed to load the game")
          .code === "GAME_NOT_FOUND",
    },
  );
  const status = statusResource.data ?? null;
  const statusError = toGameStatusError(statusResource.error);

  if (statusError) {
    return (
      <StatusErrorView
        gameId={gameId}
        statusError={statusError}
        onReload={statusResource.reload}
        onHome={() => {
          void navigate("/");
        }}
      />
    );
  }

  if (ACTIVE_SPECTATE_REQUEST_KINDS.has(spectate.state.kind)) {
    return (
      <SpectateRequestStateView
        spectate={spectate}
        onBackToPlayers={(leaveRequest) => {
          leaveRequest();
          setSelectedPlayer(null);
        }}
      />
    );
  }

  if (!status || authLoading) {
    return (
      <NoticeFrame>
        <BusyNotice label="Loading game..." />
      </NoticeFrame>
    );
  }

  const shownError = resolveSelectionError({
    error,
    spectateState: spectate.state,
    reconnectRefused,
  });
  const accountSeatName = findAccountSeatName(
    status,
    user?.username,
    spectateOnly,
  );

  return (
    <PlayerSelectionSurface
      gameId={gameId}
      status={status}
      accountSeatName={accountSeatName}
      shownError={shownError}
      selectedPlayer={selectedPlayer}
      spectatorName={spectatorName}
      hasAccount={Boolean(user)}
      spectateOnly={spectateOnly}
      onSpectatorNameChange={setTypedSpectatorName}
      onSelectPlayer={setSelectedPlayer}
      onReconnect={onReconnect}
      onQuickWatch={(playerName) => {
        setError("");
        void spectate.request(playerName, "Spectator");
      }}
      onSubmitWatch={() => {
        if (!selectedPlayer || !spectatorName.trim()) {
          setError("Please enter your name");
          return;
        }
        setError("");
        if (!user) rememberSpectatorName(spectatorName.trim());
        void spectate.request(selectedPlayer, spectatorName);
      }}
      onNavigate={(path) => {
        void navigate(path);
      }}
    />
  );
}

interface GameSessionGuardProps {
  gameId: string;
  isSpectator: boolean;
  isSpectateMode: boolean;
  isConnected: boolean;
  hasGameState: boolean;
  seat: SeatState;
  spectate: SpectateRequestControls;
  watchingTarget: string | null;
  loadingSteps: LoadingStep[];
  onClaim: (playerName: string) => void;
  onTakeBack: () => void;
}

function SpectateEndedGuard({
  gameId,
  ended,
  onNavigate,
}: {
  gameId: string;
  ended: AppError;
  onNavigate: (path: string) => void;
}): ReactNode {
  return (
    <NoticeFrame>
      {ended.code === "GAME_NOT_FOUND" ? (
        <GameGoneNotice gameId={gameId} />
      ) : (
        <StatusNotice
          title={
            ended.code === "SPECTATE_TARGET_NOT_FOUND"
              ? "Spectate Unavailable"
              : "Game Unavailable"
          }
          actions={
            <>
              <button
                onClick={() => onNavigate("/play")}
                className="btn btn-primary flex-1 py-2"
              >
                New Game
              </button>
              <button
                onClick={() => onNavigate("/")}
                className="btn btn-secondary flex-1 py-2"
              >
                Home
              </button>
            </>
          }
        >
          {getAppErrorMessage(
            ended,
            "game-connection",
            "This game is not available right now.",
          )}
        </StatusNotice>
      )}
    </NoticeFrame>
  );
}

function renderPlayerSeatGuard({
  gameId,
  isSpectateMode,
  seat,
  spectate,
  onClaim,
  onTakeBack,
  onNavigate,
}: {
  gameId: string;
  isSpectateMode: boolean;
  seat: SeatState;
  spectate: SpectateRequestControls;
  onClaim: (playerName: string) => void;
  onTakeBack: () => void;
  onNavigate: (path: string) => void;
}): ReactNode {
  if (seat.kind === "claiming") {
    return (
      <NoticeFrame>
        <BusyNotice label="Reconnecting to your seat..." />
      </NoticeFrame>
    );
  }
  if (seat.kind === "lost") {
    if (seat.error.code === "SEAT_MOVED") {
      return (
        <NoticeFrame>
          <StatusNotice
            title="Open somewhere else"
            actions={
              <>
                <button
                  onClick={onTakeBack}
                  className="btn btn-primary flex-1 py-2"
                >
                  Play here
                </button>
                <button
                  onClick={() => onNavigate("/")}
                  className="btn btn-secondary flex-1 py-2"
                >
                  Home
                </button>
              </>
            }
          >
            This game is now open in another tab or on another device. Only one
            can play your seat at a time.
          </StatusNotice>
        </NoticeFrame>
      );
    }
    if (seat.error.code === "GAME_NOT_FOUND") {
      return (
        <NoticeFrame>
          <GameGoneNotice gameId={gameId} />
        </NoticeFrame>
      );
    }
    if (!SEAT_GONE_CODES.has(seat.error.code)) {
      return (
        <NoticeFrame>
          <StatusNotice
            title="Game Unavailable"
            actions={
              <>
                <button
                  onClick={onTakeBack}
                  className="btn btn-primary flex-1 py-2"
                >
                  Try again
                </button>
                <button
                  onClick={() => onNavigate("/")}
                  className="btn btn-secondary flex-1 py-2"
                >
                  Home
                </button>
              </>
            }
          >
            {getAppErrorMessage(
              seat.error,
              "game-connection",
              "This game is not available right now.",
            )}
          </StatusNotice>
        </NoticeFrame>
      );
    }
  }
  if (seat.kind !== "held" || isSpectateMode) {
    return (
      <PlayerSelectionModal
        gameId={gameId}
        reconnectRefused={seat.kind === "none" ? seat.refused : undefined}
        spectate={spectate}
        onReconnect={onClaim}
        spectateOnly={isSpectateMode}
      />
    );
  }
  return null;
}

export function GameSessionGuard({
  gameId,
  isSpectator,
  isSpectateMode,
  isConnected,
  hasGameState,
  seat,
  spectate,
  watchingTarget,
  loadingSteps,
  onClaim,
  onTakeBack,
}: GameSessionGuardProps): ReactNode {
  const navigate = useNavigate();
  const goTo = (path: string): void => {
    void navigate(path);
  };

  if (spectate.state.kind === "ended") {
    return (
      <SpectateEndedGuard
        gameId={gameId}
        ended={spectate.state.error}
        onNavigate={goTo}
      />
    );
  }

  if (!isSpectator) {
    const seatGuard = renderPlayerSeatGuard({
      gameId,
      isSpectateMode,
      seat,
      spectate,
      onClaim,
      onTakeBack,
      onNavigate: goTo,
    });
    if (seatGuard) return seatGuard;
  }

  if (!hasGameState) {
    if (watchingTarget) {
      // A game still in its lobby sends spectators nothing until it starts.
      return (
        <NoticeFrame>
          <BusyNotice
            label={
              isConnected
                ? `Waiting for ${watchingTarget}'s game to start...`
                : "Connecting..."
            }
          />
        </NoticeFrame>
      );
    }
    return <LoadingScreen steps={loadingSteps} current="Open board" />;
  }

  return null;
}

export function AwaitingEliminationView(): ReactNode {
  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <h2 className="text-2xl text-red-400 mb-4">You Have Been Eliminated</h2>
        <p className="text-[var(--ivory-muted)] mb-6">
          Waiting until all fights are complete to determine if you will compete
          in sudden death to stay alive.
        </p>
        <div className="border-t gold-divider p-4 text-left">
          <h3 className="text-amber-400 font-medium mb-2">
            Sudden Death Rules
          </h3>
          <ul className="text-[var(--ivory-muted)] text-sm space-y-1">
            <li>
              Triggers when 2+ players eliminated with fewer than 2 survivors
            </li>
            <li>2 players with lowest poison fight (ties broken randomly)</li>
            <li>Other eliminated players are out immediately</li>
            <li>Poison resets to 9 for the sudden death fight</li>
            <li>Winner survives, loser is eliminated</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export function OutScreenView({
  outPlace,
  poison,
  onSeeDeck,
}: {
  outPlace: string;
  poison: number;
  onSeeDeck: () => void;
}): ReactNode {
  return (
    <div className="out-felt page-center flex-1 min-h-0 overflow-y-auto flex flex-col items-center p-4 text-center">
      <h2 className="out-title text-[30px] leading-[1.15]">You’re out</h2>
      <p className="mt-2 mb-6 text-[16px] text-[var(--ivory-felt)]">
        {outPlace}
      </p>
      <div className="shrink-0">
        <PoisonCard count={poison} dimensions={{ width: 120, height: 168 }} />
      </div>
      <button onClick={onSeeDeck} className="btn btn-secondary shrink-0 mt-7">
        See your deck
      </button>
    </div>
  );
}

export function GameEndSummary({
  player,
  useUpgrades,
  isMobile,
  currentPhase,
}: {
  player: SelfPlayerView;
  useUpgrades: boolean;
  isMobile: boolean;
  currentPhase: string;
}): ReactNode {
  return (
    <GameSummary
      player={player}
      useUpgrades={useUpgrades}
      enableResize
      isMobile={isMobile}
      layoutStateKey={`${currentPhase}:${player.stage}:${player.round}`}
      showLayoutReset
    />
  );
}
