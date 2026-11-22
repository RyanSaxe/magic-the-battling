import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { CubeLook } from '../../hooks/useCubeLook'
import type { ResumableSeat } from '../../hooks/useResumableGames'
import { useResumeSeat } from '../../hooks/useResumeSeat'
import type { useVoiceChat } from '../../hooks/useVoiceChat'
import type { LobbyPlayer, LobbyState, PlayMode } from '../../types'
import { formatTimeSince } from '../../utils/format'
import { isVoiceMicBlocked } from '../../utils/voiceChat'
import { PlayerCard } from '../PlayerCard'
import { PLAYER_ROW_STACK_CLASS } from '../PlayerList'
import { SIDE_PANEL_HEADER_HEIGHT } from '../common/SidePanel'
import { Tag } from '../common/Tag'
import { CubeArt } from '../dashboard/CubeArt'
import { GoldfishIcon } from '../icons'
import { CrossIcon } from '../icons/CrossIcon'
import { Spinner } from '../icons/Spinner'
import { MicBlockedIndicator, MicToggle } from '../sidebar/MicToggle'

type VoiceChat = ReturnType<typeof useVoiceChat>

const PEOPLE_PATH =
  'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z'

export function BoardCubeTitle({ look, playMode, href }: { look: CubeLook | null; playMode: PlayMode; href?: string }) {
  const name = look?.name ?? 'No deck yet'
  return (
    <div className="board-title">
      <h2 className={name.length > 22 ? 'is-long' : ''}>
        {href && look ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="board-title-link">
            {name}
            <span aria-hidden="true">{'\u00a0'}↗</span>
          </a>
        ) : (
          name
        )}
      </h2>
      <Tag tone="muted">{playMode === 'constructed' ? 'Deck' : 'Cube'}</Tag>
    </div>
  )
}

/** The cube's art or, before a deck, the place it will take, holding the way to bring one. */
export function BoardArt({ look, empty }: { look: CubeLook | null; empty?: ReactNode }) {
  if (look === null) return <div className="board-art board-slot">{empty}</div>
  return (
    <div className="board-art board-picture">
      {look.imageUri && <CubeArt src={look.imageUri} />}
    </div>
  )
}

/** Shown from 1024 to 1119 so the seats sit where the game's Players drawer opens them. */
export function BoardDrawerHead() {
  return (
    <div className="side-panel-header board-drawer-head" style={{ height: SIDE_PANEL_HEADER_HEIGHT }}>
      <h2 className="side-panel-title">
        <span>Players</span>
      </h2>
    </div>
  )
}

/** The rank's column, holding who sits here until there are standings. */
export function SeatLead({ who }: { who: 'person' | 'puppet' | 'open' }) {
  return (
    <span aria-hidden="true" className="standings-rank">
      {who === 'puppet' ? (
        <GoldfishIcon className="board-who" />
      ) : who === 'person' ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="board-who">
          <path d={PEOPLE_PATH} />
        </svg>
      ) : null}
    </span>
  )
}

function boardSeatMic(
  player: LobbyPlayer,
  isSelf: boolean,
  voiceChat: VoiceChat,
  voiceOn: boolean,
  hasOtherPlayers: boolean,
) {
  const { state, toggleSelfMute, togglePeerMute } = voiceChat
  if (isSelf) {
    if (state.peers.length === 0 && (!voiceOn || !hasOtherPlayers || !state.isAvailable)) return null
    return (
      <MicToggle
        variant="player-row"
        muted={state.isMuted}
        audioLevelKey="__self__"
        onClick={toggleSelfMute}
      />
    )
  }
  const peer = state.peers.find((p) => p.name === player.name)
  if (!peer) {
    if (!voiceOn || !hasOtherPlayers || !state.isAvailable) return null
    return (
      <MicToggle
        variant="player-row"
        muted={state.mutedPeers.has(player.name)}
        connectionState="connecting"
        audioLevelKey={player.name}
        onClick={() => togglePeerMute(player.name)}
      />
    )
  }
  return (
    <MicToggle
      variant="player-row"
      muted={state.mutedPeers.has(player.name)}
      connectionState={peer.connectionState}
      audioLevelKey={player.name}
      remoteMuted={state.remoteMutedPeers.has(player.name)}
      onClick={() => togglePeerMute(player.name)}
    />
  )
}

