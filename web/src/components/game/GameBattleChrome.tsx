/**
 * Battle- and sidebar-specific game-table chrome: voice controls, mobile Battle
 * life rail, desktop/overlay Sidebar chrome, and Sideboard drag-and-drop panels.
 */
import type { ReactNode } from "react";
import { DraggableCard, type ZoneOwner } from "../../dnd";
import type { GameShellMode } from "../../hooks/useGameShellMode";
import type { PanelZone, ScoutingTab } from "../../hooks/useGameSurfaces";
import type { VoiceChatState } from "../../hooks/useVoiceChat";
import type { BattleSelectedCard } from "../../pages/phases/Battle";
import type {
  BattleView,
  Card as CardType,
  GameState,
  PlayerView,
  ZoneName,
} from "../../types";
import {
  buildAppliedUpgradeMap,
  buildHiddenAppliedUpgradeMap,
  getRevealedAppliedUpgrades,
} from "../../utils/upgrades";
import { isVoiceMicBlocked } from "../../utils/voiceChat";
import { HomeButton } from "../common/AppHeader";
import { DndPanel } from "../common/DndPanel";
import { FrameSidebar } from "../common/PageFrame";
import { SidePanel } from "../common/SidePanel";
import { ZoneDivider } from "../common/ZoneDivider";
import { Sidebar, type FightSidebarView, type Scouting } from "../sidebar";
import { BattleSidebarContent } from "../sidebar/BattleSidebarContent";
import { CopyWatchLink } from "../sidebar/CopyWatchLink";
import { MicBlockedIndicator, MicToggle } from "../sidebar/MicToggle";

// Each area ends at its button's edge beside the life number and reaches outward, so the number takes no taps.
const LIFE_MINUS_TOUCH_AREA =
  "touch-area [--touch-area-left:calc(100%_-_44px)]";
const LIFE_PLUS_TOUCH_AREA = "touch-area [--touch-area-left:0px]";
// A click handler makes the number a tap target of its own. Without one WebKit moves a tap on it to - or +.
const ignoreLifeNumberTap = (): void => {};

const STATIC_DIVIDER_CALLBACKS = {
  onDragStart: (): void => {},
  onDrag: (): void => {},
  onDragEnd: (): void => {},
};

const ALL_BATTLE_ZONES: ZoneName[] = [
  "hand",
  "battlefield",
  "graveyard",
  "exile",
  "sideboard",
  "command_zone",
  "library",
];

export interface GameVoiceControls {
  state: VoiceChatState;
  toggleSelfMute: () => void;
  togglePeerMute: (peerName: string) => void;
  targetsAvailable: boolean;
  targetNames: ReadonlySet<string>;
}

