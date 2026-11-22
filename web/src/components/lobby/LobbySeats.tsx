import type { CSSProperties, ReactNode } from 'react'
import type { useVoiceChat } from '../../hooks/useVoiceChat'
import type { LobbyPlayer, LobbyState } from '../../types'
import { CrossIcon } from '../icons/CrossIcon'
import { Spinner } from '../icons/Spinner'
import { MicToggle } from '../sidebar/MicToggle'

type VoiceChat = ReturnType<typeof useVoiceChat>

// A longer name steps down in size, so eight seats still fit without scrolling.
const LONG_NAME = 22

interface SeatActions {
  kickPlayer: (playerId: string) => void
  addPuppet: () => void
  removePuppet: () => void
}

// From 1024px wide the seats make two rows at most, or one.
function seatColumns(seats: number): number {
  return seats === 6 ? 3 : Math.min(seats, 4)
}

function Seat({ name, status, children, isSelf = false }: {
  name: string
  status: ReactNode
  children?: ReactNode
  isSelf?: boolean
}) {
  return (
    <li className={`seat seat-taken ${isSelf ? 'is-self' : ''}`}>
      <span className="seat-text">
        <span className={`seat-name ${name.length > LONG_NAME ? 'is-long-name' : ''}`}>{name}</span>
        <span className="setup-caption seat-status">{status}</span>
      </span>
      {children}
    </li>
  )
}

function PlayerStatus({ player, isSelf }: { player: LobbyPlayer; isSelf: boolean }) {
  const details = [isSelf && 'You', player.is_host && 'Host', !player.is_connected && 'Away'].filter(Boolean)
  // An away player is called not ready by that word alone.
  const showsReady = player.is_ready || player.is_connected
  return (
    <>
      {details.join(' · ')}
      {details.length > 0 && showsReady && ' · '}
      {showsReady && (
        <span className={`whitespace-nowrap ${player.is_ready ? 'seat-ready' : ''}`}>
          {player.is_ready ? 'Ready' : 'Not ready'}
        </span>
      )}
    </>
  )
}

function PlayerMic({ player, isSelf, voiceChat }: { player: LobbyPlayer; isSelf: boolean; voiceChat: VoiceChat }) {
  const { state } = voiceChat
  if (isSelf) {
    if (state.peers.length === 0) return null
    return (
      <MicToggle
        variant="seat"
        muted={state.isMuted}
        audioLevelKey="__self__"
        onClick={() => voiceChat.toggleSelfMute()}
      />
    )
  }
  const peer = state.peers.find((p) => p.name === player.name)
  if (!peer) return null
  return (
    <MicToggle
      variant="seat"
      muted={state.mutedPeers.has(player.name)}
      connectionState={peer.connectionState}
      audioLevelKey={player.name}
      remoteMuted={state.remoteMutedPeers.has(player.name)}
      onClick={() => voiceChat.togglePeerMute(player.name)}
    />
  )
}

function PuppetStatus({ index, available }: { index: number; available: number | null }) {
  if (available === null) {
    return (
      <>
        <Spinner className="mr-1 inline h-2.5 w-2.5 max-[390px]:hidden" />
        Finding
      </>
    )
  }
  if (index >= available) return <span className="text-[var(--loss-text)]">No data</span>
  return <span className="seat-ready">Ready</span>
}

/** The lobby's seats: its players, then its puppets, then the seats still open. */
export function LobbySeats({
  lobby,
  isHost,
  openSeats,
  compact,
  selfId,
  voiceChat,
  actions,
  onPuppetHelp,
}: {
  lobby: LobbyState
  isHost: boolean
  openSeats: number
  compact: boolean
  selfId: string | undefined
  voiceChat: VoiceChat
  actions: SeatActions
  onPuppetHelp: () => void
}) {
  const { players, puppet_count: puppets, target_player_count: seats, available_puppet_count: available } = lobby
  const canAddPuppet = isHost && available !== null && puppets < available

  const puppetHelp = (
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
    <ul
      className={`lobby-seats ${compact ? 'is-compact' : ''}`}
      style={{ '--seat-columns': seatColumns(seats) } as CSSProperties}
    >
      {players.map((player) => {
        const isSelf = player.player_id === selfId
        return (
          <Seat
            key={player.player_id}
            name={player.name}
            isSelf={isSelf}
            status={<PlayerStatus player={player} isSelf={isSelf} />}
          >
            <PlayerMic player={player} isSelf={isSelf} voiceChat={voiceChat} />
            {isHost && !player.is_host && (
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
          </Seat>
        )
      })}
      {Array.from({ length: puppets }, (_, index) => (
        <Seat
          key={`puppet-${index}`}
          name={`Puppet\u00a0${index + 1}`}
          status={<PuppetStatus index={index} available={available} />}
        >
          {index === 0 && puppetHelp}
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
        </Seat>
      ))}
      {Array.from({ length: openSeats }, (_, index) => (
        <li key={`open-${index}`} className="seat seat-open">
          {isHost ? (
            <button type="button" onClick={actions.addPuppet} disabled={!canAddPuppet} className="seat-text seat-add">
              <span className="seat-name">Open seat</span>
              <span className="setup-caption seat-status">+ Add puppet</span>
            </button>
          ) : (
            <span className="seat-text">
              <span className="seat-name">Open seat</span>
            </span>
          )}
          {isHost && puppets === 0 && index === 0 && (
            <>
              {puppetHelp}
              {/* Where the ✕ lands once this seat has a puppet, so a second tap on ? can't remove it */}
              <span aria-hidden="true" className="w-11 shrink-0" />
            </>
          )}
        </li>
      ))}
    </ul>
  )
}
