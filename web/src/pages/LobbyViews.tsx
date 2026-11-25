/** Extracted view components for the Lobby route. */
import { useRef, type ReactElement } from "react";
import type { useVoiceChat } from "../hooks/useVoiceChat";
import type { RulesPanelTarget } from "../components/RulesPanel";
import type { CubeLook } from "../hooks/useCubeLook";
import { PageFrame } from "../components/common/PageFrame";
import { ZoneLabel } from "../components/common/ZoneLabel";
import { InfoTip } from "../components/common/InfoTip";
import { Switch } from "../components/common/Switch";
import { LobbySeats } from "../components/lobby/LobbySeats";
import {
  BoardArt,
  BoardCubeTitle,
  BoardDrawerHead,
  BoardLobbySeats,
} from "../components/setup/BoardParts";
import { CubeBanner } from "../components/setup/CubeBanner";
import { GuidedSwitch } from "../components/setup/GuidedSwitch";
import { CrossIcon } from "../components/icons/CrossIcon";
import { Spinner } from "../components/icons/Spinner";
import { DIALOG_BACKDROP, POPOVER_CHROME } from "../components/common/styles";
import type { LobbyPlayer, LobbyState } from "../types";
import {
  cubeCobraUrl,
  derivePlayerCapStep,
  startBlocker,
  type PlayerCapStep,
} from "./lobbyState";

const VOICE_HELP =
  "Voice chat may not work for all players. If it doesn't connect, use Discord instead.";

export function ReconnectingOverlay(): ReactElement {
  return (
    <div
      className={`fixed inset-0 z-50 ${DIALOG_BACKDROP} flex items-center justify-center`}
    >
      <div className={`${POPOVER_CHROME} px-5 py-3 flex items-center gap-3`}>
        <Spinner className="h-4 w-4 shrink-0 text-[var(--color-gold)]" />
        <span className="text-sm text-[var(--ivory)]">Reconnecting...</span>
      </div>
    </div>
  );
}

function AwayHostNotice({
  name,
  className,
}: {
  name: string;
  className: string;
}): ReactElement {
  return (
    <p className={`${className} ${name.length > 22 ? "is-long" : ""}`}>
      <svg
        aria-hidden
        className="h-3.5 w-3.5 shrink-0 text-[var(--color-gold)]"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
          clipRule="evenodd"
        />
      </svg>
      <span>
        <b>{name}</b> (host) is away. If they&apos;re not back within a minute,
        the next player becomes host.
      </span>
    </p>
  );
}

function HostChangedNotice({
  name,
  text,
  onClose,
  className,
}: {
  name: string;
  text: string;
  onClose: () => void;
  className: string;
}): ReactElement {
  return (
    <p className={`${className} ${name.length > 22 ? "is-long" : ""}`}>
      <svg
        aria-hidden
        className="h-4 w-4 shrink-0 text-[var(--color-gold)]"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path d="M2 6l4 3 4-6 4 6 4-3-1.5 9h-13z" />
      </svg>
      <span className="flex-1">{text}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss"
        className="icon-target"
      >
        <CrossIcon />
      </button>
    </p>
  );
}

function HostNotice({
  hostChange,
  awayHost,
  className,
  onDismissHostChange,
}: {
  hostChange: { name: string; text: string } | null;
  awayHost: LobbyPlayer | null;
  className: string;
  onDismissHostChange: () => void;
}): ReactElement | null {
  if (hostChange) {
    return (
      <HostChangedNotice
        {...hostChange}
        className={className}
        onClose={onDismissHostChange}
      />
    );
  }
  if (!awayHost) return null;
  return <AwayHostNotice name={awayHost.name} className={className} />;
}

interface DeckEntryProps {
  battlerIdInput: string;
  onInputChange: (value: string) => void;
  isBattlerLoading: boolean;
  isEditingDeck: boolean;
  deckUnchanged: boolean;
  onCancelEdit: () => void;
  onSubmit: () => void;
  onButtonClick: () => void;
}

