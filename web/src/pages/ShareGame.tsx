import {
  useState,
  useRef,
  useCallback,
  useMemo,
  type ReactElement,
  type RefObject,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import type {
  ShareGameResponse,
  SharePlayerData,
  SharePlayerSnapshot,
  Card as CardType,
  PlayerView,
} from "../types";
import { ShareRoundDetail } from "../components/share/ShareRoundDetail";
import {
  buildSharePlayerViews,
  getShareBoardSnapshot,
  getSharePlayerRowBadge,
  getShareRoundLabel,
  getShareRoundValue,
  parseShareRoundValue,
  type SharePlayerRowBadge,
} from "../utils/share";
import { useShareGameData } from "../hooks/pages/useShareGame";
import { useDocumentEvent, useEscapeKey } from "../hooks/useDomEffects";
import { useViewportCardSizes } from "../hooks/useViewportCardSizes";
import { useGameShellMode } from "../hooks/useGameShellMode";
import { useElementHeight } from "../hooks/useElementHeight";
import type { ZoneConstraints } from "../hooks/computeConstrainedLayout";
import { CardPreviewContext, CardPreviewModal } from "../components/card";
import { PLAYER_ROW_STACK_CLASS, PlayerRow } from "../components/PlayerList";
import { useHotkeys } from "../hooks/useHotkeys";
import { getSidebarPlayerOrder } from "../utils/playerPlacement";
import { AppHeader, HomeButton } from "../components/common/AppHeader";
import { BoardBackdrop } from "../components/common/BoardBackdrop";
import { BottomBar } from "../components/common/FrameBar";
import { PageFrame } from "../components/common/PageFrame";
import { SidePanel } from "../components/common/SidePanel";
import { SurfaceCard } from "../components/common/SurfaceCard";
import { BusyNotice, StatusNotice } from "../components/common/StatusNotice";
import { NoticeFrame } from "../components/common/NoticeFrame";
import type { AppError } from "../utils/appError";
import { POPOVER_CHROME } from "../components/common/styles";

interface RoundOption {
  label: string;
  shortLabel: string;
  value: string;
}

function buildRoundOptions(rounds: SharePlayerSnapshot[]): RoundOption[] {
  return rounds.map((snap) => ({
    label: getShareRoundLabel(snap),
    shortLabel: getShareRoundLabel(snap, true),
    value: getShareRoundValue(snap),
  }));
}

function getLatestRoundValue(rounds: SharePlayerSnapshot[]): string {
  const latest = rounds[rounds.length - 1];
  return latest ? getShareRoundValue(latest) : "";
}

function scrollToCenter(option: HTMLButtonElement | null): void {
  option?.scrollIntoView({ block: "center" });
}

function resolveShareStatus(options: {
  sharePlayer: SharePlayerData | undefined;
  playerName: string;
  selectedPlayer: string;
  selectedRound: string;
}): SharePlayerRowBadge {
  if (options.sharePlayer) {
    return getSharePlayerRowBadge(
      options.sharePlayer,
      options.selectedPlayer,
      options.selectedRound,
    );
  }
  return options.playerName === options.selectedPlayer ? "viewing" : "dead";
}

function RoundPopover({
  options,
  selectedRound,
  anchorRef,
  onSelect,
  onClose,
}: {
  options: RoundOption[];
  selectedRound: string;
  /** Holds the popover and its button, which toggles it on the click. */
  anchorRef: RefObject<HTMLDivElement | null>;
  onSelect: (value: string) => void;
  onClose: () => void;
}): ReactElement {
  const backdropRef = useRef<HTMLDivElement>(null);

  useDocumentEvent("mousedown", (e) => {
    if (
      e.target instanceof Node &&
      (anchorRef.current?.contains(e.target) ||
        backdropRef.current?.contains(e.target))
    ) {
      return;
    }
    onClose();
  });

  useEscapeKey(onClose, { target: "document" });

  return (
    <>
      <BoardBackdrop ref={backdropRef} onTap={onClose} />
      <div
        className={`absolute bottom-full mb-4 left-2 z-50 ${POPOVER_CHROME} p-2 flex flex-col gap-1 w-max min-w-[180px] max-h-[calc(100dvh-2*var(--frame-bar-height)-1rem)] overflow-y-auto`}
      >
        {options.map((opt) => (
          <button
            key={opt.value}
            ref={opt.value === selectedRound ? scrollToCenter : undefined}
            onClick={() => {
              onSelect(opt.value);
              onClose();
            }}
            className={`menu-item text-sm py-1.5 px-3 rounded text-left transition-colors ${
              opt.value === selectedRound
                ? "text-[var(--gold-pale)]"
                : "text-[var(--ivory-muted)]"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </>
  );
}

const NOT_FOUND_CODES = new Set([
  "GAME_NOT_FOUND",
  "PLAYER_NOT_IN_GAME",
  "SHARE_DATA_NOT_FOUND",
]);

function shareErrorTitle(error: AppError): string {
  if (error.code === "GAME_IN_PROGRESS") return "Game in progress";
  if (NOT_FOUND_CODES.has(error.code)) return "Game not found";
  return "Couldn't load this game";
}

function ShareSidebarList({
  data,
  playerViews,
  sortedPlayerViews,
  selectedPlayer,
  effectiveSelectedRound,
  onSelectPlayer,
}: {
  data: ShareGameResponse;
  playerViews: PlayerView[];
  sortedPlayerViews: PlayerView[];
  selectedPlayer: string;
  effectiveSelectedRound: string;
  onSelectPlayer: (name: string) => void;
}): ReactElement {
  const sharePlayersByName = new Map(
    data.players.map((player) => [player.name, player] as const),
  );
  return (
    <div className="px-3 py-0">
      <div className={PLAYER_ROW_STACK_CLASS}>
        {sortedPlayerViews.map((pv) => {
          const shareStatus = resolveShareStatus({
            sharePlayer: sharePlayersByName.get(pv.name),
            playerName: pv.name,
            selectedPlayer,
            selectedRound: effectiveSelectedRound,
          });
          return (
            <PlayerRow
              key={pv.name}
              player={pv}
              players={playerViews}
              currentPlayerName={data.owner_name}
              isSelected={pv.name === selectedPlayer}
              variant="share"
              shareStatus={shareStatus}
              // Mid-game a rank would read as a final standing that doesn't exist yet.
              showPlacement={!data.in_progress || pv.placement > 0}
              onClick={() => onSelectPlayer(pv.name)}
            />
          );
        })}
      </div>
    </div>
  );
}

function ShareMainContent({
  hasRounds,
  currentPlayerData,
  currentSnapshot,
  effectiveSelectedRound,
  useUpgrades,
  isMobile,
  roundLayoutStateKey,
  roundResizeState,
}: {
  hasRounds: boolean;
  currentPlayerData: SharePlayerData | undefined;
  currentSnapshot: SharePlayerSnapshot | null;
  effectiveSelectedRound: string;
  useUpgrades: boolean;
  isMobile: boolean;
  roundLayoutStateKey: string | null;
  roundResizeState:
    | {
        constraints: ZoneConstraints | null;
        setConstraints: (constraints: ZoneConstraints) => void;
        clearConstraints: () => void;
      }
    | undefined;
}): ReactElement {
  if (!hasRounds) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <SurfaceCard>
          <h2 className="text-lg font-semibold text-amber-200">
            No Round Data
          </h2>
          <p className="text-sm text-[var(--ivory)] mt-2 leading-snug">
            No round data is available for this game.
          </p>
        </SurfaceCard>
      </div>
    );
  }

  if (currentPlayerData && currentSnapshot) {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <ShareRoundDetail
          player={currentPlayerData}
          snapshot={currentSnapshot}
          useUpgrades={useUpgrades}
          enableResize
          isMobile={isMobile}
          layoutStateKey={roundLayoutStateKey ?? undefined}
          resizeState={roundResizeState}
          showLayoutReset
        />
      </div>
    );
  }

  const absentMessage = parseShareRoundValue(effectiveSelectedRound)
    ?.sudden_death_build
    ? "This player did not fight in this Sudden Death."
    : "This player was not in the game during this round.";
  return (
    <div className="flex-1 flex items-center justify-center px-4">
      <SurfaceCard>
        <p className="text-sm text-[var(--ivory)] leading-snug">
          {currentPlayerData
            ? absentMessage
            : "Select a player to view their deck."}
        </p>
      </SurfaceCard>
    </div>
  );
}

function buildShareHotkeys(options: {
  enabled: boolean;
  sortedPlayerViews: PlayerView[];
  setSelectedPlayer: (name: string) => void;
}): Record<string, () => void> {
  const hotkeys: Record<string, () => void> = {};
  if (!options.enabled) return hotkeys;
  options.sortedPlayerViews.slice(0, 8).forEach((player, index) => {
    hotkeys[String(index + 1)] = (): void => {
      options.setSelectedPlayer(player.name);
    };
  });
  return hotkeys;
}

function deriveShareRoundNav(options: {
  referenceSnapshots: SharePlayerSnapshot[];
  effectiveSelectedRound: string;
  shellMode: ReturnType<typeof useGameShellMode>;
}): {
  roundOptions: RoundOption[];
  currentIndex: number;
  hasPrev: boolean;
  hasNext: boolean;
  currentRoundLabel: string;
} {
  const roundOptions = buildRoundOptions(options.referenceSnapshots);
  const currentIndex = roundOptions.findIndex(
    (o) => o.value === options.effectiveSelectedRound,
  );
  const currentRoundOption = roundOptions[currentIndex];
  const currentRoundLabel =
    (options.shellMode === "mobile"
      ? currentRoundOption?.shortLabel
      : currentRoundOption?.label) ?? "No rounds";
  return {
    roundOptions,
    currentIndex,
    hasPrev: currentIndex > 0,
    hasNext: currentIndex < roundOptions.length - 1,
    currentRoundLabel,
  };
}

function ShareFooterBar({
  bottomBarRef,
  roundOptions,
  currentIndex,
  hasPrev,
  hasNext,
  currentRoundLabel,
  effectiveSelectedRound,
  roundPopoverOpen,
  setRoundPopoverOpen,
  setSelectedRound,
}: {
  bottomBarRef: (node: HTMLDivElement | null) => void;
  roundOptions: RoundOption[];
  currentIndex: number;
  hasPrev: boolean;
  hasNext: boolean;
  currentRoundLabel: string;
  effectiveSelectedRound: string;
  roundPopoverOpen: boolean;
  setRoundPopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedRound: (round: string) => void;
}): ReactElement {
  const roundAnchorRef = useRef<HTMLDivElement>(null);
  const handleCloseRoundPopover = useCallback(
    () => setRoundPopoverOpen(false),
    [setRoundPopoverOpen],
  );
  return (
    <BottomBar
      ref={bottomBarRef}
      secondary={
        <div ref={roundAnchorRef} className="relative">
          <button
            className="btn btn-secondary"
            disabled={roundOptions.length === 0}
            onClick={() => setRoundPopoverOpen((o) => !o)}
          >
            {currentRoundLabel}
          </button>
          {roundPopoverOpen && roundOptions.length > 0 && (
            <RoundPopover
              anchorRef={roundAnchorRef}
              options={roundOptions}
              selectedRound={effectiveSelectedRound}
              onSelect={setSelectedRound}
              onClose={handleCloseRoundPopover}
            />
          )}
        </div>
      }
      main={
        <>
          <button
            className="btn btn-secondary disabled:opacity-30"
            disabled={!hasPrev}
            onClick={() => {
              if (hasPrev) {
                setSelectedRound(roundOptions[currentIndex - 1].value);
              }
            }}
          >
            Prev
          </button>
          <button
            className="btn btn-secondary disabled:opacity-30"
            disabled={!hasNext}
            onClick={() => {
              if (hasNext) {
                setSelectedRound(roundOptions[currentIndex + 1].value);
              }
            }}
          >
            Next
          </button>
        </>
      }
    />
  );
}

function ShareGameLoaded({
  data,
  setSelectedRound,
  selectedPlayer,
  setSelectedPlayer,
  sortedPlayerViews,
  playerViews,
  referenceSnapshots,
  effectiveSelectedRound,
  shellMode,
  isMobile,
  roundPopoverOpen,
  setRoundPopoverOpen,
  previewCard,
  previewUpgrades,
  setPreviewCard,
}: {
  data: ShareGameResponse;
  setSelectedRound: (round: string) => void;
  selectedPlayer: string;
  setSelectedPlayer: (player: string) => void;
  sortedPlayerViews: PlayerView[];
  playerViews: PlayerView[];
  referenceSnapshots: SharePlayerSnapshot[];
  effectiveSelectedRound: string;
  shellMode: ReturnType<typeof useGameShellMode>;
  isMobile: boolean;
  roundPopoverOpen: boolean;
  setRoundPopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  previewCard: CardType | null;
  previewUpgrades: CardType[];
  setPreviewCard: (card: CardType | null, appliedUpgrades?: CardType[]) => void;
}): ReactElement {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [deckConstraintsByView, setDeckConstraintsByView] = useState<
    Record<string, ZoneConstraints>
  >({});
  const [headerRef] = useElementHeight();
  const [bottomBarRef] = useElementHeight();
  const usesOverlaySidebar = shellMode !== "big";
  const previewContextValue = useMemo(
    () => ({ setPreviewCard }),
    [setPreviewCard],
  );

  const setDeckConstraintsForView = useCallback(
    (viewKey: string, constraints: ZoneConstraints) => {
      setDeckConstraintsByView((prev) => ({ ...prev, [viewKey]: constraints }));
    },
    [],
  );
  const clearDeckConstraintsForView = useCallback((viewKey: string) => {
    setDeckConstraintsByView((prev) => {
      if (!(viewKey in prev)) return prev;
      const next = { ...prev };
      delete next[viewKey];
      return next;
    });
  }, []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const nav = deriveShareRoundNav({
    referenceSnapshots,
    effectiveSelectedRound,
    shellMode,
  });
  const currentPlayerData = data.players.find((p) => p.name === selectedPlayer);
  const currentSnapshot = currentPlayerData
    ? getShareBoardSnapshot(currentPlayerData, effectiveSelectedRound)
    : null;
  const roundLayoutStateKey = currentSnapshot
    ? `round:${selectedPlayer}:${getShareRoundValue(currentSnapshot)}`
    : null;
  const roundResizeState = roundLayoutStateKey
    ? {
        constraints: deckConstraintsByView[roundLayoutStateKey] ?? null,
        setConstraints: (constraints: ZoneConstraints): void => {
          setDeckConstraintsForView(roundLayoutStateKey, constraints);
        },
        clearConstraints: (): void => {
          clearDeckConstraintsForView(roundLayoutStateKey);
        },
      }
    : undefined;

  const sidebarList = (
    <ShareSidebarList
      data={data}
      playerViews={playerViews}
      sortedPlayerViews={sortedPlayerViews}
      selectedPlayer={selectedPlayer}
      effectiveSelectedRound={effectiveSelectedRound}
      onSelectPlayer={(name) => {
        setSelectedPlayer(name);
        if (usesOverlaySidebar) setSidebarOpen(false);
      }}
    />
  );

  return (
    <CardPreviewContext.Provider value={previewContextValue}>
      <PageFrame
        header={
          <AppHeader
            ref={headerRef}
            helpers={
              data.cube_id && (
                <a
                  href={`https://cubecobra.com/cube/overview/${encodeURIComponent(data.cube_id)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary hidden sm:inline-flex items-center"
                >
                  CubeCobra ↗
                </a>
              )
            }
            home={<HomeButton />}
            account={
              usesOverlaySidebar && (
                <button
                  onClick={() => setSidebarOpen((o) => !o)}
                  className="btn btn-secondary btn-icon"
                  aria-label="Players"
                >
                  ☰
                </button>
              )
            }
          />
        }
        scroll={false}
        aside={
          usesOverlaySidebar ? undefined : (
            <aside className="w-[var(--sidebar-width)] h-full frame-chrome flex flex-col overflow-hidden">
              <div className="overflow-y-auto flex-1 pt-3">{sidebarList}</div>
            </aside>
          )
        }
        footer={
          <ShareFooterBar
            bottomBarRef={bottomBarRef}
            roundOptions={nav.roundOptions}
            currentIndex={nav.currentIndex}
            hasPrev={nav.hasPrev}
            hasNext={nav.hasNext}
            currentRoundLabel={nav.currentRoundLabel}
            effectiveSelectedRound={effectiveSelectedRound}
            roundPopoverOpen={roundPopoverOpen}
            setRoundPopoverOpen={setRoundPopoverOpen}
            setSelectedRound={setSelectedRound}
          />
        }
      >
        <ShareMainContent
          hasRounds={nav.roundOptions.length > 0}
          currentPlayerData={currentPlayerData}
          currentSnapshot={currentSnapshot}
          effectiveSelectedRound={effectiveSelectedRound}
          useUpgrades={data.use_upgrades}
          isMobile={isMobile}
          roundLayoutStateKey={roundLayoutStateKey}
          roundResizeState={roundResizeState}
        />
        {usesOverlaySidebar && (
          <SidePanel
            open={sidebarOpen}
            title="Players"
            onClose={closeSidebar}
            closeOnBoardTap
          >
            <div className="overflow-y-auto flex-1 pt-3">{sidebarList}</div>
          </SidePanel>
        )}
      </PageFrame>
      {previewCard && (
        <CardPreviewModal
          card={previewCard}
          appliedUpgrades={previewUpgrades}
          onClose={() => setPreviewCard(null)}
        />
      )}
    </CardPreviewContext.Provider>
  );
}

function deriveShareBoardState(
  data: ShareGameResponse | null,
  selectedRound: string,
): {
  referenceSnapshots: SharePlayerSnapshot[];
  effectiveSelectedRound: string;
  playerViews: PlayerView[];
  sortedPlayerViews: PlayerView[];
} {
  const ownerPlayer = data?.players.find((p) => p.name === data.owner_name);
  const referenceSnapshots =
    ownerPlayer?.snapshots ?? data?.players[0]?.snapshots ?? [];
  const latestRoundValue = getLatestRoundValue(referenceSnapshots);
  const selectedRoundExists = referenceSnapshots.some(
    (snapshot) => getShareRoundValue(snapshot) === selectedRound,
  );
  const effectiveSelectedRound = selectedRoundExists
    ? selectedRound
    : latestRoundValue;
  const playerViews = buildSharePlayerViews(data, effectiveSelectedRound);
  const sortedPlayerViews = getSidebarPlayerOrder(playerViews);
  return {
    referenceSnapshots,
    effectiveSelectedRound,
    playerViews,
    sortedPlayerViews,
  };
}

export function ShareGame(): ReactElement {
  const { gameId, playerName } = useParams<{
    gameId: string;
    playerName: string;
  }>();
  const navigate = useNavigate();
  const sizes = useViewportCardSizes();
  const shellMode = useGameShellMode();
  const {
    data,
    error,
    loading,
    selectedRound,
    setSelectedRound,
    selectedPlayer,
    setSelectedPlayer,
  } = useShareGameData(gameId, playerName);
  const [roundPopoverOpen, setRoundPopoverOpen] = useState(false);
  const [previewCard, setPreviewCardState] = useState<CardType | null>(null);
  const [previewUpgrades, setPreviewUpgrades] = useState<CardType[]>([]);

  const setPreviewCard = useCallback(
    (card: CardType | null, appliedUpgrades?: CardType[]) => {
      setPreviewCardState(card);
      setPreviewUpgrades(appliedUpgrades ?? []);
    },
    [],
  );

  const board = deriveShareBoardState(data, selectedRound);

  useHotkeys(
    buildShareHotkeys({
      enabled: shellMode === "big" && !previewCard && !roundPopoverOpen,
      sortedPlayerViews: board.sortedPlayerViews,
      setSelectedPlayer,
    }),
    true,
  );

  if (loading) {
    return (
      <NoticeFrame>
        <BusyNotice label="Loading game..." />
      </NoticeFrame>
    );
  }

  if (error || !data) {
    return (
      <NoticeFrame>
        <StatusNotice
          title={error ? shareErrorTitle(error) : "Game not found"}
          actions={
            <button
              onClick={() => {
                void navigate("/");
              }}
              className="btn btn-secondary flex-1 py-2"
            >
              Home
            </button>
          }
        >
          {error?.message ?? "This game is no longer available to share."}
        </StatusNotice>
      </NoticeFrame>
    );
  }

  return (
    <ShareGameLoaded
      data={data}
      setSelectedRound={setSelectedRound}
      selectedPlayer={selectedPlayer}
      setSelectedPlayer={setSelectedPlayer}
      sortedPlayerViews={board.sortedPlayerViews}
      playerViews={board.playerViews}
      referenceSnapshots={board.referenceSnapshots}
      effectiveSelectedRound={board.effectiveSelectedRound}
      shellMode={shellMode}
      isMobile={sizes.isMobile}
      roundPopoverOpen={roundPopoverOpen}
      setRoundPopoverOpen={setRoundPopoverOpen}
      previewCard={previewCard}
      previewUpgrades={previewUpgrades}
      setPreviewCard={setPreviewCard}
    />
  );
}
