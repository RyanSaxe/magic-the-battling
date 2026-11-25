import { useState, type ReactElement, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { joinGame } from "../../api/client";
import { useAuth } from "../../contexts/authState";
import { useLobbyJoin } from "../../hooks/pages/useLobbyJoin";
import type { SeatGrant, SeatState } from "../../hooks/useGameSeat";
import type { LobbyState } from "../../types";
import {
  type AppError,
  getAppErrorMessage,
  unknownToAppError,
} from "../../utils/appError";
import {
  getRememberedGuestName,
  getRememberedSeat,
  rememberGuestName,
} from "../../utils/deviceIdentity";
import { BusyNotice, StatusNotice } from "../common/StatusNotice";
import { FIELD_LABEL, TEXT_INPUT } from "../common/styles";

/** What a lobby link shows a tab that has no live seat in the lobby, by the state of its seat. */
export function LobbySeatNotice({
  gameId,
  seat,
  onJoined,
  onClaim,
  onTakeBack,
}: {
  gameId: string;
  seat: Exclude<SeatState, { kind: "held" }>;
  onJoined: (grant: SeatGrant, playerName: string, joinCode: string) => void;
  onClaim: (playerName: string) => void;
  onTakeBack: () => void;
}): ReactElement {
  const navigate = useNavigate();
  const goToPlay = (
    <button
      onClick={() => {
        void navigate("/play");
      }}
      className="btn btn-primary flex-1 py-2"
    >
      Go to Play
    </button>
  );
  const goHome = (
    <button
      onClick={() => {
        void navigate("/");
      }}
      className="btn btn-secondary flex-1 py-2"
    >
      Home
    </button>
  );

  if (seat.kind === "claiming") {
    return <BusyNotice label="Reconnecting to your seat..." />;
  }
  if (seat.kind === "none") {
    return (
      <JoinLobbyNotice
        gameId={gameId}
        onJoined={onJoined}
        onClaim={onClaim}
        refused={seat.refused}
      />
    );
  }

  const { code } = seat.error;
  if (code === "KICKED") {
    return (
      <StatusNotice
        title="Removed from the lobby"
        actions={
          <>
            {goToPlay}
            {goHome}
          </>
        }
      >
        The host removed you from this lobby. You can join another game or start
        your own.
      </StatusNotice>
    );
  }
  if (code === "SEAT_MOVED") {
    return (
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
            {goHome}
          </>
        }
      >
        This lobby is now open in another tab or on another device. Only one can
        hold your seat at a time.
      </StatusNotice>
    );
  }
  if (code === "PLAYER_NOT_IN_GAME") {
    return (
      <JoinLobbyNotice
        gameId={gameId}
        onJoined={onJoined}
        onClaim={onClaim}
        seatReleased
      />
    );
  }
  if (code === "GAME_NOT_FOUND") {
    return (
      <StatusNotice
        title="Lobby not found"
        actions={
          <>
            {goToPlay}
            {goHome}
          </>
        }
      >
        This lobby has ended or the link is wrong. Check the link, or start a
        new game.
      </StatusNotice>
    );
  }
  return (
    <StatusNotice
      title="Lobby Unavailable"
      actions={
        <>
          <button onClick={onTakeBack} className="btn btn-primary flex-1 py-2">
            Try again
          </button>
          {goHome}
        </>
      }
    >
      {getAppErrorMessage(
        seat.error,
        "lobby-connection",
        "This lobby is not available right now.",
      )}
    </StatusNotice>
  );
}

function initialJoinError(refused?: AppError): string {
  if (!refused) return "";
  return getAppErrorMessage(
    refused,
    "rejoin-game",
    "Could not reconnect to that seat.",
  );
}

function resolveDefaultName(
  typedName: string | null,
  rememberedName: string | null,
  user: { username: string } | null,
): string {
  return (
    typedName ??
    rememberedName ??
    user?.username ??
    getRememberedGuestName() ??
    ""
  );
}

function AccountSeatNotice({
  seatName,
  onClaim,
  goHome,
}: {
  seatName: string;
  onClaim: (playerName: string) => void;
  goHome: ReactNode;
}): ReactElement {
  return (
    <StatusNotice
      title="Your seat is waiting"
      actions={
        <>
          <button
            onClick={() => onClaim(seatName)}
            className="btn btn-primary flex-1 py-2"
          >
            Reconnect as {seatName}
          </button>
          {goHome}
        </>
      }
    >
      You joined this lobby as {seatName} with your account.
    </StatusNotice>
  );
}

