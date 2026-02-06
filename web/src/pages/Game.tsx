import { useState, useEffect, useRef, type ReactNode } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useSession } from "../hooks/useSession";
import { useGame } from "../hooks/useGame";
import {
  rejoinGame,
  getGameStatus,
  createSpectateRequest,
  getSpectateRequestStatus,
} from "../api/client";
import type { GameStatusResponse } from "../types";
import { DraftPhase } from "./phases/Draft";
import { BuildPhase } from "./phases/Build";
import { BattlePhase } from "./phases/Battle";
import { RewardPhase } from "./phases/Reward";
import { Sidebar } from "../components/sidebar";
import { BattleSidebarContent } from "../components/sidebar/BattleSidebarContent";
import { RewardSidebarContent } from "../components/sidebar/RewardSidebarContent";
import { GameSummary } from "../components/GameSummary";
import { RulesModal } from "../components/RulesModal";
import { InfoIcon } from "../components/icons";
import { ContextStripProvider, useContextStrip } from "../contexts";
import { CardPreviewContext } from "../components/card";
import { GameDndProvider, useDndActions, DraggableCard } from "../dnd";
import { PHASE_HINTS, type Phase } from "../constants/rules";
import type { Card as CardType } from "../types";

function CardPreviewModal({
  card,
  upgradeTarget,
  onClose,
}: {
  card: CardType;
  upgradeTarget: CardType | null;
  onClose: () => void;
}) {
  const [isFlipped, setIsFlipped] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const getImageUrl = (c: CardType, flipped: boolean) => {
    if (flipped && c.flip_image_url) {
      return c.flip_image_url;
    }
    return c.png_url ?? c.image_url;
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="relative flex gap-4 items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={getImageUrl(card, isFlipped)}
          alt={card.name}
          className="max-h-[80vh] rounded-lg shadow-2xl"
        />
        {upgradeTarget && (
          <>
            <div className="text-white text-2xl font-bold">→</div>
            <img
              src={getImageUrl(upgradeTarget, isFlipped)}
              alt={upgradeTarget.name}
              className="max-h-[80vh] rounded-lg shadow-2xl"
            />
          </>
        )}
        <button
          className="absolute -top-4 -right-4 bg-black/60 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-black/80"
          onClick={onClose}
        >
          ×
        </button>
        {card.flip_image_url && (
          <button
            className="absolute top-2 right-2 bg-black/60 text-white rounded px-3 py-1 text-sm hover:bg-black/80 transition-colors"
            onClick={() => setIsFlipped(!isFlipped)}
          >
            Flip
          </button>
        )}
      </div>
    </div>
  );
}

interface SpectatorConfig {
  spectatePlayer: string;
  requestId: string;
}