function DeckEntryFields({
  battlerIdInput,
  onInputChange,
  isBattlerLoading,
  isEditingDeck,
  deckUnchanged,
  onCancelEdit,
  onSubmit,
  onButtonClick,
}: DeckEntryProps): ReactElement {
  const focusedRef = useRef(false);

  return (
    <>
      <label className="setup-field">
        <span className="setup-caption">Your deck</span>
        <input
          ref={(el): void => {
            if (!isEditingDeck) {
              focusedRef.current = false;
              return;
            }
            if (el && !focusedRef.current) {
              focusedRef.current = true;
              el.focus();
            }
          }}
          type="text"
          value={battlerIdInput}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !isBattlerLoading && !deckUnchanged) {
              onSubmit();
            }
          }}
          onFocus={(event) => {
            if (isEditingDeck) event.target.select();
          }}
          placeholder="Deck ID"
          disabled={isBattlerLoading}
          className="setup-input"
        />
      </label>
      {isEditingDeck && (
        <button
          onClick={onCancelEdit}
          className="btn btn-secondary setup-submit"
        >
          Cancel
        </button>
      )}
      <button
        onClick={onButtonClick}
        disabled={isBattlerLoading || deckUnchanged}
        className={`btn setup-submit ${deckUnchanged ? "setup-waiting" : "btn-primary"}`}
      >
        {isBattlerLoading ? "Loading..." : "Submit"}
      </button>
    </>
  );
}

export interface LobbyBodyProps {
  isBoard: boolean;
  header: ReactElement;
  lobbyState: LobbyState;
  currentPlayer: LobbyPlayer | undefined;
  sessionPlayerId: string | undefined;
  cubeLook: CubeLook | null;
  summaryBattlerId: string | null;
  voiceChat: ReturnType<typeof useVoiceChat>;
  seatActions: {
    addPuppet: () => void;
    removePuppet: () => void;
    kickPlayer: (playerId: string) => void;
  };
  isGuidedMode: boolean;
  onGuidedModeToggle: (enabled: boolean) => void;
  onVoiceChatToggle: (enabled: boolean) => void;
  onTargetPlayerCountChange: (count: number) => void;
  onToggleReady: () => void;
  onRequestStart: () => void;
  readyActionDisabled: boolean;
  startAwaitingServer: boolean;
  copied: boolean;
  onCopyJoinLink: () => void;
  onOpenGuide: (target?: RulesPanelTarget) => void;
  deckId: string | null | undefined;
  hasLoadedBattler: boolean;
  showsDeck: boolean;
  isEditingDeck: boolean;
  isBattlerLoading: boolean;
  deckUnchanged: boolean;
  battlerIdInput: string;
  onBattlerIdInputChange: (value: string) => void;
  onCancelEditDeck: () => void;
  onEditDeck: () => void;
  onSubmitBattler: () => void;
  onBattlerButtonClick: () => void;
  hostChange: { name: string; text: string } | null;
  awayHost: LobbyPlayer | null;
  onDismissHostChange: () => void;
}

function LobbySeatStepper({
  cap,
  isHost,
  onChange,
}: {
  cap: PlayerCapStep;
  isHost: boolean;
  onChange: (count: number) => void;
}): ReactElement {
  return (
    <div className="seat-stepper">
      <button
        type="button"
        onClick={() => {
          if (cap.previousPlayerCap !== null) onChange(cap.previousPlayerCap);
        }}
        disabled={!cap.canDecreasePlayerCap}
        aria-label="Decrease player count"
        className={`btn btn-secondary btn-pill btn-pill-square ${isHost ? "" : "invisible"}`}
      >
        −
      </button>
      <span className="seat-count">{cap.playerCap} seats</span>
      <button
        type="button"
        onClick={() => {
          if (cap.nextPlayerCap !== null) onChange(cap.nextPlayerCap);
        }}
        disabled={!cap.canIncreasePlayerCap}
        aria-label="Increase player count"
        className={`btn btn-secondary btn-pill btn-pill-square ${isHost ? "" : "invisible"}`}
      >
        +
      </button>
    </div>
  );
}

