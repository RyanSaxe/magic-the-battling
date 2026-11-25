import { useCallback, useId, useRef, useState, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/authState";
import { useAsyncAction } from "../../hooks/useAsyncResource";
import { unknownToAppError } from "../../utils/appError";
import {
  getRememberedGuestName,
  rememberGuestName,
} from "../../utils/deviceIdentity";
import { joinLobbyByCode } from "../../utils/joinLobby";
import { FIELD_ERROR, FIELD_LABEL, TEXT_INPUT } from "../common/styles";
import { Dialog } from "../common/Dialog";

interface JoinGameModalProps {
  onClose: () => void;
}

type JoinFieldError = { field: "name" | "code"; message: string };

export function JoinGameModal({ onClose }: JoinGameModalProps): ReactElement {
  const navigate = useNavigate();
  const { user } = useAuth();
  const nameId = useId();
  const codeId = useId();
  const focusedRef = useRef(false);

  const [manualName, setManualName] = useState(
    () => getRememberedGuestName() ?? "",
  );
  const playerName = user ? user.username : manualName;
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<JoinFieldError | null>(null);

  const { run: submitJoin, pending: loading } = useAsyncAction(
    useCallback(
      async (name: string, code: string) => {
        setError(null);
        try {
          const lobbyPath = await joinLobbyByCode(code, name);
          if (!user) rememberGuestName(name);
          void navigate(lobbyPath);
        } catch (err) {
          const appError = unknownToAppError(
            err,
            "join-game",
            "Failed to join game",
          );
          setError({
            field: appError.code === "PLAYER_NAME_TAKEN" ? "name" : "code",
            message: appError.message,
          });
        }
      },
      [user, navigate],
    ),
  );

  const handleSubmit = (): void => {
    const name = playerName.trim();
    const code = joinCode.trim();
    if (!name) {
      setError({ field: "name", message: "Please enter your name" });
      return;
    }
    if (!code) {
      setError({ field: "code", message: "Please enter a join code" });
      return;
    }
    void submitJoin(name, code);
  };

  return (
    <Dialog title="Join Game" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label htmlFor={nameId} className={FIELD_LABEL}>
            Your Name
          </label>
          <input
            id={nameId}
            type="text"
            value={playerName}
            onChange={(e) => {
              if (!user) setManualName(e.target.value);
              setError(null);
            }}
            disabled={!!user}
            className={`${TEXT_INPUT} disabled:opacity-50`}
            placeholder="Enter your name"
            ref={(el): void => {
              if (el && !user && !focusedRef.current) {
                focusedRef.current = true;
                el.focus();
              }
            }}
          />
          {error?.field === "name" && (
            <p role="alert" className={FIELD_ERROR}>
              {error.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor={codeId} className={FIELD_LABEL}>
            Join Code
          </label>
          <input
            id={codeId}
            type="text"
            value={joinCode}
            onChange={(e) => {
              setJoinCode(e.target.value.toUpperCase());
              setError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            className={`${TEXT_INPUT} uppercase font-mono`}
            placeholder="ABC123"
          />
          {error?.field === "code" && (
            <p role="alert" className={FIELD_ERROR}>
              {error.message}
            </p>
          )}
        </div>

        <div className="flex gap-3 pt-1">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="btn btn-primary flex-1 py-2"
          >
            {loading ? "Joining..." : "Join Game"}
          </button>
          <button onClick={onClose} className="btn btn-secondary flex-1 py-2">
            Cancel
          </button>
        </div>
      </div>
    </Dialog>
  );
}