export function BoardLobbySeats({
  lobby,
  isHost,
  openSeats,
  selfId,
  voiceChat,
  actions,
  onPuppetHelp,
}: {
  lobby: LobbyState
  isHost: boolean
  openSeats: number
  selfId: string | undefined
  voiceChat: VoiceChat
  actions: { kickPlayer: (id: string) => void; addPuppet: () => void; removePuppet: () => void }
  onPuppetHelp: () => void
}) {
  const { players, puppet_count: puppets, available_puppet_count: available } = lobby
  const canAdd = isHost && available !== null && puppets < available
  const hasOtherPlayers = players.length > 1
  const micBlocked = isVoiceMicBlocked(lobby.voice_chat_enabled && hasOtherPlayers, voiceChat.state)

  const help = (
    <button
      type="button"
      onClick={onPuppetHelp}
      title="What are Puppets?"
      aria-label="What are Puppets?"
      className="icon-target"
    >
      <span aria-hidden="true" className="help-glyph">?</span>
    </button>
  )

  return (
    <>
      <div className={PLAYER_ROW_STACK_CLASS}>
        {players.map((player) => {
          const isSelf = player.player_id === selfId
          const showsReady = player.is_ready || player.is_connected
          return (
            <PlayerCard
              key={player.player_id}
              isSelf={isSelf}
              lead={<SeatLead who="person" />}
              name={player.name}
              control={boardSeatMic(player, isSelf, voiceChat, lobby.voice_chat_enabled, hasOtherPlayers)}
              actions={isHost && !player.is_host && (
                <button
                  type="button"
                  onClick={() => actions.kickPlayer(player.player_id)}
                  title="Remove player"
                  aria-label={`Remove ${player.name}`}
                  className="icon-target"
                >
                  <CrossIcon />
                </button>
              )}
            >
              <span className="player-card-label">
                {player.is_host && 'Host'}
                {player.is_host && ' · '}
                {!player.is_connected && 'Away'}
                {!player.is_connected && player.is_ready && ' · '}
                {showsReady && (
                  <span className={player.is_ready ? 'board-ready' : undefined}>
                    {player.is_ready ? 'Ready' : 'Not ready'}
                  </span>
                )}
              </span>
            </PlayerCard>
          )
        })}
        {Array.from({ length: puppets }, (_, index) => (
          <PlayerCard
            key={`puppet-${index}`}
            lead={<SeatLead who="puppet" />}
            name={`Puppet\u00a0${index + 1}`}
            actions={(index === 0 || isHost) && (
              <>
                {index === 0 && help}
                {isHost && (
                  <button
                    type="button"
                    onClick={actions.removePuppet}
                    title="Remove puppet"
                    aria-label={`Remove puppet ${index + 1}`}
                    className="icon-target"
                  >
                    <CrossIcon />
                  </button>
                )}
              </>
            )}
          >
            <span className="player-card-label">
              {available === null ? (
                <><Spinner className="mr-1 inline h-2.5 w-2.5" />Finding</>
              ) : index >= available ? (
                <span className="player-card-label-out">No data</span>
              ) : (
                <span className="board-ready">Ready</span>
              )}
            </span>
          </PlayerCard>
        ))}
        {Array.from({ length: openSeats }, (_, index) => (
          <PlayerCard
            key={`open-${index}`}
            isOpen
            lead={<SeatLead who="open" />}
            name="Open seat"
            onSelect={isHost ? actions.addPuppet : undefined}
            disabled={isHost && !canAdd}
            actions={isHost && puppets === 0 && index === 0 && (
              <>
                {help}
                <span aria-hidden="true" className="board-cross-space" />
              </>
            )}
          >
            {isHost && <span className="player-card-label">+ Add puppet</span>}
          </PlayerCard>
        ))}
      </div>
      {micBlocked && (
        <div className="pt-3">
          <MicBlockedIndicator />
        </div>
      )}
    </>
  )
}