function ReleasedSeatNotice({
  rememberedName,
  joining,
  error,
  onJoin,
  goHome,
}: {
  rememberedName: string;
  joining: boolean;
  error: string;
  onJoin: () => void;
  goHome: ReactNode;
}): ReactElement {
  return (
    <StatusNotice
      title="Your seat was released"
      actions={
        <>
          <button
            onClick={onJoin}
            disabled={joining}
            className="btn btn-primary flex-1 py-2"
          >
            {joining ? "Joining..." : `Join again as ${rememberedName}`}
          </button>
          {goHome}
        </>
      }
    >
      You were away from this lobby for more than 10 minutes, so your seat was
      given up. The lobby is still open.
      {error && <p className="mt-2 text-red-300">{error}</p>}
    </StatusNotice>
  );
}

function JoinLobbyForm({
  lobby,
  playerName,
  joining,
  error,
  onNameChange,
  onJoin,
  goHome,
}: {
  lobby: LobbyState;
  playerName: string;
  joining: boolean;
  error: string;
  onNameChange: (value: string) => void;
  onJoin: () => void;
  goHome: ReactNode;
}): ReactElement {
  const host = lobby.players.find((p) => p.is_host)?.name;
  const occupied = lobby.players.length + lobby.puppet_count;
  return (
    <StatusNotice
      title="Join this lobby"
      actions={
        <>
          <button
            onClick={onJoin}
            disabled={joining}
            className="btn btn-primary flex-1 py-2"
          >
            {joining ? "Joining..." : "Join Lobby"}
          </button>
          {goHome}
        </>
      }
    >
      <p>
        {host ? `${host}'s lobby · ` : ""}
        {occupied} of {lobby.target_player_count} players · code{" "}
        <span className="font-mono text-amber-400">{lobby.join_code}</span>
      </p>
      <label htmlFor="lobby-join-name" className={`${FIELD_LABEL} mt-4`}>
        Your Name
      </label>
      <input
        id="lobby-join-name"
        type="text"
        value={playerName}
        onChange={(e) => onNameChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onJoin();
        }}
        maxLength={32}
        className={TEXT_INPUT}
      />
      {error && <p className="mt-2 text-red-300">{error}</p>}
    </StatusNotice>
  );
}

function findAccountSeat(
  lobby: LobbyState,
  user: { username: string } | null,
  refused?: AppError,
): string | undefined {
  if (!user || refused) return undefined;
  return lobby.players.find((p) => p.name === user.username)?.name;
}

function JoinLobbyNotice({
  gameId,
  onJoined,
  onClaim,
  seatReleased = false,
  refused,
}: {
  gameId: string;
  onJoined: (grant: SeatGrant, playerName: string, joinCode: string) => void;
  onClaim: (playerName: string) => void;
  seatReleased?: boolean;
  refused?: AppError;
}): ReactElement {
  const navigate = useNavigate();
  const { user } = useAuth();
  const rememberedName = getRememberedSeat(gameId)?.name ?? null;
  const lobby = useLobbyJoin(gameId);
  const [typedName, setTypedName] = useState<string | null>(null);
  // Derived, as the login check can finish after the first render and an account's name beats a guest's.
  const playerName = resolveDefaultName(typedName, rememberedName, user);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState(() => initialJoinError(refused));

  if (lobby === null || lobby === "missing") {
    return <BusyNotice label="Loading lobby..." />;
  }

  const join = async (name: string): Promise<void> => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please enter your name");
      return;
    }
    setJoining(true);
    setError("");
    try {
      const grant = await joinGame(lobby.join_code, trimmed);
      if (!user) rememberGuestName(trimmed);
      onJoined(grant, trimmed, lobby.join_code);
    } catch (err) {
      setError(
        getAppErrorMessage(
          unknownToAppError(err, "join-game", "Failed to join"),
          "join-game",
          "Failed to join",
        ),
      );
      setJoining(false);
    }
  };

  const accountSeatName = findAccountSeat(lobby, user, refused);
  const goHome = (
    <button
      onClick={() => {
        void navigate("/");
      }}
      className="btn btn-secondary flex-1 py-2"
    >
      Home
    </button>
  );

  if (accountSeatName) {
    return (
      <AccountSeatNotice
        seatName={accountSeatName}
        onClaim={onClaim}
        goHome={goHome}
      />
    );
  }

  if (seatReleased && rememberedName) {
    return (
      <ReleasedSeatNotice
        rememberedName={rememberedName}
        joining={joining}
        error={error}
        onJoin={() => {
          void join(rememberedName);
        }}
        goHome={goHome}
      />
    );
  }

  return (
    <JoinLobbyForm
      lobby={lobby}
      playerName={playerName}
      joining={joining}
      error={error}
      onNameChange={setTypedName}
      onJoin={() => {
        void join(playerName);
      }}
      goHome={goHome}
    />
  );
}