function MobileLifeChip({
  life,
  onChange,
  readOnly,
}: {
  life: number;
  onChange: (life: number) => void;
  readOnly: boolean;
}): ReactNode {
  const stepLife = (delta: number): void => {
    if (!readOnly) onChange(life + delta);
  };

  return (
    <div className="mobile-life-chip flex items-center gap-0.5 rounded px-1 py-px leading-none">
      <button
        type="button"
        disabled={readOnly}
        onClick={() => stepLife(-1)}
        className={`${LIFE_MINUS_TOUCH_AREA} text-[var(--ivory-muted)] hover:text-white px-1 leading-none disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        -
      </button>
      <button
        type="button"
        tabIndex={-1}
        onClick={ignoreLifeNumberTap}
        className="text-white font-bold cursor-default"
      >
        {life}
      </button>
      <button
        type="button"
        disabled={readOnly}
        onClick={() => stepLife(1)}
        className={`${LIFE_PLUS_TOUCH_AREA} text-[var(--ivory-muted)] hover:text-white px-1 leading-none disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        +
      </button>
    </div>
  );
}

export function BattleMobileLifeRail({
  battle,
  selfName,
  voice,
  lifeRailRef,
  onYourLifeChange,
  onOpponentLifeChange,
  readOnly = false,
}: {
  battle: BattleView;
  selfName: string;
  voice: GameVoiceControls;
  lifeRailRef: (node: HTMLDivElement | null) => void;
  onYourLifeChange: (life: number) => void;
  onOpponentLifeChange: (life: number) => void;
  readOnly?: boolean;
}): ReactNode {
  const canManipulateOpponent = battle.can_manipulate_opponent;
  const oppPeer =
    !canManipulateOpponent && voice.targetsAvailable
      ? voice.state.peers.find((p) => p.name === battle.opponent_name)
      : undefined;

  return (
    <>
      <div
        ref={lifeRailRef}
        className="shrink-0 flex items-center justify-between top-attached-rail-pad mobile-life-bar text-[11px] leading-tight"
      >
        <div className="flex items-center gap-1">
          <span className="text-[var(--ivory-muted)] truncate max-w-[60px] leading-tight">
            {battle.opponent_name}
          </span>
          {oppPeer && (
            <MicToggle
              muted={voice.state.mutedPeers.has(battle.opponent_name)}
              connectionState={oppPeer.connectionState}
              audioLevelKey={battle.opponent_name}
              remoteMuted={voice.state.remoteMutedPeers.has(
                battle.opponent_name,
              )}
              onClick={() => voice.togglePeerMute(battle.opponent_name)}
            />
          )}
          <MobileLifeChip
            life={battle.opponent_life}
            onChange={onOpponentLifeChange}
            readOnly={readOnly}
          />
        </div>
        <div className="flex items-center gap-1.5 leading-tight">
          <div className="text-center">
            {battle.current_turn_name === selfName ? (
              <span className="text-green-400 font-medium">Your turn</span>
            ) : (
              <span className="text-amber-400 font-medium">
                Opp&apos;s turn
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <MobileLifeChip
            life={battle.your_life}
            onChange={onYourLifeChange}
            readOnly={readOnly}
          />
          {!canManipulateOpponent &&
            voice.targetsAvailable &&
            voice.state.peers.length > 0 && (
              <MicToggle
                muted={voice.state.isMuted}
                audioLevelKey="__self__"
                onClick={voice.toggleSelfMute}
              />
            )}
          <span className="text-[var(--ivory-muted)] truncate max-w-[60px] leading-tight">
            {selfName}
          </span>
        </div>
      </div>
      <ZoneDivider
        orientation="horizontal"
        interactive={false}
        {...STATIC_DIVIDER_CALLBACKS}
      />
    </>
  );
}

function renderPlayerMicToggle(
  player: PlayerView,
  selfName: string,
  voice: GameVoiceControls,
): ReactNode {
  if (!voice.targetsAvailable || player.is_puppet || player.is_ghost) {
    return null;
  }
  if (voice.state.peers.length === 0 && !voice.state.isAvailable) return null;
  if (player.name === selfName) {
    return (
      <MicToggle
        muted={voice.state.isMuted}
        audioLevelKey="__self__"
        variant="player-row"
        onClick={voice.toggleSelfMute}
      />
    );
  }
  if (!voice.targetNames.has(player.name)) return null;
  const peer = voice.state.peers.find((p) => p.name === player.name);
  if (!peer) {
    if (!voice.state.isAvailable) return null;
    return (
      <MicToggle
        muted={voice.state.mutedPeers.has(player.name)}
        connectionState="connecting"
        audioLevelKey={player.name}
        variant="player-row"
        onClick={() => voice.togglePeerMute(player.name)}
      />
    );
  }
  return (
    <MicToggle
      muted={voice.state.mutedPeers.has(player.name)}
      connectionState={peer.connectionState}
      audioLevelKey={player.name}
      remoteMuted={voice.state.remoteMutedPeers.has(player.name)}
      variant="player-row"
      onClick={() => voice.togglePeerMute(player.name)}
    />
  );
}

function getOverlaySidebarTitle({
  scouting,
  shellMode,
  inFight,
  fightSidebarView,
}: {
  scouting: Scouting | null;
  shellMode: GameShellMode;
  inFight: boolean;
  fightSidebarView: FightSidebarView;
}): string {
  if (scouting && shellMode === "mobile") return "Scouting";
  if (inFight && fightSidebarView === "fight") return "Fight";
  return "Players";
}

function SidebarWatchFooter({
  micBlocked,
  showWatchLink,
  watchUrl,
}: {
  micBlocked: boolean;
  showWatchLink: boolean;
  watchUrl: string;
}): ReactNode {
  if (!micBlocked && !showWatchLink) return undefined;
  return (
    <>
      {micBlocked && (
        <div className="pt-3">
          <MicBlockedIndicator />
        </div>
      )}
      {showWatchLink && <CopyWatchLink url={watchUrl} />}
    </>
  );
}

interface GameSidebarChromeProps {
  gameState: GameState;
  battleViewForDisplay: BattleView | null;
  inFight: boolean;
  fightSidebarView: FightSidebarView;
  onFightSidebarViewChange: (view: FightSidebarView) => void;
  usesOverlaySidebar: boolean;
  shellMode: GameShellMode;
  overlaySidebarOpen: boolean;
  overlaySidebarTopInset: number;
  battleSidebarLayout: {
    topSectionHeight: number;
    middleLaneHeight: number;
  } | null;
  scouting: Scouting | null;
  onScout: (player: string | null, tab?: ScoutingTab) => void;
  onCloseDrawer: () => void;
  isSpectator: boolean;
  isEndPhase: boolean;
  canSpectate: boolean;
  watchUrl: string;
  voice: GameVoiceControls;
  onYourLifeChange: (life: number) => void;
  onOpponentLifeChange: (life: number) => void;
  onCreateTreasure: () => void;
  onUntapAll: () => void;
  onPassTurn: () => void;
  onCreateOpponentTreasure: () => void;
  onUntapOpponentAll: () => void;
}

function renderBattleSidebarContent(
  props: GameSidebarChromeProps,
  viewSwitch: ReactNode,
): ReactNode {
  const { battleViewForDisplay, gameState, voice, battleSidebarLayout } = props;
  if (!battleViewForDisplay) return null;
  const canManipulateOpponent = battleViewForDisplay.can_manipulate_opponent;
  const voiceChat =
    !canManipulateOpponent && voice.targetsAvailable
      ? {
          state: voice.state,
          toggleSelfMute: voice.toggleSelfMute,
          togglePeerMute: voice.togglePeerMute,
        }
      : undefined;

  return (
    <BattleSidebarContent
      header={viewSwitch}
      currentBattle={battleViewForDisplay}
      selfUpgrades={getRevealedAppliedUpgrades(gameState.self_player.upgrades)}
      yourLife={battleViewForDisplay.your_life}
      opponentLife={battleViewForDisplay.opponent_life}
      onYourLifeChange={props.onYourLifeChange}
      onOpponentLifeChange={props.onOpponentLifeChange}
      playerName={gameState.self_player.name}
      onCreateTreasure={props.onCreateTreasure}
      onUntapAll={props.onUntapAll}
      onPassTurn={props.onPassTurn}
      canManipulateOpponent={canManipulateOpponent}
      onCreateOpponentTreasure={props.onCreateOpponentTreasure}
      onUntapOpponentAll={props.onUntapOpponentAll}
      onPassOpponentTurn={props.onPassTurn}
      voiceChat={voiceChat}
      topSectionHeight={battleSidebarLayout?.topSectionHeight ?? null}
      middleLaneHeight={battleSidebarLayout?.middleLaneHeight ?? null}
      overlayTopInset={props.overlaySidebarTopInset}
      readOnly={props.isSpectator}
    />
  );
}

export function GameSidebarChrome(props: GameSidebarChromeProps): ReactNode {
  const {
    gameState,
    inFight,
    fightSidebarView,
    onFightSidebarViewChange,
    usesOverlaySidebar,
    shellMode,
    overlaySidebarOpen,
    scouting,
    onScout,
    onCloseDrawer,
    isSpectator,
    isEndPhase,
    canSpectate,
    watchUrl,
    voice,
  } = props;
  const { self_player } = gameState;
  const micBlocked = isVoiceMicBlocked(voice.targetsAvailable, voice.state);
  const showWatchLink = !isSpectator && (!isEndPhase || canSpectate);

  const sidebar = (
    <Sidebar
      players={gameState.players}
      currentPlayer={self_player}
      renderFight={
        inFight
          ? (viewSwitch): ReactNode =>
              renderBattleSidebarContent(props, viewSwitch)
          : undefined
      }
      fightView={fightSidebarView}
      onFightViewChange={onFightSidebarViewChange}
      useUpgrades={gameState.use_upgrades}
      isMobile={usesOverlaySidebar}
      scoutInline={shellMode === "mobile"}
      scouting={scouting}
      onScout={onScout}
      onStopScouting={() => onScout(null)}
      renderMicToggle={(player) =>
        renderPlayerMicToggle(player, self_player.name, voice)
      }
      watchLink={
        <SidebarWatchFooter
          micBlocked={micBlocked}
          showWatchLink={showWatchLink}
          watchUrl={watchUrl}
        />
      }
    />
  );

  if (!usesOverlaySidebar) return <FrameSidebar>{sidebar}</FrameSidebar>;
  const overlayTitle = getOverlaySidebarTitle({
    scouting,
    shellMode,
    inFight,
    fightSidebarView,
  });
  return (
    <SidePanel
      open={overlaySidebarOpen}
      title={overlayTitle}
      onClose={onCloseDrawer}
      headerActions={
        isEndPhase ? undefined : (
          <HomeButton className="side-panel-home sm:hidden" />
        )
      }
      closeOnBoardTap
    >
      {sidebar}
    </SidePanel>
  );
}

export function BattleSideboardPanels({
  battle,
  isZonePanelOpen,
  battleSelectedCard,
  canHover,
  onCloseZone,
  onEmptyClick,
  onSelectCard,
  onOpenCardMenu,
  onCardHover,
  onOpponentCardHover,
  onCardHoverEnd,
  onRevealHiddenUpgrades,
}: {
  battle: BattleView;
  isZonePanelOpen: (zone: PanelZone, owner: ZoneOwner) => boolean;
  battleSelectedCard: BattleSelectedCard | null;
  canHover: boolean;
  onCloseZone: () => void;
  onEmptyClick: (owner: ZoneOwner) => void;
  onSelectCard: (card: BattleSelectedCard) => void;
  onOpenCardMenu: (
    e: React.MouseEvent,
    card: CardType,
    owner: ZoneOwner,
  ) => void;
  onCardHover: (cardId: string, zone: ZoneName) => void;
  onOpponentCardHover: (cardId: string, zone: ZoneName) => void;
  onCardHoverEnd: () => void;
  onRevealHiddenUpgrades: (upgradeIds: string[]) => void;
}): ReactNode {
  const {
    upgradedCardIds: battleUpgradedCardIds,
    appliedUpgradesByCardId: battleUpgradesByCardId,
  } = buildAppliedUpgradeMap(battle.your_zones.upgrades, "revealed_applied");
  const battleHiddenUpgradesByCardId = buildHiddenAppliedUpgradeMap(
    battle.your_zones.upgrades,
  );
  const {
    upgradedCardIds: opponentBattleUpgradedCardIds,
    appliedUpgradesByCardId: opponentBattleUpgradesByCardId,
  } = buildAppliedUpgradeMap(
    battle.opponent_zones.upgrades,
    "revealed_applied",
  );

  return (
    <>
      <DndPanel
        open={isZonePanelOpen("sideboard", "player")}
        title="Your Sideboard"
        count={battle.your_zones.sideboard.length}
        onClose={onCloseZone}
        onEmptyClick={() => onEmptyClick("player")}
        tone="battle"
        zone="sideboard"
        zoneOwner="player"
        validFromZones={ALL_BATTLE_ZONES}
      >
        {(dims) =>
          battle.your_zones.sideboard.map((card) => (
            <DraggableCard
              key={card.id}
              card={card}
              zone="sideboard"
              dimensions={dims}
              onCardHover={onCardHover}
              onCardHoverEnd={onCardHoverEnd}
              selected={battleSelectedCard?.card.id === card.id}
              onClick={() =>
                onSelectCard({ card, zone: "sideboard", owner: "player" })
              }
              onContextMenu={
                canHover
                  ? (e): void => onOpenCardMenu(e, card, "player")
                  : undefined
              }
              upgraded={battleUpgradedCardIds.has(card.id)}
              appliedUpgrades={battleUpgradesByCardId.get(card.id)}
              hiddenUpgradeCount={
                (battleHiddenUpgradesByCardId.get(card.id) ?? []).length
              }
              onRevealHiddenUpgrades={() =>
                onRevealHiddenUpgrades(
                  (battleHiddenUpgradesByCardId.get(card.id) ?? []).map(
                    (upgrade) => upgrade.id,
                  ),
                )
              }
            />
          ))
        }
      </DndPanel>
      <DndPanel
        open={
          isZonePanelOpen("sideboard", "opponent") &&
          !!battle.opponent_full_sideboard
        }
        title={`${battle.opponent_name}'s Sideboard`}
        count={battle.opponent_full_sideboard?.length ?? 0}
        onClose={onCloseZone}
        onEmptyClick={() => onEmptyClick("opponent")}
        tone="battle"
        zone="sideboard"
        zoneOwner="opponent"
        validFromZones={ALL_BATTLE_ZONES}
      >
        {(dims) =>
          (battle.opponent_full_sideboard ?? []).map((card) => (
            <DraggableCard
              key={card.id}
              card={card}
              zone="sideboard"
              zoneOwner="opponent"
              dimensions={dims}
              isOpponent
              onCardHover={onOpponentCardHover}
              onCardHoverEnd={onCardHoverEnd}
              selected={battleSelectedCard?.card.id === card.id}
              onClick={() =>
                onSelectCard({ card, zone: "sideboard", owner: "opponent" })
              }
              onContextMenu={
                canHover
                  ? (e): void => onOpenCardMenu(e, card, "opponent")
                  : undefined
              }
              upgraded={opponentBattleUpgradedCardIds.has(card.id)}
              appliedUpgrades={opponentBattleUpgradesByCardId.get(card.id)}
            />
          ))
        }
      </DndPanel>
    </>
  );
}