function BoardGameRow({ seat, onClose }: { seat: ResumableSeat; onClose: (seat: ResumableSeat) => void }) {
  const resume = useResumeSeat()
  const title = seat.cubeName ?? seat.cubeId
  const isLobby = seat.kind === 'lobby'
  return (
    <li className="board-game">
      <button type="button" onClick={() => resume(seat)} className="board-game-open">
        <span className="board-picture board-game-art">{seat.cubeImageUri && <CubeArt src={seat.cubeImageUri} />}</span>
        <span className="board-game-words">
          <b className={title.length > 24 ? 'is-long' : ''}>{title}</b>
          <span>
            {isLobby ? 'Return' : 'Resume'} as {seat.playerName}
          </span>
          <span>
            {isLobby ? (seat.joinCode ? `Lobby ${seat.joinCode}` : 'Lobby') : `Stage ${seat.stage}-${seat.round}`}
            {!isLobby && seat.lastActiveAt && ` · ${formatTimeSince(seat.lastActiveAt)}`}
          </span>
        </span>
      </button>
      {seat.canClose && (
        <button
          type="button"
          className="icon-target board-game-close"
          onClick={() => onClose(seat)}
          aria-label={`Close ${title}`}
        >
          <CrossIcon />
        </button>
      )}
    </li>
  )
}

const SHORT_WINDOW_HEIGHT = 720
const ROW_STEP_NORMAL = 66
const ROW_STEP_SHORT = 58
const HEAD_HEIGHT = 34

/**
 * Play's sidebar games list. Sizes its fold from the height the seats leave inside a flex: 1 1 0 box,
 * so games never push the seats up or down.
 */
export function BoardPlayGames({
  seats,
  open,
  onToggle,
  onClose,
}: {
  seats: ResumableSeat[]
  open: boolean
  onToggle: () => void
  onClose: (seat: ResumableSeat) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [boxHeight, setBoxHeight] = useState(0)

  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const measure = () => setBoxHeight(el.clientHeight)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [open])

  // Close the unfolded list automatically if all games were closed.
  useEffect(() => {
    if (open && seats.length === 0) onToggle()
  }, [open, seats.length, onToggle])

  const rowStep = typeof window !== 'undefined' && window.innerHeight < SHORT_WINDOW_HEIGHT
    ? ROW_STEP_SHORT
    : ROW_STEP_NORMAL
  const headed = open || boxHeight === 0 || boxHeight >= HEAD_HEIGHT + rowStep + 4
  const availableForRows = Math.max(0, boxHeight - (headed ? HEAD_HEIGHT : 0) - 8)
  const shown = boxHeight === 0 ? 1 : Math.max(1, Math.floor(availableForRows / rowStep))
  const folds = !open && seats.length > shown
  const visibleSeats = folds ? seats.slice(0, shown - 1) : seats
  const nextSeat = seats[visibleSeats.length]

  return (
    <div ref={boxRef} className={`board-games ${open ? 'is-open' : ''} ${headed ? '' : 'is-bare'}`}>
      {headed && (
        <div className="board-rail-head-row">
          <p className="board-rail-head setup-caption">In progress</p>
          {open && (
            <button type="button" onClick={onToggle} className="btn btn-secondary btn-pill board-games-back">
              Back
            </button>
          )}
        </div>
      )}
      {seats.length > 0 ? (
        <div className="board-rail-games">
          <ul className="board-game-list">
            {visibleSeats.map((seat) => (
              <BoardGameRow key={seat.gameId} seat={seat} onClose={onClose} />
            ))}
            {folds && (
              <li className="board-game">
                <button type="button" className="board-game-open" onClick={onToggle}>
                  {nextSeat && (
                    <span className="board-picture board-game-art">
                      {nextSeat.cubeImageUri && <CubeArt src={nextSeat.cubeImageUri} />}
                    </span>
                  )}
                  <span className="board-game-words">
                    <b>{`${seats.length - visibleSeats.length}${visibleSeats.length ? ' more' : ''} games`}</b>
                    <span>Show all {seats.length}</span>
                  </span>
                </button>
              </li>
            )}
          </ul>
        </div>
      ) : (
        <p className="board-rail-none">No games in progress</p>
      )}
    </div>
  )
}