function LobbySettingsRow({
  isGuidedMode,
  onGuidedModeToggle,
  voiceChatEnabled,
  onVoiceChatToggle,
  isHost,
}: {
  isGuidedMode: boolean;
  onGuidedModeToggle: (enabled: boolean) => void;
  voiceChatEnabled: boolean;
  onVoiceChatToggle: (enabled: boolean) => void;
  isHost: boolean;
}): ReactElement {
  return (
    <div className="lobby-settings">
      <GuidedSwitch enabled={isGuidedMode} setEnabled={onGuidedModeToggle} />
      <div className="setup-setting">
        <Switch
          checked={voiceChatEnabled}
          onChange={onVoiceChatToggle}
          disabled={!isHost}
        >
          Voice <span className="switch-beta">Beta</span>
        </Switch>
        <InfoTip label="Voice chat info" text={VOICE_HELP} />
      </div>
    </div>
  );
}

function LobbyActionButtons({
  isHost,
  isReady,
  readyActionDisabled,
  canStart,
  startAwaitingServer,
  startReason,
  onToggleReady,
  onRequestStart,
}: {
  isHost: boolean;
  isReady: boolean;
  readyActionDisabled: boolean;
  canStart: boolean;
  startAwaitingServer: boolean;
  startReason: string;
  onToggleReady: () => void;
  onRequestStart: () => void;
}): ReactElement {
  const startWaits = !canStart;
  return (
    <div className={`lobby-actions ${isHost ? "" : "is-guest"}`}>
      <button
        onClick={onToggleReady}
        disabled={readyActionDisabled}
        className={`btn setup-next ${isReady ? "btn-secondary" : "btn-success"}`}
      >
        {isReady ? "Unready" : "Ready"}
      </button>
      {isHost && (
        <button
          onClick={onRequestStart}
          data-ends-phase
          disabled={!canStart || startAwaitingServer}
          className={`btn setup-next ${startWaits ? "setup-waiting" : "btn-primary"}`}
        >
          Start Game
          {startReason && <small>{startReason}</small>}
        </button>
      )}
    </div>
  );
}

function JoinCodeRow({
  joinCode,
  copyIsNext,
  copied,
  onCopy,
}: {
  joinCode: string;
  copyIsNext: boolean;
  copied: boolean;
  onCopy: () => void;
}): ReactElement {
  return (
    <>
      <div>
        <span className="setup-caption join-code-caption">Join code</span>
        <span className="join-code">{joinCode}</span>
      </div>
      <button
        onClick={onCopy}
        className={`btn btn-pill ${copyIsNext ? "btn-primary" : "btn-secondary"}`}
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </>
  );
}

function LobbySummaryDetails({
  lobbyState,
  isConstructed,
}: {
  lobbyState: LobbyState;
  isConstructed: boolean;
}): ReactElement {
  return (
    <>
      {isConstructed ? "Constructed" : "Limited"} · Upgrades{" "}
      {lobbyState.use_upgrades ? "On" : "Off"}
      {lobbyState.auto_approve_spectators && (
        <span className="lobby-spectating">Open Spectating</span>
      )}
    </>
  );
}

function deriveBoardCubeDisplay(
  props: LobbyBodyProps,
  isConstructed: boolean,
): {
  boardNeedsDeckEntry: boolean;
  showBoardNotice: boolean;
  canChangeDeck: boolean;
  titleLook: CubeLook | null;
  titleHref: string | undefined;
} {
  const hasDeckPlayer = isConstructed && Boolean(props.currentPlayer);
  return {
    boardNeedsDeckEntry: hasDeckPlayer && !props.showsDeck,
    showBoardNotice: Boolean(props.hostChange || props.awayHost),
    canChangeDeck: hasDeckPlayer && props.showsDeck,
    titleLook: isConstructed && !props.hasLoadedBattler ? null : props.cubeLook,
    titleHref: props.summaryBattlerId
      ? cubeCobraUrl(props.summaryBattlerId)
      : undefined,
  };
}