function PlayerSelectionModal({
  gameId,
  onSessionCreated,
}: {
  gameId: string;
  onSessionCreated: (
    sessionId: string,
    playerId: string,
    spectatorConfig?: SpectatorConfig
  ) => void;
}) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<GameStatusResponse | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [spectatorName, setSpectatorName] = useState("");
  const [requestStatus, setRequestStatus] = useState<
    "idle" | "waiting" | "denied"
  >("idle");
  const [error, setError] = useState("");
  const [rejoinName, setRejoinName] = useState("");
  const [rejoinLoading, setRejoinLoading] = useState(false);
  const pollingRef = useRef<number | null>(null);

  useEffect(() => {
    const fetchStatus = () => {
      getGameStatus(gameId).then(setStatus).catch(() => {});
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);

    return () => clearInterval(interval);
  }, [gameId]);

  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
      }
    };
  }, []);

  const handleReconnect = async (playerName: string) => {
    setRejoinName(playerName);
    setRejoinLoading(true);
    setError("");

    try {
      const response = await rejoinGame(gameId, playerName);
      onSessionCreated(response.session_id, response.player_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reconnect");
    } finally {
      setRejoinLoading(false);
    }
  };

  const handleWatchRequest = async () => {
    if (!selectedPlayer || !spectatorName.trim()) {
      setError("Please enter your name");
      return;
    }

    setError("");
    try {
      const { request_id } = await createSpectateRequest(
        gameId,
        selectedPlayer,
        spectatorName
      );
      setRequestStatus("waiting");
      pollForApproval(request_id, selectedPlayer);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send watch request");
    }
  };

  const pollForApproval = (requestId: string, playerName: string) => {
    const poll = async () => {
      try {
        const result = await getSpectateRequestStatus(gameId, requestId);
        if (result.status === "approved" && result.session_id && result.player_id) {
          onSessionCreated(result.session_id, result.player_id, {
            spectatePlayer: playerName,
            requestId,
          });
        } else if (result.status === "denied") {
          setRequestStatus("denied");
        } else {
          pollingRef.current = window.setTimeout(poll, 1000);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to check request status");
        setRequestStatus("idle");
      }
    };
    poll();
  };

  const handleQuickWatch = async (playerName: string) => {
    setError("");
    setSelectedPlayer(playerName);
    try {
      const { request_id } = await createSpectateRequest(
        gameId,
        playerName,
        "Spectator"
      );
      pollForApproval(request_id, playerName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start spectating");
    }
  };

  if (!status) {
    return (
      <div className="game-table flex items-center justify-center p-4">
        <div className="text-white">Loading game info...</div>
      </div>
    );
  }

  const humanPlayers = status.players.filter((p) => !p.is_bot);
  const watchablePlayers = humanPlayers.filter(
    (p) =>
      p.phase !== "eliminated" &&
      p.phase !== "awaiting_elimination" &&
      p.phase !== "winner" &&
      p.phase !== "game_over"
  );

  return (
    <div className="game-table flex items-center justify-center p-4">
      <div className="bg-black/60 backdrop-blur rounded-lg p-8 w-full max-w-lg">
        <h1 className="text-2xl font-bold text-white text-center mb-6">
          Join Game
        </h1>

        {error && (
          <div className="bg-red-900/50 text-red-200 p-3 rounded mb-4">
            {error}
          </div>
        )}

        {requestStatus === "waiting" && (
          <div className="text-center py-8">
            <div className="animate-spin w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-300">
              Waiting for {selectedPlayer} to respond...
            </p>
            <button
              onClick={() => {
                if (pollingRef.current) clearTimeout(pollingRef.current);
                setRequestStatus("idle");
                setSelectedPlayer(null);
              }}
              className="mt-4 text-gray-400 hover:text-white text-sm"
            >
              Cancel
            </button>
          </div>
        )}

        {requestStatus === "denied" && (
          <div className="text-center py-8">
            <p className="text-red-400 mb-4">
              {selectedPlayer} denied your request to watch.
            </p>
            <button
              onClick={() => {
                setRequestStatus("idle");
                setSelectedPlayer(null);
              }}
              className="btn btn-secondary"
            >
              Try Again
            </button>
          </div>
        )}

        {requestStatus === "idle" && !selectedPlayer && (
          <>
            <p className="text-gray-400 text-center mb-4">
              Select a player to reconnect or watch
            </p>
            <div className="space-y-3 mb-6">
              {humanPlayers.map((player) => (
                <div
                  key={player.name}
                  className="flex items-center justify-between bg-gray-800/50 rounded-lg p-3"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        player.is_connected ? "bg-green-500" : "bg-gray-500"
                      }`}
                    />
                    <span className="text-white">{player.name}</span>
                    <span className="text-gray-500 text-sm">
                      ({player.phase})
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {!player.is_connected && (
                      <button
                        onClick={() => handleReconnect(player.name)}
                        disabled={rejoinLoading}
                        className="btn btn-primary text-sm py-1 px-3"
                      >
                        {rejoinLoading && rejoinName === player.name
                          ? "..."
                          : "Reconnect"}
                      </button>
                    )}
                    {watchablePlayers.some((p) => p.name === player.name) && (
                      <button
                        onClick={() =>
                          status.auto_approve_spectators
                            ? handleQuickWatch(player.name)
                            : setSelectedPlayer(player.name)
                        }
                        className="btn btn-secondary text-sm py-1 px-3"
                      >
                        Watch
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => navigate("/")}
              className="btn btn-secondary w-full py-2"
            >
              Back to Home
            </button>
          </>
        )}

        {requestStatus === "idle" && selectedPlayer && (
          <div className="space-y-4">
            <p className="text-gray-300 text-center">
              Request to watch <strong>{selectedPlayer}</strong>'s game
            </p>
            <div>
              <label className="block text-gray-300 mb-1">Your Name</label>
              <input
                type="text"
                value={spectatorName}
                onChange={(e) => setSpectatorName(e.target.value)}
                className="w-full bg-gray-800 text-white rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="Enter your name"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setSelectedPlayer(null)}
                className="btn btn-secondary flex-1 py-2"
              >
                Back
              </button>
              <button
                onClick={handleWatchRequest}
                disabled={!spectatorName.trim()}
                className="btn btn-primary flex-1 py-2"
              >
                Request to Watch
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SpectateRequestModal({
  spectatorName,
  requestId,
  onRespond,
}: {
  spectatorName: string;
  requestId: string;
  onRespond: (requestId: string, allowed: boolean) => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg p-6 max-w-sm">
        <h2 className="text-xl text-white mb-4">Spectate Request</h2>
        <p className="text-gray-300 mb-6">
          <strong>{spectatorName}</strong> wants to watch your game.
        </p>
        <div className="flex gap-3">
          <button
            className="btn btn-primary flex-1"
            onClick={() => onRespond(requestId, true)}
          >
            Allow
          </button>
          <button
            className="btn btn-secondary flex-1"
            onClick={() => onRespond(requestId, false)}
          >
            Deny
          </button>
        </div>
      </div>
    </div>
  );
}

function GameContent() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session, saveSession } = useSession();

  const [spectatorConfig, setSpectatorConfig] = useState<SpectatorConfig | null>(null);
  const [spectatingPlayer, setSpectatingPlayer] = useState<string | null>(null);

  const isSpectateMode = searchParams.get("spectate") === "true";

  const { gameState, isConnected, actions, error, pendingSpectateRequest } = useGame(
    gameId ?? null,
    isSpectateMode ? null : session?.sessionId ?? null,
    spectatorConfig,
  );
  const { state, setPreviewCard } = useContextStrip();

  const isSpectator = !!spectatorConfig;

  // Lifted state from Build phase
  const [selectedBasics, setSelectedBasics] = useState<string[]>([]);

  // Lifted state from Reward phase
  const [selectedUpgradeId, setSelectedUpgradeId] = useState<string | null>(
    null,
  );

  // Lifted state from Battle phase
  const [isChangingResult, setIsChangingResult] = useState(false);
  const [showSidebarSideboard, setShowSidebarSideboard] = useState(false);
  const [showOpponentSideboard, setShowOpponentSideboard] = useState(false);

  // Rules modal state
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [hasViewedRules, setHasViewedRules] = useState(
    () => localStorage.getItem("mtb-rules-viewed") === "true",
  );

  const handleOpenRules = () => {
    setShowRulesModal(true);
    if (!hasViewedRules) {
      localStorage.setItem("mtb-rules-viewed", "true");
      setHasViewedRules(true);
    }
  };

  // DnD setup for battle phase
  const { handleCardMove, getValidDropZones } = useDndActions({
    phase: gameState?.self_player?.phase ?? "draft",
    battleMove: actions.battleMove,
  });

  const handleYourLifeChange = (life: number) => {
    if (isSpectator) return;
    actions.battleUpdateLife("you", life);
  };

  const handleOpponentLifeChange = (life: number) => {
    if (isSpectator) return;
    actions.battleUpdateLife("opponent", life);
  };

  const handleSessionCreated = (
    sessionId: string,
    playerId: string,
    config?: SpectatorConfig
  ) => {
    saveSession(sessionId, playerId);
    if (config) {
      setSpectatorConfig(config);
      setSpectatingPlayer(config.spectatePlayer);
    }
    if (isSpectateMode) {
      setSearchParams({});
    }
  };

  const handleSpectateNewTab = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("spectate", "true");
    window.open(url.toString(), '_blank');
  };

  if (!session || isSpectateMode) {
    return (
      <PlayerSelectionModal
        gameId={gameId!}
        onSessionCreated={handleSessionCreated}
      />
    );
  }

  if (!isConnected) {
    return (
      <div className="game-table flex items-center justify-center">
        <div className="text-white">Connecting...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="game-table flex items-center justify-center">
        <div className="text-red-400">{error}</div>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="game-table flex items-center justify-center">
        <div className="text-white">Loading game...</div>
      </div>
    );
  }

  const currentPhase = gameState.self_player.phase;

  const phaseBadgeClass =
    {
      draft: "draft",
      build: "build",
      battle: "battle",
      reward: "reward",
      awaiting_elimination: "reward",
      eliminated: "battle",
      winner: "reward",
      game_over: "battle",
    }[currentPhase] || "draft";

  const { self_player, current_battle, players } = gameState;

  const opponentPlayer = current_battle
    ? players.find((p) => p.name === current_battle.opponent_name)
    : null;
  const canManipulateOpponent = currentPhase === "battle";
  const opponentHasCompanion = (opponentPlayer?.command_zone.length ?? 0) > 0;
  const maxHandSize = self_player.hand_size;
  const handExceedsLimit = self_player.hand.length > maxHandSize;
  const basicsComplete = selectedBasics.length === 3;
  const canReady = basicsComplete && !handExceedsLimit;

  const isStageIncreasing = self_player.is_stage_increasing;
  const needsUpgrade =
    isStageIncreasing && gameState.available_upgrades.length > 0;
  const canContinue = !needsUpgrade || !!selectedUpgradeId;

  const handleContinue = () => {
    actions.rewardDone(selectedUpgradeId ?? undefined);
    setSelectedUpgradeId(null);
  };

  const renderActionButtons = (): ReactNode => {
    if (isSpectator) {
      return null;
    }
    if (currentPhase === "eliminated") {
      return (
        <>
          <button onClick={handleSpectateNewTab} className="btn btn-secondary">
            Spectate
          </button>
          <button onClick={() => navigate("/")} className="btn btn-primary">
            Home
          </button>
        </>
      );
    }
    if (currentPhase === "winner" || currentPhase === "game_over") {
      return (
        <button onClick={() => navigate("/")} className="btn btn-primary">
          Home
        </button>
      );
    }
    switch (currentPhase) {
      case "draft":
        return (
          <>
            <button
              onClick={actions.draftRoll}
              disabled={
                self_player.treasures <= 0 ||
                (self_player.current_pack?.length ?? 0) === 0
              }
              className="btn btn-secondary"
            >
              Roll for 1💰
            </button>
            <button onClick={actions.draftDone} className="btn btn-primary">
              Go to Build
            </button>
          </>
        );
      case "build":
        if (self_player.build_ready) {
          return (
            <>
              <span className="text-amber-400 text-sm">Waiting...</span>
              <button
                onClick={actions.buildUnready}
                className="btn bg-gray-600 hover:bg-gray-500 text-white"
              >
                Unready
              </button>
            </>
          );
        }
        return (
          <button
            onClick={() => actions.buildReady(selectedBasics)}
            disabled={!canReady}
            className="btn btn-primary"
          >
            Ready {!basicsComplete && "(select 3 basics)"}
          </button>
        );
      case "battle": {
        if (!current_battle) return null;
        const { opponent_name, result_submissions } = current_battle;
        const mySubmission = result_submissions[self_player.name];
        const opponentSubmission = result_submissions[opponent_name];

        if (mySubmission && !isChangingResult) {
          const resultsConflict =
            opponentSubmission && mySubmission !== opponentSubmission;
          return (
            <>
              <span
                className={`text-sm ${resultsConflict ? "text-red-400" : "text-amber-400"}`}
              >
                {resultsConflict ? "Results conflict!" : "Waiting..."}
              </span>
              <button
                onClick={() => setIsChangingResult(true)}
                className="btn btn-secondary"
              >
                Change
              </button>
            </>
          );
        }
        return (
          <>
            {isChangingResult && (
              <button
                onClick={() => setIsChangingResult(false)}
                className="text-gray-400 text-sm hover:text-white"
              >
                Cancel
              </button>
            )}
            <button
              onClick={() => {
                actions.battleSubmitResult(self_player.name);
                setIsChangingResult(false);
              }}
              className="btn btn-primary"
            >
              I Won
            </button>
            <button
              onClick={() => {
                actions.battleSubmitResult("draw");
                setIsChangingResult(false);
              }}
              className="btn btn-secondary"
            >
              Draw
            </button>
            <button
              onClick={() => {
                actions.battleSubmitResult(opponent_name);
                setIsChangingResult(false);
              }}
              className="btn btn-danger"
            >
              I Lost
            </button>
          </>
        );
      }
      case "reward": {
        const buttonLabel = needsUpgrade
          ? selectedUpgradeId
            ? "Claim & Continue"
            : "Select Upgrade"
          : "Continue";
        return (
          <button
            onClick={handleContinue}
            disabled={!canContinue}
            className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {buttonLabel}
          </button>
        );
      }
      default:
        return null;
    }
  };

  const handleCreateTreasure = () => {
    actions.battleUpdateCardState("create_treasure", "", {});
  };

  const handlePassTurn = () => {
    actions.battlePassTurn();
  };

  const renderPhaseContent = (): ReactNode => {
    if (currentPhase === "battle" && current_battle) {
      return (
        <BattleSidebarContent
          currentBattle={current_battle}
          selfUpgrades={self_player.upgrades}
          yourLife={current_battle.your_life}
          opponentLife={current_battle.opponent_life}
          onYourLifeChange={handleYourLifeChange}
          onOpponentLifeChange={handleOpponentLifeChange}
          playerName={self_player.name}
          onCreateTreasure={handleCreateTreasure}
          onPassTurn={handlePassTurn}
          canManipulateOpponent={canManipulateOpponent}
          hasCompanion={self_player.command_zone.length > 0}
          opponentHasCompanion={opponentHasCompanion}
          sideboardCount={current_battle.your_zones.sideboard.length}
          onShowSideboard={() => setShowSidebarSideboard(true)}
          opponentSideboardCount={current_battle.opponent_full_sideboard?.length ?? 0}
          onShowOpponentSideboard={() => setShowOpponentSideboard(true)}
        />
      );
    }
    if (currentPhase === "reward" && self_player.last_battle_result) {
      return (
        <RewardSidebarContent
          lastBattleResult={self_player.last_battle_result}
          playerName={self_player.name}
        />
      );
    }
    return null;
  };

  return (
    <CardPreviewContext.Provider value={{ setPreviewCard }}>
      <div className="game-table flex flex-col">
        {/* Spectator Banner */}
        {isSpectator && spectatingPlayer && (
          <div className="bg-purple-900/80 text-purple-200 text-center py-2">
            Watching {spectatingPlayer}'s game (spectator mode)
          </div>
        )}
        {/* Header - Action Bar */}
        <header className="flex justify-between items-center px-4 py-2 bg-black/30">
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-300">
              Stage {self_player.stage} • Round {self_player.round}
            </div>
            <button
              onClick={handleOpenRules}
              className={`phase-badge ${phaseBadgeClass} ${!hasViewedRules ? "pulse" : ""}`}
            >
              {currentPhase}
              <InfoIcon size="sm" className="ml-1.5 opacity-60" />
            </button>
          </div>
          <div className="text-sm text-gray-400 italic">
            {PHASE_HINTS[currentPhase as Phase]}
          </div>
          <div className="flex items-center gap-2">{renderActionButtons()}</div>
        </header>

        {/* Main content */}
        {currentPhase === "battle" ? (
          <GameDndProvider
            onCardMove={handleCardMove}
            validDropZones={getValidDropZones}
          >
            <div className="flex-1 flex min-h-0">
              <main className="flex-1 flex flex-col min-h-0">
                <BattlePhase gameState={gameState} actions={actions} />
              </main>
              <Sidebar
                players={gameState.players}
                currentPlayer={self_player}
                phaseContent={renderPhaseContent()}
                useUpgrades={gameState.use_upgrades}
              />
            </div>
            {showSidebarSideboard && current_battle && (
              <div
                className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
                onClick={() => setShowSidebarSideboard(false)}
              >
                <div
                  className="bg-gray-900 rounded-lg p-4 max-w-2xl max-h-[80vh] overflow-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-white font-medium">
                      Your Sideboard ({current_battle.your_zones.sideboard.length})
                    </h3>
                    <button
                      onClick={() => setShowSidebarSideboard(false)}
                      className="text-gray-400 hover:text-white"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {current_battle.your_zones.sideboard.map((card) => (
                      <DraggableCard key={card.id} card={card} zone="sideboard" size="sm" />
                    ))}
                  </div>
                </div>
              </div>
            )}
            {showOpponentSideboard && current_battle && current_battle.opponent_full_sideboard && (
              <div
                className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
                onClick={() => setShowOpponentSideboard(false)}
              >
                <div
                  className="bg-gray-900 rounded-lg p-4 max-w-2xl max-h-[80vh] overflow-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-white font-medium">
                      {current_battle.opponent_name}'s Full Sideboard ({current_battle.opponent_full_sideboard.length})
                    </h3>
                    <button
                      onClick={() => setShowOpponentSideboard(false)}
                      className="text-gray-400 hover:text-white"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {current_battle.opponent_full_sideboard.map((card) => (
                      <DraggableCard
                        key={card.id}
                        card={card}
                        zone="sideboard"
                        zoneOwner="opponent"
                        size="sm"
                        isOpponent
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </GameDndProvider>
        ) : (
          <div className="flex-1 flex min-h-0">
            <main className="flex-1 flex flex-col min-h-0">
              {currentPhase === "draft" && (
                <DraftPhase gameState={gameState} actions={actions} />
              )}
              {currentPhase === "build" && (
                <BuildPhase
                  gameState={gameState}
                  actions={actions}
                  selectedBasics={selectedBasics}
                  onBasicsChange={setSelectedBasics}
                />
              )}
              {currentPhase === "reward" && (
                <RewardPhase
                  gameState={gameState}
                  actions={actions}
                  selectedUpgradeId={selectedUpgradeId}
                  onUpgradeSelect={setSelectedUpgradeId}
                />
              )}
              {currentPhase === "awaiting_elimination" && (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center max-w-md">
                    <h2 className="text-2xl text-red-400 mb-4">
                      You Have Been Eliminated
                    </h2>
                    <p className="text-gray-300 mb-6">
                      Waiting until all battles are complete to determine if you
                      will compete in sudden death to stay alive.
                    </p>
                    <div className="bg-black/40 rounded-lg p-4 text-left">
                      <h3 className="text-amber-400 font-medium mb-2">
                        Sudden Death Rules
                      </h3>
                      <ul className="text-gray-400 text-sm space-y-1">
                        <li>
                          Triggers when 2+ players eliminated with fewer than 2
                          survivors
                        </li>
                        <li>
                          2 players with lowest poison fight (ties broken
                          randomly)
                        </li>
                        <li>Other eliminated players are out immediately</li>
                        <li>Poison resets to 9 for the sudden death battle</li>
                        <li>Winner survives, loser is eliminated</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
              {(currentPhase === "eliminated" ||
                currentPhase === "winner" ||
                currentPhase === "game_over") && (
                <GameSummary
                  player={self_player}
                  players={gameState.players}
                  useUpgrades={gameState.use_upgrades}
                />
              )}
            </main>
            <Sidebar
              players={gameState.players}
              currentPlayer={self_player}
              phaseContent={renderPhaseContent()}
              useUpgrades={gameState.use_upgrades}
            />
          </div>
        )}
      </div>
      {state.previewCard && (
        <CardPreviewModal
          card={state.previewCard}
          upgradeTarget={state.previewUpgradeTarget}
          onClose={() => setPreviewCard(null)}
        />
      )}
      {showRulesModal && (
        <RulesModal
          currentPhase={currentPhase as Phase}
          onClose={() => setShowRulesModal(false)}
        />
      )}
      {pendingSpectateRequest && (
        <SpectateRequestModal
          spectatorName={pendingSpectateRequest.spectator_name}
          requestId={pendingSpectateRequest.request_id}
          onRespond={actions.spectateResponse}
        />
      )}
    </CardPreviewContext.Provider>
  );
}

export function Game() {
  return (
    <ContextStripProvider>
      <GameContent />
    </ContextStripProvider>
  );
}
