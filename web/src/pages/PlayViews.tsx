/** Layout, options, and modal view components extracted from Play.tsx. */
import { useState, type KeyboardEvent, type ReactElement } from "react";
import type { CubeLook } from "../hooks/useCubeLook";
import type { ResumableSeat } from "../hooks/useResumableGames";
import type { OpponentCount, useStartFlow } from "../hooks/useStartFlow";
import { GoldfishIcon } from "../components/icons/GoldfishIcon";
import { JoinGameModal } from "../components/home/JoinGameModal";
import { LoadingScreen } from "../components/common/LoadingScreen";
import {
  goldfishSteps,
  loadStep,
  newLobbySteps,
} from "../components/common/loadingSteps";
import { PageFrame } from "../components/common/PageFrame";
import { ZoneLabel } from "../components/common/ZoneLabel";
import { PlayerCard } from "../components/PlayerCard";
import { PLAYER_ROW_STACK_CLASS } from "../components/PlayerList";
import {
  CloseSeatDialog,
  ResumeGamesDialog,
  ResumeShelf,
} from "../components/ResumeGame";
import { SurfaceCard } from "../components/common/SurfaceCard";
import { InfoTip } from "../components/common/InfoTip";
import { Switch } from "../components/common/Switch";
import { UPGRADES_HELP } from "../constants/rules";
import {
  BoardArt,
  BoardCubeTitle,
  BoardDrawerHead,
  BoardPlayGames,
  SeatLead,
} from "../components/setup/BoardParts";
import { CubeBanner } from "../components/setup/CubeBanner";
import { GuidedSwitch } from "../components/setup/GuidedSwitch";
import { SegmentedFilter } from "../components/dashboard/SegmentedFilter";
import type { PlayMode } from "../types";
import { DIALOG_BACKDROP } from "../components/common/styles";

export type ActiveMode = "friends" | "solo";
export type PlayView = "setup" | "options";
export const OPPONENT_OPTIONS: OpponentCount[] = [1, 3, 5, 7];

export function parseOpponentCount(raw: string | null): OpponentCount {
  const num = Number(raw);
  return OPPONENT_OPTIONS.find((option) => option === num) ?? 3;
}

export function buildStripLabel(options: {
  view: PlayView;
  playMode: PlayMode;
  activeMode: ActiveMode;
  opponents: OpponentCount;
  useUpgrades: boolean;
}): string {
  if (options.view === "options") {
    return options.activeMode === "solo"
      ? "Goldfish options"
      : "Friends options";
  }
  const opponentPart =
    options.activeMode === "solo"
      ? [
          `${options.opponents}\u00a0${options.opponents === 1 ? "opponent" : "opponents"}`,
        ]
      : [];
  // Its spaces don't break, so a line that wraps does so only after a dot.
  return [
    options.playMode === "constructed" ? "Constructed" : "Limited",
    ...opponentPart,
    `Upgrades\u00a0${options.useUpgrades ? "On" : "Off"}`,
  ].join("\u00a0· ");
}

function handleEscapeToSetup(
  event: KeyboardEvent<HTMLElement>,
  onEscape: () => void,
): void {
  if (event.key !== "Escape" || event.nativeEvent.isComposing) return;
  event.stopPropagation();
  onEscape();
}

function FriendsIcon({ className }: { className: string }): ReactElement {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
      />
    </svg>
  );
}

export const MODE_OPTIONS = [
  {
    value: "solo" as const,
    label: (
      <>
        <GoldfishIcon className="setup-mode-icon" />
        Goldfish
      </>
    ),
  },
  {
    value: "friends" as const,
    label: (
      <>
        <FriendsIcon className="setup-mode-icon" />
        Play with Friends
      </>
    ),
  },
];

const PLAY_MODE_OPTIONS = [
  { value: "limited" as const, label: "Limited" },
  { value: "constructed" as const, label: "Constructed" },
];

const PITCHES: Record<ActiveMode, string> = {
  solo: "Fight historically winning hands, played face up. Move their cards and decide who would have won.",
  friends:
    "See who is the best drafter. Everybody starts with trash, and it's up to you to turn it into treasure!",
};

function ModePitch({ mode }: { mode: ActiveMode }): ReactElement {
  return (
    <div className="setup-pitch">
      {MODE_OPTIONS.map(({ value }) => (
        <p
          key={value}
          className={value === mode ? "" : "invisible"}
          aria-hidden={value !== mode}
        >
          {PITCHES[value]}
        </p>
      ))}
    </div>
  );
}