function LobbyBoardCubeSection({
  props,
  cap,
  isConstructed,
  cardsButton,
  joinCodeBlock,
  deckEntryFields,
}: {
  props: LobbyBodyProps;
  cap: PlayerCapStep;
  isConstructed: boolean;
  cardsButton: ReactElement;
  joinCodeBlock: ReactElement;
  deckEntryFields: ReactElement;
}): ReactElement {
  const { lobbyState, cubeLook } = props;
  const display = deriveBoardCubeDisplay(props, isConstructed);

  return (
    <section className="zone-hand board-cube">
      <BoardArt
        look={display.boardNeedsDeckEntry ? null : cubeLook}
        empty={
          display.boardNeedsDeckEntry ? (
            <div className="board-slot-entry">
              <div className="setup-row board-deck">{deckEntryFields}</div>
            </div>
          ) : undefined
        }
      />
      <div className="board-words">
        {display.showBoardNotice ? (
          <HostNotice
            hostChange={props.hostChange}
            awayHost={props.awayHost}
            className="board-notice"
            onDismissHostChange={props.onDismissHostChange}
          />
        ) : (
          <BoardCubeTitle
            look={display.titleLook}
            playMode={lobbyState.play_mode}
            href={display.titleHref}
          />
        )}
        <p className="board-summary">
          <b className="font-semibold text-[var(--ivory)]">
            {cap.occupiedSlots} of {cap.playerCap} seated
          </b>
          <br />
          <LobbySummaryDetails
            lobbyState={lobbyState}
            isConstructed={isConstructed}
          />
        </p>
        <div className="board-code">{joinCodeBlock}</div>
        <div className="board-cube-actions">
          {cardsButton}
          {display.canChangeDeck && (
            <button
              type="button"
              onClick={props.onEditDeck}
              disabled={props.isBattlerLoading}
              className="btn btn-secondary btn-pill"
            >
              Change
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function LobbyBoardView({
  props,
  cap,
  isHost,
  isConstructed,
  cardsButton,
  joinCodeBlock,
  seatStepper,
  lobbySettings,
  lobbyActions,
  deckEntryFields,
}: {
  props: LobbyBodyProps;
  cap: PlayerCapStep;
  isHost: boolean;
  isConstructed: boolean;
  cardsButton: ReactElement;
  joinCodeBlock: ReactElement;
  seatStepper: ReactElement;
  lobbySettings: ReactElement;
  lobbyActions: ReactElement;
  deckEntryFields: ReactElement;
}): ReactElement {
  return (
    <PageFrame
      header={props.header}
      scroll={false}
      contentClassName="setup-page board-page"
      hints="game"
      aside={
        <aside
          aria-label="At the table"
          className="board-aside frame-chrome is-lobby"
        >
          <BoardDrawerHead />
          <div className="board-seats">
            <BoardLobbySeats
              lobby={props.lobbyState}
              isHost={isHost}
              openSeats={cap.openSeats}
              selfId={props.sessionPlayerId}
              voiceChat={props.voiceChat}
              actions={props.seatActions}
              onPuppetHelp={() =>
                props.onOpenGuide({
                  docId: "faq",
                  tab: "why-are-my-opponents-cards-face-up",
                })
              }
            />
          </div>
        </aside>
      }
    >
      <div className="board-layout is-lobby">
        <LobbyBoardCubeSection
          props={props}
          cap={cap}
          isConstructed={isConstructed}
          cardsButton={cardsButton}
          joinCodeBlock={joinCodeBlock}
          deckEntryFields={deckEntryFields}
        />
        <section className="zone-battlefield board-setup">
          <ZoneLabel hideGrip>Lobby</ZoneLabel>
          <div className="board-two">
            <div className="board-stack board-lobby-options">
              {seatStepper}
              {lobbySettings}
            </div>
            <div className="board-lobby-start">{lobbyActions}</div>
          </div>
        </section>
      </div>
    </PageFrame>
  );
}

function LobbyCompactView({
  props,
  cap,
  isHost,
  isConstructed,
  cardsButton,
  joinCodeBlock,
  seatStepper,
  lobbySettings,
  lobbyActions,
  deckEntryFields,
}: {
  props: LobbyBodyProps;
  cap: PlayerCapStep;
  isHost: boolean;
  isConstructed: boolean;
  cardsButton: ReactElement;
  joinCodeBlock: ReactElement;
  seatStepper: ReactElement;
  lobbySettings: ReactElement;
  lobbyActions: ReactElement;
  deckEntryFields: ReactElement;
}): ReactElement {
  const { lobbyState, currentPlayer, cubeLook, summaryBattlerId } = props;

  return (
    <PageFrame
      header={props.header}
      scroll={false}
      contentClassName="setup-page"
      hints="game"
    >
      <CubeBanner
        look={cubeLook}
        playMode={lobbyState.play_mode}
        notice={
          <HostNotice
            hostChange={props.hostChange}
            awayHost={props.awayHost}
            className="cube-banner-notice"
            onDismissHostChange={props.onDismissHostChange}
          />
        }
        href={summaryBattlerId ? cubeCobraUrl(summaryBattlerId) : undefined}
        action={cardsButton}
      >
        {joinCodeBlock}
        {seatStepper}
      </CubeBanner>

      <div className="setup-felt lobby-felt">
        <p className="lobby-summary">
          <b>
            {cap.occupiedSlots} of {cap.playerCap} seated
          </b>
          <span>
            <LobbySummaryDetails
              lobbyState={lobbyState}
              isConstructed={isConstructed}
            />
          </span>
        </p>

        {isConstructed && currentPlayer && (
          <div
            className={`setup-row lobby-deck ${props.showsDeck ? "is-loaded" : ""}`}
          >
            {props.showsDeck ? (
              <>
                <div className="setup-field">
                  <span className="setup-caption">Your deck</span>
                  <span className="setup-value text-[var(--ivory-muted)]">
                    {props.deckId}
                  </span>
                </div>
                <button
                  onClick={props.onBattlerButtonClick}
                  disabled={props.isBattlerLoading}
                  className="btn setup-submit btn-secondary"
                >
                  Change
                </button>
              </>
            ) : (
              deckEntryFields
            )}
          </div>
        )}

        <LobbySeats
          lobby={lobbyState}
          isHost={isHost}
          openSeats={cap.openSeats}
          compact={cap.playerCap > 6}
          selfId={props.sessionPlayerId}
          voiceChat={props.voiceChat}
          actions={props.seatActions}
          onPuppetHelp={() =>
            props.onOpenGuide({
              docId: "faq",
              tab: "why-are-my-opponents-cards-face-up",
            })
          }
        />

        {/* Shown instead of the banner's, where a short phone needs the banner for the deck */}
        {isConstructed && (
          <HostNotice
            hostChange={props.hostChange}
            awayHost={props.awayHost}
            className="lobby-away-notice"
            onDismissHostChange={props.onDismissHostChange}
          />
        )}

        {lobbySettings}
        {lobbyActions}
      </div>
    </PageFrame>
  );
}

function isCopyInviteNextStep(options: {
  isHost: boolean;
  needsDeck: boolean;
  isEditingDeck: boolean;
  openSeats: number;
}): boolean {
  return (
    options.isHost &&
    !options.needsDeck &&
    !options.isEditingDeck &&
    options.openSeats > 0
  );
}

function deriveLobbyBodyMeta(props: LobbyBodyProps): {
  isConstructed: boolean;
  isHost: boolean;
  isReady: boolean;
  cap: PlayerCapStep;
  canBrowseCards: boolean;
  copyIsNext: boolean;
  startReason: string;
} {
  const { lobbyState, currentPlayer } = props;
  const isConstructed = lobbyState.play_mode === "constructed";
  const isHost = Boolean(currentPlayer?.is_host);
  const isReady = Boolean(currentPlayer?.is_ready);
  const cap = derivePlayerCapStep(lobbyState, isHost);
  const canBrowseCards = !isConstructed || props.hasLoadedBattler;
  const needsDeck =
    isConstructed && Boolean(currentPlayer) && !props.hasLoadedBattler;
  // Inviting is the host's next step until the seats are full, unless their own deck comes first.
  const copyIsNext = isCopyInviteNextStep({
    isHost,
    needsDeck,
    isEditingDeck: props.isEditingDeck,
    openSeats: cap.openSeats,
  });
  const startReason = lobbyState.can_start
    ? ""
    : startBlocker(lobbyState, cap.openSeats, needsDeck);
  return {
    isConstructed,
    isHost,
    isReady,
    cap,
    canBrowseCards,
    copyIsNext,
    startReason,
  };
}

export function LobbyBody(props: LobbyBodyProps): ReactElement {
  const { lobbyState } = props;
  const {
    isConstructed,
    isHost,
    isReady,
    cap,
    canBrowseCards,
    copyIsNext,
    startReason,
  } = deriveLobbyBodyMeta(props);

  const cardsButton = (
    <button
      onClick={() => props.onOpenGuide({ docId: "__cards__" })}
      disabled={!canBrowseCards}
      className="btn btn-secondary btn-pill"
    >
      Cards
    </button>
  );
  const joinCodeBlock = (
    <JoinCodeRow
      joinCode={lobbyState.join_code}
      copyIsNext={copyIsNext}
      copied={props.copied}
      onCopy={props.onCopyJoinLink}
    />
  );
  const seatStepper = (
    <LobbySeatStepper
      cap={cap}
      isHost={isHost}
      onChange={props.onTargetPlayerCountChange}
    />
  );
  const lobbySettings = (
    <LobbySettingsRow
      isGuidedMode={props.isGuidedMode}
      onGuidedModeToggle={props.onGuidedModeToggle}
      voiceChatEnabled={lobbyState.voice_chat_enabled}
      onVoiceChatToggle={props.onVoiceChatToggle}
      isHost={isHost}
    />
  );
  const lobbyActions = (
    <LobbyActionButtons
      isHost={isHost}
      isReady={isReady}
      readyActionDisabled={props.readyActionDisabled}
      canStart={lobbyState.can_start}
      startAwaitingServer={props.startAwaitingServer}
      startReason={startReason}
      onToggleReady={props.onToggleReady}
      onRequestStart={props.onRequestStart}
    />
  );
  const deckEntryFields = (
    <DeckEntryFields
      battlerIdInput={props.battlerIdInput}
      onInputChange={props.onBattlerIdInputChange}
      isBattlerLoading={props.isBattlerLoading}
      isEditingDeck={props.isEditingDeck}
      deckUnchanged={props.deckUnchanged}
      onCancelEdit={props.onCancelEditDeck}
      onSubmit={props.onSubmitBattler}
      onButtonClick={props.onBattlerButtonClick}
    />
  );

  if (props.isBoard) {
    return (
      <LobbyBoardView
        props={props}
        cap={cap}
        isHost={isHost}
        isConstructed={isConstructed}
        cardsButton={cardsButton}
        joinCodeBlock={joinCodeBlock}
        seatStepper={seatStepper}
        lobbySettings={lobbySettings}
        lobbyActions={lobbyActions}
        deckEntryFields={deckEntryFields}
      />
    );
  }
  return (
    <LobbyCompactView
      props={props}
      cap={cap}
      isHost={isHost}
      isConstructed={isConstructed}
      cardsButton={cardsButton}
      joinCodeBlock={joinCodeBlock}
      seatStepper={seatStepper}
      lobbySettings={lobbySettings}
      lobbyActions={lobbyActions}
      deckEntryFields={deckEntryFields}
    />
  );
}
