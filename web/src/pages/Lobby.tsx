import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FaDiscord } from "react-icons/fa6";
import { useSession } from "../hooks/useSession";
import { useGame } from "../hooks/useGame";
import { useHotkeys } from "../hooks/useHotkeys";
import { InfoIcon } from "../components/icons/InfoIcon";
import { RulesPanel, type RulesPanelTarget } from "../components/RulesPanel";
import { useToast } from "../contexts";
import { HintsBanner } from "../components/common/HintsBanner";
import { CubeCobraPrimerLink } from "../components/common/CubeCobraPrimerLink";
import { shouldClearSessionOnInvalidEvent } from "../utils/sessionRecovery";
import {
  getDefaultNewPlayerPreference,
  getNewPlayerPreferenceForGame,
  setNewPlayerPreferenceForGame,
} from "../utils/deviceIdentity";

const DESKTOP_SUBTITLE = "An MtG format inspired by autobattlers";
const MOBILE_SUBTITLE = "An MtG format inspired by autobattlers";

function GuidedModeSwitch({
  enabled,
  setEnabled,
}: {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
}) {
  const guidedModeHelpText =
    "When Guided Mode is on, the first time you enter a situation, a simple popup gives you help.";
  const [showGuidedModeHelp, setShowGuidedModeHelp] = useState(false);
  const guidedModeHelpRef = useRef<HTMLDivElement>(null);
  const [popupAnchorX, setPopupAnchorX] = useState<"right" | "left" | "center">("right");
  const [popupAnchorY, setPopupAnchorY] = useState<"top" | "bottom">("top");

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!guidedModeHelpRef.current?.contains(target)) {
        setShowGuidedModeHelp(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    if (!showGuidedModeHelp) return;

    const repositionPopup = () => {
      const anchor = guidedModeHelpRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const viewportPadding = 8;
      const popupWidth = Math.min(256, window.innerWidth - viewportPadding * 2);
      const canAlignRight = rect.right - popupWidth >= viewportPadding;
      const canAlignLeft = rect.left + popupWidth <= window.innerWidth - viewportPadding;

      if (canAlignRight) {
        setPopupAnchorX("right");
      } else if (canAlignLeft) {
        setPopupAnchorX("left");
      } else {
        setPopupAnchorX("center");
      }

      const estimatedPopupHeight = 96;
      setPopupAnchorY(
        rect.top - estimatedPopupHeight >= viewportPadding ? "top" : "bottom",
      );
    };

    repositionPopup();
    window.addEventListener("resize", repositionPopup);
    window.addEventListener("scroll", repositionPopup, true);
    return () => {
      window.removeEventListener("resize", repositionPopup);
      window.removeEventListener("scroll", repositionPopup, true);
    };
  }, [showGuidedModeHelp]);

  return (
    <div className="flex items-center gap-1.5 shrink-0 rounded-md border border-black/40 bg-black/40 px-2 py-1">
      <label className="flex items-center gap-1.5 cursor-pointer">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-300">
          Guided
        </span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="sr-only peer"
        />
        <span className="relative inline-flex h-5 w-10 items-center rounded-full transition-colors bg-gray-700 peer-checked:bg-amber-500">
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enabled ? "translate-x-5" : "translate-x-1"
            }`}
          />
        </span>
      </label>
      <div ref={guidedModeHelpRef} className="relative group shrink-0">
        <button
          type="button"
          className="text-gray-400 hover:text-gray-200"
          aria-label="What guided mode does"
          aria-expanded={showGuidedModeHelp}
          onClick={() => setShowGuidedModeHelp((v) => !v)}
        >
          <InfoIcon size="sm" />
        </button>
        <span
          className={`absolute w-64 rounded-lg modal-chrome border gold-border shadow-xl p-2 text-left text-[11px] text-gray-100 transition-opacity z-[60] ${
            popupAnchorX === "right"
              ? "right-0"
              : popupAnchorX === "left"
                ? "left-0"
                : "left-1/2 -translate-x-1/2"
          } ${
            popupAnchorY === "top" ? "bottom-full mb-2" : "top-full mt-2"
          } ${
            showGuidedModeHelp
              ? "opacity-100"
              : "opacity-0 pointer-events-none group-hover:opacity-100 group-focus-within:opacity-100"
          }`}
          style={{ maxWidth: "calc(100vw - 1rem)" }}
        >
          {guidedModeHelpText}
        </span>
      </div>
    </div>
  );
}

function LobbyFooterLinks() {
  return (
    <div className="flex items-center justify-between">
      <CubeCobraPrimerLink />
      <a
        href="https://discord.gg/2NAjcWXNKn"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-sm text-violet-300 hover:text-violet-200 transition-colors"
      >
        <FaDiscord className="w-4 h-4" />
        Join Discord
      </a>
    </div>
  );
}

export function Lobby() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { session, clearSession } = useSession();
  const { addToast } = useToast();
  const {
    lobbyState,
    gameState,
    isConnected,
    kicked,
    invalidSession,
    gameNotFound,
    actions,
  } = useGame(
    gameId ?? null,
    session?.sessionId ?? null,
    null,
    addToast,
  );

  const [copied, setCopied] = useState(false);
  const [startingGame, setStartingGame] = useState(false);
  const [showRulesPanel, setShowRulesPanel] = useState(false);
  const [isGuidedMode, setIsGuidedMode] = useState(() =>
    getDefaultNewPlayerPreference(),
  );
  const [rulesPanelTarget, setRulesPanelTarget] = useState<
    RulesPanelTarget | undefined
  >(undefined);
  const wasInvalidSessionRef = useRef(false);

  useEffect(() => {
    if (!gameId) return;
    const existing = getNewPlayerPreferenceForGame(gameId, session?.playerId);
    const initial =
      existing ??
      lobbyState?.guided_mode_default ??
      getDefaultNewPlayerPreference();
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setIsGuidedMode(initial);
    });
    if (existing === null) {
      setNewPlayerPreferenceForGame(gameId, initial, session?.playerId);
    }
    return () => {
      cancelled = true;
    };
  }, [gameId, lobbyState?.guided_mode_default, session?.playerId]);

  const handleGuidedModeToggle = (nextValue: boolean) => {
    setIsGuidedMode(nextValue);
    if (gameId) {
      setNewPlayerPreferenceForGame(gameId, nextValue, session?.playerId);
    }
  };

  const currentPlayer = lobbyState?.players.find(
    (p) => p.player_id === session?.playerId,
  );

  const lobbyHotkeyMap: Record<string, () => void> = {
    "?": () => {
      setRulesPanelTarget(undefined);
      setShowRulesPanel(true);
    },
  };
  if (lobbyState && currentPlayer && !showRulesPanel) {
    const isHost = currentPlayer.is_host;
    const isReady = currentPlayer.is_ready;
    lobbyHotkeyMap["r"] = () => actions.setReady(!isReady);
    lobbyHotkeyMap["Enter"] = () => {
      if (isHost && lobbyState.can_start && !startingGame) {
        setStartingGame(true);
        actions.startGame();
      } else {
        actions.setReady(!isReady);
      }
    };
  }
  useHotkeys(lobbyHotkeyMap, !!session && !showRulesPanel);

  useEffect(() => {
    if (gameState) {
      navigate(`/game/${gameId}/play`);
    }
  }, [gameState, gameId, navigate]);

  useEffect(() => {
    if (kicked) {
      navigate("/play");
    }
  }, [kicked, navigate]);

  useEffect(() => {
    const shouldClear = shouldClearSessionOnInvalidEvent(
      invalidSession,
      wasInvalidSessionRef.current,
      !!session,
    );
    wasInvalidSessionRef.current = invalidSession;
    if (shouldClear) {
      clearSession();
    }
  }, [invalidSession, session, clearSession]);

  const copyJoinCode = async () => {
    if (!lobbyState?.join_code) return;
    try {
      await navigator.clipboard.writeText(lobbyState.join_code);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = lobbyState.join_code;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!session) {
    return (
      <div className="game-table h-dvh flex flex-col overflow-hidden">
        <header className="shrink-0 py-3 frame-chrome bar-pad-both">
          <div className="hidden sm:flex items-center justify-between">
            <div>
              <h1 className="hero-title text-3xl font-bold tracking-tight leading-tight">
                Magic: The Battling
              </h1>
              <p className="text-gray-400 text-sm">{DESKTOP_SUBTITLE}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => navigate("/")}
                className="btn btn-secondary py-2 px-4"
              >
                Home
              </button>
              <button
                onClick={() => {
                  setRulesPanelTarget(undefined);
                  setShowRulesPanel(true);
                }}
                className="btn btn-secondary py-2 px-4"
              >
                Guide
              </button>
            </div>
          </div>
          <div className="sm:hidden">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h1 className="hero-title text-xl font-bold tracking-tight leading-tight">
                  Magic: The Battling
                </h1>
                <p className="text-gray-400 text-xs">{MOBILE_SUBTITLE}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => navigate("/")}
                  className="btn btn-secondary py-1.5 px-3 text-sm"
                >
                  Home
                </button>
                <button
                  onClick={() => {
                    setRulesPanelTarget(undefined);
                    setShowRulesPanel(true);
                  }}
                  className="btn btn-secondary py-1.5 px-3 text-sm"
                >
                  ?
                </button>
              </div>
            </div>
          </div>
        </header>
        <div className="flex-1 flex min-h-0 game-surface">
          <div className="sm:hidden w-[4px] shrink-0 frame-chrome" style={{ borderRight: "1px solid var(--gold-border)" }} />
          <main className="flex-1 min-h-0 p-[2px] zone-divider-bg">
            <div className="zone-pack h-full min-h-0 flex items-center justify-center">
              <div className="modal-chrome border gold-border rounded-lg p-5 max-w-md w-[min(92vw,28rem)]">
                <h2 className="text-lg font-semibold text-amber-200">
                  Unable to Reconnect
                </h2>
                <p className="text-sm text-gray-200 mt-2 leading-snug">
                  Your prior lobby session is no longer valid. Start a new game
                  or join another lobby.
                </p>
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => navigate("/play")}
                    className="btn btn-primary flex-1 py-2"
                  >
                    Go to Play
                  </button>
                  <button
                    onClick={() => navigate("/")}
                    className="btn btn-secondary flex-1 py-2"
                  >
                    Home
                  </button>
                </div>
              </div>
            </div>
          </main>
          <div className="w-[4px] sm:w-10 shrink-0 frame-chrome" style={{ borderLeft: "1px solid var(--gold-border)" }} />
        </div>
        <footer className="shrink-0 frame-chrome bar-pad-both py-2">
          <LobbyFooterLinks />
        </footer>
        {showRulesPanel && (
          <RulesPanel
            onClose={() => setShowRulesPanel(false)}
            initialDocId={rulesPanelTarget?.docId}
            initialTab={rulesPanelTarget?.tab}
            gameId={gameId}
            useUpgrades={undefined}
          />
        )}
      </div>
    );
  }

  if (!lobbyState) {
    return (
      <div className="game-table h-dvh flex flex-col overflow-hidden">
        <header className="shrink-0 py-3 frame-chrome bar-pad-both">
          <div className="hidden sm:flex items-center justify-between">
            <div>
              <h1 className="hero-title text-3xl font-bold tracking-tight leading-tight">
                Magic: The Battling
              </h1>
              <p className="text-gray-400 text-sm">{DESKTOP_SUBTITLE}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => navigate("/")}
                className="btn btn-secondary py-2 px-4"
              >
                Home
              </button>
              <button
                onClick={() => {
                  setRulesPanelTarget(undefined);
                  setShowRulesPanel(true);
                }}
                className="btn btn-secondary py-2 px-4"
              >
                Guide
              </button>
            </div>
          </div>
          <div className="sm:hidden">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h1 className="hero-title text-xl font-bold tracking-tight leading-tight">
                  Magic: The Battling
                </h1>
                <p className="text-gray-400 text-xs">{MOBILE_SUBTITLE}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => navigate("/")}
                  className="btn btn-secondary py-1.5 px-3 text-sm"
                >
                  Home
                </button>
                <button
                  onClick={() => {
                    setRulesPanelTarget(undefined);
                    setShowRulesPanel(true);
                  }}
                  className="btn btn-secondary py-1.5 px-3 text-sm"
                >
                  ?
                </button>
              </div>
            </div>
          </div>
        </header>
        <div className="flex-1 flex min-h-0 game-surface">
          <div className="sm:hidden w-[4px] shrink-0 frame-chrome" style={{ borderRight: "1px solid var(--gold-border)" }} />
          <main className="flex-1 min-h-0 p-[2px] zone-divider-bg">
            <div className="zone-pack h-full min-h-0 flex items-center justify-center">
              {gameNotFound ? (
                <div className="modal-chrome border gold-border rounded-lg p-5 max-w-md w-[min(92vw,28rem)]">
                  <h2 className="text-lg font-semibold text-amber-200">
                    Lobby Unavailable
                  </h2>
                  <p className="text-sm text-gray-200 mt-2 leading-snug">
                    This lobby is no longer available. It may have ended or been
                    cleared during a server restart.
                  </p>
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => navigate("/play")}
                      className="btn btn-primary flex-1 py-2"
                    >
                      Go to Play
                    </button>
                    <button
                      onClick={() => navigate("/")}
                      className="btn btn-secondary flex-1 py-2"
                    >
                      Home
                    </button>
                  </div>
                </div>
              ) : (
                <div className="modal-chrome border gold-border rounded-lg px-5 py-3 flex items-center gap-3">
                  <svg className="animate-spin h-4 w-4 text-amber-400 shrink-0" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span className="text-sm text-gray-100">Loading lobby...</span>
                </div>
              )}
            </div>
          </main>
          <div className="w-[4px] sm:w-10 shrink-0 frame-chrome" style={{ borderLeft: "1px solid var(--gold-border)" }} />
        </div>
        <footer className="shrink-0 frame-chrome bar-pad-both py-2">
          <LobbyFooterLinks />
        </footer>
        {showRulesPanel && (
          <RulesPanel
            onClose={() => setShowRulesPanel(false)}
            initialDocId={rulesPanelTarget?.docId}
            initialTab={rulesPanelTarget?.tab}
            gameId={gameId}
            useUpgrades={undefined}
          />
        )}
      </div>
    );
  }

  return (
    <div className="game-table h-dvh flex flex-col overflow-hidden">
      {!isConnected && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center">
          <div className="modal-chrome border gold-border rounded-lg shadow-xl px-5 py-3 flex items-center gap-3">
            <svg className="animate-spin h-4 w-4 text-amber-400 shrink-0" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-sm text-gray-100">Reconnecting...</span>
          </div>
        </div>
      )}
      <header className="shrink-0 py-3 frame-chrome bar-pad-both">
        <div className="hidden sm:flex items-center justify-between">
          <div>
            <h1 className="hero-title text-3xl font-bold tracking-tight leading-tight">
              Magic: The Battling
            </h1>
            <p className="text-gray-400 text-sm">{DESKTOP_SUBTITLE}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate("/")}
              className="btn btn-secondary py-2 px-4"
            >
              Home
            </button>
            <button
              onClick={() => {
                setRulesPanelTarget(undefined);
                setShowRulesPanel(true);
              }}
              className="btn btn-secondary py-2 px-4"
            >
              Guide
            </button>
          </div>
        </div>
        <div className="sm:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="hero-title text-xl font-bold tracking-tight leading-tight">
                Magic: The Battling
              </h1>
              <p className="text-gray-400 text-xs">{MOBILE_SUBTITLE}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => navigate("/")}
                className="btn btn-secondary py-1.5 px-3 text-sm"
              >
                Home
              </button>
              <button
                onClick={() => {
                  setRulesPanelTarget(undefined);
                  setShowRulesPanel(true);
                }}
                className="btn btn-secondary py-1.5 px-3 text-sm"
              >
                ?
              </button>
            </div>
          </div>
        </div>
      </header>
      <div className="flex-1 flex min-h-0 game-surface">
        <div className="sm:hidden w-[4px] shrink-0 frame-chrome" style={{ borderRight: "1px solid var(--gold-border)" }} />
        <main className="flex-1 min-h-0 p-[2px] zone-divider-bg flex flex-col">
          <div className="zone-pack flex-1 min-h-0 flex flex-col sm:items-center sm:justify-center px-4 py-4 overflow-auto">
            <div className="modal-chrome border gold-border rounded-lg p-4 w-full max-w-md flex-1 min-h-0 overflow-visible sm:flex-none felt-raised-panel">
              {lobbyState &&
                (() => {
                  const isHost = currentPlayer?.is_host ?? false;
                  const isReady = currentPlayer?.is_ready ?? false;
                  const puppetCount = lobbyState.puppet_count;
                  const total = lobbyState.target_player_count;
                  const availablePuppets = lobbyState.available_puppet_count;
                  const canAddPuppet =
                    availablePuppets !== null &&
                    puppetCount < availablePuppets &&
                    total < 8;

                  const openGuide = (target?: RulesPanelTarget) => {
                    setRulesPanelTarget(target);
                    setShowRulesPanel(true);
                  };

                  const startMessage = (() => {
                    if (startingGame) return null;
                    if (total < 2) return "Need at least 2 players";
                    if (total % 2 !== 0)
                      return `Odd player count (${total})`;
                    if (!lobbyState.players.every((p) => p.is_ready))
                      return "Waiting for all players to ready";
                    if (
                      puppetCount > 0 &&
                      availablePuppets !== null &&
                      availablePuppets < puppetCount
                    )
                      return "Not enough puppets available";
                    return null;
                  })();
                  const filledSlots = [
                    ...lobbyState.players.map((player) => ({
                      kind: "player" as const,
                      key: player.player_id,
                      player,
                    })),
                    ...Array.from({ length: puppetCount }).map((_, i) => ({
                      kind: "puppet" as const,
                      key: `puppet-${i}`,
                      puppetIndex: i,
                    })),
                  ].slice(0, 8);
                  const playerSlots = [
                    ...filledSlots,
                    ...Array.from({
                      length: Math.max(0, 8 - filledSlots.length),
                    }).map((_, i) => ({
                      kind: "open" as const,
                      key: `open-${i}`,
                      openIndex: i,
                    })),
                  ];

                  return (
                    <>
                      <div className="rounded-lg p-3 mb-3 text-center bg-black/35 border border-black/40">
                        <div className="flex items-center justify-center gap-3">
                          <span className="text-2xl font-mono font-bold text-amber-400 tracking-wider">
                            {lobbyState.join_code}
                          </span>
                          <button
                            onClick={copyJoinCode}
                            className="btn btn-secondary text-xs py-0.5 px-2"
                          >
                            {copied ? "Copied!" : "Copy"}
                          </button>
                        </div>
                        <div className="border-t border-black/40 mt-2 pt-2 flex items-center justify-center gap-2 text-xs text-gray-500">
                          <span>
                            Cube:{" "}
                            <a
                              href={`https://cubecobra.com/cube/overview/${lobbyState.cube_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-amber-500 hover:text-amber-400 transition-colors"
                            >
                              {lobbyState.cube_id}
                            </a>
                          </span>
                          <span>&middot;</span>
                          <span>
                            Upgrades: {lobbyState.use_upgrades ? "On" : "Off"}
                          </span>
                          <span>&middot;</span>
                          <button
                            onClick={() => openGuide({ docId: "__cards__" })}
                            className="text-amber-500/70 hover:text-amber-400 transition-colors"
                          >
                            Browse Cards
                          </button>
                        </div>
                      </div>

                <div className="bg-black/35 rounded-lg border border-black/40 p-3 mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-white font-medium text-sm">Players</h2>
                    {isHost ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => actions.addPuppet()}
                          disabled={!canAddPuppet}
                          className="text-sm text-cyan-400 hover:text-cyan-300 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
                        >
                          + Add Puppet
                        </button>
                        <button
                          onClick={() =>
                            openGuide({
                              docId: "faq",
                              tab: "why-are-my-opponents-cards-face-up",
                            })
                          }
                          className="w-5 h-5 rounded-full bg-black/30 border border-black/40 text-gray-400 hover:bg-black/20 hover:text-white transition-all text-[10px] flex items-center justify-center"
                          title="What are Puppets?"
                        >
                          ?
                        </button>
                      </div>
                    ) : (
                      puppetCount > 0 && (
                        <button
                          onClick={() =>
                            openGuide({
                              docId: "faq",
                              tab: "why-are-my-opponents-cards-face-up",
                            })
                          }
                          className="text-gray-500 hover:text-gray-300 text-xs transition-colors"
                        >
                          What are Puppets?
                        </button>
                      )
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {playerSlots.map((slot) => {
                      if (slot.kind === "player") {
                        const { player } = slot;
                        return (
                          <div
                            key={slot.key}
                            className="bg-black/30 border border-black/40 px-3 py-2.5 rounded-lg flex items-center gap-2 min-w-0"
                          >
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                player.is_ready ? "bg-green-500" : "bg-gray-500"
                              }`}
                            />
                            <span className="text-white text-sm truncate">
                              {player.name}
                            </span>
                            {player.is_host && (
                              <span className="text-amber-400 text-xs shrink-0 ml-auto">
                                Host
                              </span>
                            )}
                            {isHost && !player.is_host && (
                              <button
                                onClick={() => actions.kickPlayer(player.player_id)}
                                className="text-gray-500 hover:text-red-400 transition-colors shrink-0 ml-auto text-xs"
                                title="Remove player"
                              >
                                &times;
                              </button>
                            )}
                          </div>
                        );
                      }

                      if (slot.kind === "puppet") {
                        const isSearching = availablePuppets === null;
                        const botAvailable =
                          !isSearching && slot.puppetIndex < availablePuppets;
                        return (
                          <div
                            key={slot.key}
                            className={`bg-black/30 px-3 py-2.5 rounded-lg flex items-center gap-2 border border-dashed ${
                              isSearching
                                ? "border-amber-600/50"
                                : botAvailable
                                  ? "border-cyan-700"
                                  : "border-red-700/50"
                            }`}
                          >
                            {isSearching ? (
                              <svg
                                className="animate-spin h-3 w-3 text-amber-500 shrink-0"
                                viewBox="0 0 24 24"
                              >
                                <circle
                                  className="opacity-25"
                                  cx="12"
                                  cy="12"
                                  r="10"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                  fill="none"
                                />
                                <path
                                  className="opacity-75"
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                />
                              </svg>
                            ) : (
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${botAvailable ? "bg-cyan-600" : "bg-red-700/50"}`}
                              />
                            )}
                            <span
                              className={`text-sm italic ${isSearching ? "text-amber-400" : botAvailable ? "text-cyan-500" : "text-red-400/70"}`}
                            >
                              Puppet {slot.puppetIndex + 1}
                            </span>
                            {isHost && (
                              <button
                                onClick={() => actions.removePuppet()}
                                className="text-gray-500 hover:text-red-400 transition-colors shrink-0 ml-auto text-xs"
                                title="Remove puppet"
                              >
                                &times;
                              </button>
                            )}
                          </div>
                        );
                      }

                      return (
                        <div
                          key={slot.key}
                          className="bg-black/20 border border-dashed border-black/35 px-3 py-2.5 rounded-lg flex items-center gap-2 min-w-0"
                        >
                          <span className="w-2 h-2 rounded-full shrink-0 bg-black/40" />
                          <span className="text-gray-500 text-sm italic">
                            {filledSlots.length === 1 && slot.openIndex === 0
                              ? "required"
                              : "optional"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3 mb-3">
                  <div className="flex items-center justify-between gap-2">
                    <GuidedModeSwitch
                      enabled={isGuidedMode}
                      setEnabled={handleGuidedModeToggle}
                    />
                    {startMessage ? (
                      <p className="text-gray-500 text-xs text-right leading-snug max-w-[58%]">
                        {startMessage}
                      </p>
                    ) : (
                      <span />
                    )}
                  </div>

                  <div className={isHost ? "grid grid-cols-2 gap-2" : ""}>
                    <button
                      onClick={() => actions.setReady(!isReady)}
                      className={`btn btn-dark-border w-full py-2 ${
                        isReady
                          ? "bg-gray-600 text-white hover:bg-gray-500"
                          : "bg-green-600 text-white hover:bg-green-500"
                      }`}
                    >
                      {isReady ? "Unready" : "Ready"}
                    </button>

                    {isHost && (
                      <button
                        onClick={() => {
                          setStartingGame(true);
                          actions.startGame();
                        }}
                        disabled={!lobbyState.can_start || startingGame}
                        className="btn btn-primary btn-dark-border w-full py-2"
                      >
                        {startingGame ? (
                          <span className="flex items-center justify-center gap-2">
                            <svg
                              className="animate-spin h-5 w-5"
                              viewBox="0 0 24 24"
                            >
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                                fill="none"
                              />
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                              />
                            </svg>
                            Starting...
                          </span>
                        ) : (
                          "Start Game"
                        )}
                      </button>
                    )}
                  </div>
                </div>

                    </>
                  );
                })()}
            </div>
          </div>
          <HintsBanner variant="rail" />
        </main>
        <div className="w-[4px] sm:w-10 shrink-0 frame-chrome" style={{ borderLeft: "1px solid var(--gold-border)" }} />
      </div>
      <footer className="shrink-0 frame-chrome bar-pad-both py-2">
        <LobbyFooterLinks />
      </footer>
      {showRulesPanel && (
        <RulesPanel
          onClose={() => setShowRulesPanel(false)}
          initialDocId={rulesPanelTarget?.docId}
          initialTab={rulesPanelTarget?.tab}
          gameId={gameId}
          useUpgrades={lobbyState?.use_upgrades}
        />
      )}
    </div>
  );
}
