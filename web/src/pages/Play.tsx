/** Play setup route for launching Goldfish or Play with Friends games. */
import { useState, useRef, useCallback, type ReactElement } from "react";
import { useSearchParams } from "react-router-dom";
import { useToast } from "../contexts";
import { useAuth } from "../contexts/authState";
import { useCubeLook } from "../hooks/useCubeLook";
import { useBoardDesktop } from "../hooks/useBoardDesktop";
import { useHotkeys } from "../hooks/useHotkeys";
import {
  useGuestName,
  usePlayCubeWarmup,
  useRestoreButtonFocus,
  useStartFlow,
  type OpponentCount,
} from "../hooks/useStartFlow";
import { AppHeader, HomeButton } from "../components/common/AppHeader";
import {
  useResumableGames,
  type ResumableSeat,
} from "../hooks/useResumableGames";
import { SegmentedFilter } from "../components/dashboard/SegmentedFilter";
import {
  getDefaultNewPlayerPreference,
  setGlobalGuidedModePreference,
} from "../utils/deviceIdentity";
import type { PlayMode } from "../types";
import {
  buildStripLabel,
  MODE_OPTIONS,
  parseOpponentCount,
  PersonRow,
  PlayBoardLayout,
  PlayCompactLayout,
  PlayOptionsFields,
  PlayOverlays,
  StartFlowLoadingScreen,
  type ActiveMode,
  type PlayView,
} from "./PlayViews";

function getNotEnoughPuppetsAvailable(
  state: ReturnType<typeof useStartFlow>["state"],
): number | null {
  if (state.kind !== "failed" || state.reason !== "not_enough_puppets") {
    return null;
  }
  return state.availablePuppets ?? 0;
}

function isStartFlowActive(
  state: ReturnType<typeof useStartFlow>["state"],
): boolean {
  return state.kind === "creating" || state.kind === "waiting_for_start";
}

function cubeLookId(bannerCubeId: string, playMode: PlayMode): string | null {
  if (bannerCubeId) return bannerCubeId;
  return playMode === "limited" ? "auto" : null;
}

function isEscapeToSetupEnabled(options: {
  view: PlayView;
  showJoinModal: boolean;
  showAllGames: boolean;
  seatToClose: ResumableSeat | null;
}): boolean {
  return (
    options.view !== "setup" &&
    !options.showJoinModal &&
    !options.showAllGames &&
    !options.seatToClose
  );
}