export function StartFlowLoadingScreen({
  state,
  playMode,
  onCancel,
}: {
  state: ReturnType<typeof useStartFlow>["state"];
  playMode: PlayMode;
  onCancel: () => void;
}): ReactElement | null {
  if (state.kind !== "creating" && state.kind !== "waiting_for_start") {
    return null;
  }
  if (state.mode === "solo") {
    const loadingCube =
      state.kind === "creating" || state.step === "loading_cube";
    return (
      <LoadingScreen
        steps={goldfishSteps(playMode)}
        current={loadingCube ? loadStep(playMode) : "Deal cards"}
        onCancel={onCancel}
      />
    );
  }
  return (
    <LoadingScreen
      title="Opening lobby"
      steps={newLobbySteps(playMode)}
      current={loadStep(playMode)}
      onCancel={onCancel}
    />
  );
}

export function PlayOptionsFields({
  cubeId,
  onCubeIdChange,
  playMode,
  onPlayModeChange,
  activeMode,
  opponents,
  onOpponentsChange,
  autoApproveSpectators,
  onAutoApproveChange,
  useUpgrades,
  onUseUpgradesChange,
  onDone,
}: {
  cubeId: string;
  onCubeIdChange: (value: string) => void;
  playMode: PlayMode;
  onPlayModeChange: (value: PlayMode) => void;
  activeMode: ActiveMode;
  opponents: OpponentCount;
  onOpponentsChange: (value: OpponentCount) => void;
  autoApproveSpectators: boolean;
  onAutoApproveChange: (value: boolean) => void;
  useUpgrades: boolean;
  onUseUpgradesChange: (value: boolean) => void;
  onDone: (byKeyboard: boolean) => void;
}): ReactElement {
  return (
    <>
      <label className="setup-field">
        <span className="setup-caption">CubeCobra ID</span>
        <input
          type="text"
          value={cubeId}
          onChange={(e) => onCubeIdChange(e.target.value)}
          placeholder="auto"
          className="setup-input"
        />
      </label>
      <SegmentedFilter
        label="Limited or Constructed"
        options={PLAY_MODE_OPTIONS}
        value={playMode}
        onChange={onPlayModeChange}
        variant="field"
      />
      {activeMode === "solo" ? (
        <div className="setup-row">
          <span className="setup-row-label">Opponents</span>
          <SegmentedFilter
            label="Opponents"
            options={OPPONENT_OPTIONS.map((n) => ({
              value: String(n),
              label: n,
            }))}
            value={String(opponents)}
            onChange={(value) => onOpponentsChange(parseOpponentCount(value))}
            variant="field"
          />
        </div>
      ) : (
        <Switch
          spread
          checked={autoApproveSpectators}
          onChange={onAutoApproveChange}
        >
          Open Spectating · let anyone watch
        </Switch>
      )}
      <Switch
        spread
        checked={useUpgrades}
        onChange={onUseUpgradesChange}
        tip={<InfoTip label="What upgrades are" text={UPGRADES_HELP} />}
      >
        Upgrades
      </Switch>
      <button
        onClick={(event) => onDone(event.detail === 0)}
        className="btn btn-primary setup-next"
      >
        Done
      </button>
    </>
  );
}

export function PersonRow({
  isAuthenticated,
  playerName,
  nameLoading,
  onNameChange,
  onNameEnter,
  isGuidedMode,
  onGuidedModeToggle,
}: {
  isAuthenticated: boolean;
  playerName: string;
  nameLoading: boolean;
  onNameChange: (value: string) => void;
  onNameEnter: () => void;
  isGuidedMode: boolean;
  onGuidedModeToggle: (enabled: boolean) => void;
}): ReactElement {
  return (
    <div className="setup-row">
      {isAuthenticated ? (
        <div className="setup-field">
          <span className="setup-caption">Your name</span>
          <span className="setup-value">{playerName}</span>
        </div>
      ) : (
        <label className="setup-field">
          <span className="setup-caption">Your name</span>
          <input
            id="player-name"
            type="text"
            value={nameLoading ? "" : playerName}
            onChange={(e) => onNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onNameEnter();
            }}
            disabled={nameLoading}
            placeholder={nameLoading ? "Generating name..." : "Enter your name"}
            className="setup-input"
          />
        </label>
      )}
      <GuidedSwitch enabled={isGuidedMode} setEnabled={onGuidedModeToggle} />
    </div>
  );
}

