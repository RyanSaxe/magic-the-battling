import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getLobby, joinGame } from '../../api/client'
import { useAuth } from '../../contexts/authState'
import type { SeatGrant, SeatState } from '../../hooks/useGameSeat'
import type { LobbyState } from '../../types'
import { type AppError, getAppErrorMessage, unknownToAppError } from '../../utils/appError'
import { getRememberedSeat } from '../../utils/deviceIdentity'
import { BusyNotice, StatusNotice } from '../common/StatusNotice'

/** What a lobby link shows a tab that has no live seat in the lobby, by the state of its seat. */
export function LobbySeatNotice({
  gameId,
  seat,
  onJoined,
  onClaim,
  onTakeBack,
}: {
  gameId: string
  seat: Exclude<SeatState, { kind: 'held' }>
  onJoined: (grant: SeatGrant, playerName: string, joinCode: string) => void
  onClaim: (playerName: string) => void
  onTakeBack: () => void
}) {
  const navigate = useNavigate()
  const goToPlay = (
    <button onClick={() => navigate('/play')} className="btn btn-primary flex-1 py-2">
      Go to Play
    </button>
  )
  const goHome = (
    <button onClick={() => navigate('/')} className="btn btn-secondary flex-1 py-2">
      Home
    </button>
  )

  if (seat.kind === 'claiming') {
    return <BusyNotice label="Reconnecting to your seat..." />
  }
  if (seat.kind === 'none') {
    return <JoinLobbyNotice gameId={gameId} onJoined={onJoined} onClaim={onClaim} refused={seat.refused} />
  }

  switch (seat.error.code) {
    case 'KICKED':
      return (
        <StatusNotice title="Removed from the lobby" actions={<>{goToPlay}{goHome}</>}>
          The host removed you from this lobby. You can join another game or start your own.
        </StatusNotice>
      )
    case 'SEAT_MOVED':
      return (
        <StatusNotice
          title="Open in another tab"
          actions={
            <>
              <button onClick={onTakeBack} className="btn btn-primary flex-1 py-2">
                Play here
              </button>
              {goHome}
            </>
          }
        >
          This lobby is now open in another tab or window. Only one can hold your seat at a time.
        </StatusNotice>
      )
    case 'PLAYER_NOT_IN_GAME':
      return <JoinLobbyNotice gameId={gameId} onJoined={onJoined} onClaim={onClaim} seatReleased />
    case 'GAME_NOT_FOUND':
      return (
        <StatusNotice title="Lobby not found" actions={<>{goToPlay}{goHome}</>}>
          This lobby has ended or the link is wrong. Check the link, or start a new game.
        </StatusNotice>
      )
    default:
      return (
        <StatusNotice
          title="Lobby Unavailable"
          actions={
            <>
              <button onClick={onTakeBack} className="btn btn-primary flex-1 py-2">
                Try again
              </button>
              {goHome}
            </>
          }
        >
          {getAppErrorMessage(seat.error, 'lobby-connection', 'This lobby is not available right now.')}
        </StatusNotice>
      )
  }
}

function JoinLobbyNotice({
  gameId,
  onJoined,
  onClaim,
  seatReleased = false,
  refused,
}: {
  gameId: string
  onJoined: (grant: SeatGrant, playerName: string, joinCode: string) => void
  onClaim: (playerName: string) => void
  seatReleased?: boolean
  refused?: AppError
}) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const rememberedName = getRememberedSeat(gameId)?.name ?? null
  const [lobby, setLobby] = useState<LobbyState | 'missing' | null>(null)
  const [playerName, setPlayerName] = useState(rememberedName ?? user?.username ?? '')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState(
    refused ? getAppErrorMessage(refused, 'rejoin-game', 'Could not reconnect to that seat.') : '',
  )

  useEffect(() => {
    let cancelled = false
    getLobby(gameId)
      .then((state) => {
        if (!cancelled) setLobby(state)
      })
      .catch(() => {
        if (!cancelled) setLobby('missing')
      })
    return () => {
      cancelled = true
    }
  }, [gameId])

  useEffect(() => {
    // A link to a lobby whose game has started belongs on the game page, which offers to watch or reconnect.
    if (lobby === 'missing') navigate(`/game/${gameId}/play`, { replace: true })
  }, [lobby, gameId, navigate])

  if (lobby === null || lobby === 'missing') {
    return <BusyNotice label="Loading lobby..." />
  }

  const join = async (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Please enter your name')
      return
    }
    setJoining(true)
    setError('')
    try {
      const grant = await joinGame(lobby.join_code, trimmed)
      onJoined(grant, trimmed, lobby.join_code)
    } catch (err) {
      setError(getAppErrorMessage(unknownToAppError(err, 'join-game', 'Failed to join'), 'join-game', 'Failed to join'))
      setJoining(false)
    }
  }

  const host = lobby.players.find((p) => p.is_host)?.name
  const occupied = lobby.players.length + lobby.puppet_count
  const accountSeat = user && !refused ? lobby.players.find((p) => p.name === user.username) : undefined
  const goHome = (
    <button onClick={() => navigate('/')} className="btn btn-secondary flex-1 py-2">
      Home
    </button>
  )

  if (accountSeat) {
    return (
      <StatusNotice
        title="Your seat is waiting"
        actions={
          <>
            <button onClick={() => onClaim(accountSeat.name)} className="btn btn-primary flex-1 py-2">
              Reconnect as {accountSeat.name}
            </button>
            {goHome}
          </>
        }
      >
        You joined this lobby as {accountSeat.name} with your account.
      </StatusNotice>
    )
  }

  if (seatReleased && rememberedName) {
    return (
      <StatusNotice
        title="Your seat was released"
        actions={
          <>
            <button onClick={() => join(rememberedName)} disabled={joining} className="btn btn-primary flex-1 py-2">
              {joining ? 'Joining...' : `Join again as ${rememberedName}`}
            </button>
            {goHome}
          </>
        }
      >
        You were away from this lobby for more than 10 minutes, so your seat was given up. The lobby is still open.
        {error && <p className="mt-2 text-red-300">{error}</p>}
      </StatusNotice>
    )
  }

  return (
    <StatusNotice
      title="Join this lobby"
      actions={
        <>
          <button onClick={() => join(playerName)} disabled={joining} className="btn btn-primary flex-1 py-2">
            {joining ? 'Joining...' : 'Join Lobby'}
          </button>
          {goHome}
        </>
      }
    >
      <p>
        {host ? `${host}'s lobby · ` : ''}
        {occupied} of {lobby.target_player_count} players · code{' '}
        <span className="font-mono text-amber-400">{lobby.join_code}</span>
      </p>
      <label htmlFor="lobby-join-name" className="block text-white text-sm mb-1 mt-4">
        Your Name
      </label>
      <input
        id="lobby-join-name"
        type="text"
        value={playerName}
        onChange={(e) => setPlayerName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void join(playerName)
        }}
        maxLength={32}
        className="w-full h-[42px] bg-black/40 border border-black/40 text-white rounded px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
      />
      {error && <p className="mt-2 text-red-300">{error}</p>}
    </StatusNotice>
  )
}