export function Play(): ReactElement {
  const [searchParams] = useSearchParams();
  const { addToast } = useToast();
  const resumableGames = useResumableGames();

  const { user } = useAuth();
  const [guestName, setGuestName, nameLoading] = useGuestName();
  const playerName = user ? user.username : guestName;
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [view, setView] = useState<PlayView>("setup");
  const [showAllGames, setShowAllGames] = useState(false);
  const [seatToClose, setSeatToClose] = useState<ResumableSeat | null>(null);
  const [closedIds, setClosedIds] = useState<string[]>([]);
  const stripButtonRef = useRef<HTMLButtonElement>(null);
  const restoreStripFocusRef = useRef(false);
  const isBoard = useBoardDesktop();
  const [cubeId, setCubeId] = useState(
    () => searchParams.get("cubeId") || "auto",
  );
  // The banner follows the ID when Change settings closes, rather than asking the server about each key typed.
  const [bannerCubeId, setBannerCubeId] = useState(() => cubeId.trim());
  const [useUpgrades, setUseUpgrades] = useState(
    () => searchParams.get("useUpgrades") !== "false",
  );
  const [playMode, setPlayMode] = useState<PlayMode>(() =>
    searchParams.get("playMode") === "constructed" ? "constructed" : "limited",
  );
  const [opponents, setOpponents] = useState<OpponentCount>(() =>
    parseOpponentCount(searchParams.get("puppetCount")),
  );
  const [autoApproveSpectators, setAutoApproveSpectators] = useState(false);
  const [activeMode, setActiveMode] = useState<ActiveMode>("solo");
  const [isGuidedMode, setIsGuidedMode] = useState(() =>
    getDefaultNewPlayerPreference(),
  );

  const startFlow = useStartFlow(addToast);
  usePlayCubeWarmup(cubeId);

  const handleGuidedModeToggle = useCallback((nextValue: boolean) => {
    setIsGuidedMode(nextValue);
    setGlobalGuidedModePreference(nextValue);
  }, []);

  const launchMode = (
    mode: ActiveMode,
    opponentOverride?: OpponentCount,
  ): void => {
    void startFlow.start({
      mode,
      playerName,
      cubeId,
      playMode,
      useUpgrades,
      opponents: opponentOverride ?? opponents,
      autoApproveSpectators,
      isGuidedMode,
      isAuthenticated: Boolean(user),
    });
  };

  const nameValid = playerName.trim().length > 0;
  const flowActive = isStartFlowActive(startFlow.state);
  const handleNameEnter = (): void => {
    if (!nameValid || flowActive) return;
    launchMode(activeMode);
  };

  const cubeLook = useCubeLook(cubeLookId(bannerCubeId, playMode));
  const seats = resumableGames.filter(
    (seat) => !closedIds.includes(seat.gameId),
  );

  const showView = (next: PlayView, byKeyboard = false): void => {
    if (view === "options") setBannerCubeId(cubeId.trim());
    setView(next);
    // The button a key pressed can leave with its view (and in Board moves between the art slot and words).
    if (byKeyboard) {
      restoreStripFocusRef.current = true;
      stripButtonRef.current?.focus({ preventScroll: true });
    }
  };
  useRestoreButtonFocus({
    buttonRef: stripButtonRef,
    shouldRestoreRef: restoreStripFocusRef,
    view,
    bannerCubeId,
  });
  useHotkeys(
    { escape: () => showView("setup", true) },
    isEscapeToSetupEnabled({
      view,
      showJoinModal,
      showAllGames,
      seatToClose,
    }),
  );

  if (flowActive) {
    return (
      <StartFlowLoadingScreen
        state={startFlow.state}
        playMode={playMode}
        onCancel={startFlow.cancel}
      />
    );
  }

  const stripLabel = buildStripLabel({
    view,
    playMode,
    activeMode,
    opponents,
    useUpgrades,
  });

  const header = (
    <AppHeader
      helpers={
        <button
          onClick={() => setShowJoinModal(true)}
          className="btn btn-secondary hidden sm:inline-block"
        >
          Join Game
        </button>
      }
      home={<HomeButton />}
    />
  );

  const changeButton = (
    <button
      ref={stripButtonRef}
      type="button"
      onClick={() => showView(view === "setup" ? "options" : "setup", false)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          restoreStripFocusRef.current = true;
        }
      }}
      className="btn btn-secondary btn-pill"
    >
      {view === "setup" ? "Change settings" : "Back"}
    </button>
  );

  const modeSwitch = (
    <SegmentedFilter
      label="How to play"
      options={MODE_OPTIONS}
      value={activeMode}
      onChange={setActiveMode}
      variant="field"
    />
  );

  const personRow = (
    <PersonRow
      isAuthenticated={Boolean(user)}
      playerName={playerName}
      nameLoading={nameLoading}
      onNameChange={setGuestName}
      onNameEnter={handleNameEnter}
      isGuidedMode={isGuidedMode}
      onGuidedModeToggle={handleGuidedModeToggle}
    />
  );

  const startButton = (
    <button
      onClick={() => launchMode(activeMode)}
      disabled={!nameValid}
      className="btn btn-primary setup-next"
    >
      {activeMode === "solo" ? "Start Game" : "Create Lobby"}
    </button>
  );

  const optionsFields = (
    <PlayOptionsFields
      cubeId={cubeId}
      onCubeIdChange={setCubeId}
      playMode={playMode}
      onPlayModeChange={setPlayMode}
      activeMode={activeMode}
      opponents={opponents}
      onOpponentsChange={setOpponents}
      autoApproveSpectators={autoApproveSpectators}
      onAutoApproveChange={setAutoApproveSpectators}
      useUpgrades={useUpgrades}
      onUseUpgradesChange={setUseUpgrades}
      onDone={(byKeyboard) => showView("setup", byKeyboard)}
    />
  );

  return (
    <>
      {isBoard ? (
        <PlayBoardLayout
          header={header}
          playerName={playerName}
          activeMode={activeMode}
          opponents={opponents}
          seats={seats}
          cubeLook={cubeLook}
          playMode={playMode}
          stripLabel={stripLabel}
          view={view}
          changeButton={changeButton}
          modeSwitch={modeSwitch}
          personRow={personRow}
          startButton={startButton}
          optionsFields={optionsFields}
          onEscapeOptions={() => showView("setup", true)}
          onShowAllGames={() => setShowAllGames(true)}
          onCloseSeat={setSeatToClose}
        />
      ) : (
        <PlayCompactLayout
          header={header}
          cubeLook={cubeLook}
          playMode={playMode}
          stripLabel={stripLabel}
          view={view}
          activeMode={activeMode}
          seats={seats}
          changeButton={changeButton}
          modeSwitch={modeSwitch}
          personRow={personRow}
          startButton={startButton}
          optionsFields={optionsFields}
          onOpenJoinModal={() => setShowJoinModal(true)}
          onEscapeOptions={() => showView("setup", true)}
          onShowAllGames={() => setShowAllGames(true)}
          onCloseSeat={setSeatToClose}
        />
      )}

      <PlayOverlays
        showJoinModal={showJoinModal}
        showAllGames={showAllGames}
        seatToClose={seatToClose}
        seats={seats}
        notEnoughPuppets={getNotEnoughPuppetsAvailable(startFlow.state)}
        opponents={opponents}
        onCloseJoinModal={() => setShowJoinModal(false)}
        onCloseAllGames={() => setShowAllGames(false)}
        onSelectSeatToClose={setSeatToClose}
        onKeepSeat={() => setSeatToClose(null)}
        onSeatClosed={(gameId) => {
          setClosedIds((ids) => [...ids, gameId]);
          setSeatToClose(null);
        }}
        onCancelPuppets={startFlow.cancel}
        onSelectRecoveryCount={(count) => launchMode("solo", count)}
      />
    </>
  );
}