export function PlayBoardLayout({
  header,
  playerName,
  activeMode,
  opponents,
  seats,
  cubeLook,
  playMode,
  stripLabel,
  view,
  changeButton,
  modeSwitch,
  personRow,
  startButton,
  optionsFields,
  onEscapeOptions,
  onShowAllGames,
  onCloseSeat,
}: {
  header: ReactElement;
  playerName: string;
  activeMode: ActiveMode;
  opponents: OpponentCount;
  seats: ResumableSeat[];
  cubeLook: CubeLook | null;
  playMode: PlayMode;
  stripLabel: string;
  view: PlayView;
  changeButton: ReactElement;
  modeSwitch: ReactElement;
  personRow: ReactElement;
  startButton: ReactElement;
  optionsFields: ReactElement;
  onEscapeOptions: () => void;
  onShowAllGames: () => void;
  onCloseSeat: (seat: ResumableSeat) => void;
}): ReactElement {
  const isGoldfish = activeMode === "solo";
  const previewOthers = Array.from(
    { length: isGoldfish ? opponents : 3 },
    (_, i) => ({
      id: `${isGoldfish ? "puppet" : "open"}-${i + 1}`,
      name: isGoldfish ? `Puppet\u00a0${i + 1}` : "Open seat",
    }),
  );
  const showEmptySlot = cubeLook === null && view === "setup";

  return (
    <PageFrame
      header={header}
      scroll={false}
      contentClassName="setup-page board-page"
      hints="play"
      aside={
        <aside aria-label="At the table" className="board-aside frame-chrome">
          <BoardDrawerHead />
          <div className="board-seats">
            <div className={PLAYER_ROW_STACK_CLASS}>
              <PlayerCard
                isSelf
                lead={<SeatLead who="person" />}
                name={playerName || "\u00a0"}
              >
                {!isGoldfish && <span className="player-card-label">Host</span>}
              </PlayerCard>
              {previewOthers.map((seat) => (
                <PlayerCard
                  key={seat.id}
                  isOpen={!isGoldfish}
                  lead={<SeatLead who={isGoldfish ? "puppet" : "open"} />}
                  name={seat.name}
                >
                  {isGoldfish && (
                    <span className="player-card-label">Puppet</span>
                  )}
                </PlayerCard>
              ))}
            </div>
          </div>
          <BoardPlayGames
            seats={seats}
            onShowAll={onShowAllGames}
            onClose={onCloseSeat}
          />
        </aside>
      }
    >
      <div className="board-layout">
        <section className="zone-hand board-cube">
          <BoardArt
            look={cubeLook}
            empty={
              showEmptySlot ? (
                <div className="board-slot-entry">
                  <span className="setup-caption">Your deck</span>
                  {changeButton}
                </div>
              ) : undefined
            }
          />
          <div className="board-words">
            <BoardCubeTitle look={cubeLook} playMode={playMode} />
            <p className="board-summary">{stripLabel}</p>
            {!showEmptySlot && <div>{changeButton}</div>}
          </div>
        </section>
        <section
          role="presentation"
          className="zone-battlefield board-setup"
          onKeyDown={
            view === "options"
              ? (event): void => handleEscapeToSetup(event, onEscapeOptions)
              : undefined
          }
        >
          <ZoneLabel hideGrip>
            {view === "options" ? "Options" : "New game"}
          </ZoneLabel>
          <div className="board-two">
            {view === "options" ? (
              <div className="board-options">{optionsFields}</div>
            ) : (
              <>
                <div className="board-stack">
                  {modeSwitch}
                  <ModePitch mode={activeMode} />
                </div>
                <div className="board-stack">
                  {personRow}
                  {startButton}
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </PageFrame>
  );
}

export function PlayCompactLayout({
  header,
  cubeLook,
  playMode,
  stripLabel,
  view,
  activeMode,
  seats,
  changeButton,
  modeSwitch,
  personRow,
  startButton,
  optionsFields,
  onOpenJoinModal,
  onEscapeOptions,
  onShowAllGames,
  onCloseSeat,
}: {
  header: ReactElement;
  cubeLook: CubeLook | null;
  playMode: PlayMode;
  stripLabel: string;
  view: PlayView;
  activeMode: ActiveMode;
  seats: ResumableSeat[];
  changeButton: ReactElement;
  modeSwitch: ReactElement;
  personRow: ReactElement;
  startButton: ReactElement;
  optionsFields: ReactElement;
  onOpenJoinModal: () => void;
  onEscapeOptions: () => void;
  onShowAllGames: () => void;
  onCloseSeat: (seat: ResumableSeat) => void;
}): ReactElement {
  return (
    <PageFrame
      header={header}
      scroll={false}
      contentClassName="setup-page"
      hints="play"
    >
      <CubeBanner look={cubeLook} playMode={playMode}>
        <p className="setup-summary">{stripLabel}</p>
        {changeButton}
      </CubeBanner>

      {view === "setup" && (
        <>
          <div className="setup-felt play-felt">
            {modeSwitch}
            <ModePitch mode={activeMode} />
            {personRow}
            <div className="play-actions">
              {activeMode === "friends" && (
                <button
                  onClick={onOpenJoinModal}
                  className="btn btn-secondary setup-next play-join"
                >
                  Join Game
                </button>
              )}
              {startButton}
            </div>
          </div>
          <ResumeShelf
            seats={seats}
            reserveSpace
            onCloseSeat={onCloseSeat}
            onShowAll={onShowAllGames}
          />
        </>
      )}

      {view === "options" && (
        <div
          role="presentation"
          className="setup-felt play-felt"
          // Hotkeys skip keys from inputs, which every field and switch here is.
          onKeyDown={(event) => handleEscapeToSetup(event, onEscapeOptions)}
        >
          {optionsFields}
        </div>
      )}
    </PageFrame>
  );
}

function RecoveryOpponentPicker({
  counts,
  onSelect,
}: {
  counts: OpponentCount[];
  onSelect: (count: OpponentCount) => void;
}): ReactElement {
  const [selected, setSelected] = useState<OpponentCount | null>(null);
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex gap-2">
        {counts.map((n) => (
          <button
            key={n}
            onClick={() => setSelected(n)}
            className={`btn ${selected === n ? "btn-primary" : "btn-secondary"} text-sm font-medium`}
          >
            {n}
          </button>
        ))}
      </div>
      <span className="text-[var(--ivory-muted)] text-xs">opponents</span>
      {selected !== null && (
        <button
          onClick={() => onSelect(selected)}
          className="btn btn-primary py-2 px-6"
        >
          Start
        </button>
      )}
    </div>
  );
}

function NotEnoughPuppetsModal({
  opponents,
  maxAvailablePuppets,
  validRecoveryCounts,
  onCancel,
  onSelectCount,
}: {
  opponents: OpponentCount;
  maxAvailablePuppets: number | null;
  validRecoveryCounts: OpponentCount[];
  onCancel: () => void;
  onSelectCount: (count: OpponentCount) => void;
}): ReactElement {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        role="presentation"
        className={`absolute inset-0 ${DIALOG_BACKDROP}`}
        onClick={onCancel}
      />
      <SurfaceCard className="relative text-center">
        <h2 className="text-xl font-bold text-white mb-4">
          Not enough puppet data
        </h2>
        <p className="text-[var(--ivory-muted)] mb-6">
          You requested {opponents} opponent{opponents > 1 && "s"}, but only{" "}
          {maxAvailablePuppets} {maxAvailablePuppets === 1 ? "is" : "are"}{" "}
          available for this cube.
        </p>
        {validRecoveryCounts.length > 0 ? (
          <>
            <p className="text-[var(--ivory-muted)] text-sm mb-3">Play with:</p>
            <RecoveryOpponentPicker
              counts={validRecoveryCounts}
              onSelect={onSelectCount}
            />
          </>
        ) : (
          <p className="text-[var(--ivory-muted)] text-sm mb-4">
            No puppet data exists for this cube yet. Play with friends to
            generate data.
          </p>
        )}
        <button onClick={onCancel} className="btn btn-secondary py-2 px-6 mt-4">
          Cancel
        </button>
      </SurfaceCard>
    </div>
  );
}

export function PlayOverlays({
  showJoinModal,
  showAllGames,
  seatToClose,
  seats,
  notEnoughPuppets,
  opponents,
  onCloseJoinModal,
  onCloseAllGames,
  onSelectSeatToClose,
  onKeepSeat,
  onSeatClosed,
  onCancelPuppets,
  onSelectRecoveryCount,
}: {
  showJoinModal: boolean;
  showAllGames: boolean;
  seatToClose: ResumableSeat | null;
  seats: ResumableSeat[];
  notEnoughPuppets: number | null;
  opponents: OpponentCount;
  onCloseJoinModal: () => void;
  onCloseAllGames: () => void;
  onSelectSeatToClose: (seat: ResumableSeat) => void;
  onKeepSeat: () => void;
  onSeatClosed: (gameId: string) => void;
  onCancelPuppets: () => void;
  onSelectRecoveryCount: (count: OpponentCount) => void;
}): ReactElement {
  const validRecoveryCounts = OPPONENT_OPTIONS.filter(
    (n) => notEnoughPuppets !== null && n <= notEnoughPuppets,
  );
  return (
    <>
      {showJoinModal && <JoinGameModal onClose={onCloseJoinModal} />}
      {showAllGames && (
        <ResumeGamesDialog
          seats={seats}
          onClose={onCloseAllGames}
          onCloseSeat={onSelectSeatToClose}
        />
      )}
      {seatToClose && (
        <CloseSeatDialog
          seat={seatToClose}
          onKeep={onKeepSeat}
          onClosed={() => onSeatClosed(seatToClose.gameId)}
        />
      )}
      {notEnoughPuppets !== null && (
        <NotEnoughPuppetsModal
          opponents={opponents}
          maxAvailablePuppets={notEnoughPuppets}
          validRecoveryCounts={validRecoveryCounts}
          onCancel={onCancelPuppets}
          onSelectCount={onSelectRecoveryCount}
        />
      )}
    </>
  );
}
