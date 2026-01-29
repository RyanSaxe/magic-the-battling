import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSession } from '../hooks/useSession'
import { useGame } from '../hooks/useGame'
import { rejoinGame } from '../api/client'

export function Lobby() {
  const { gameId } = useParams<{ gameId: string }>()
  const navigate = useNavigate()
  const { session, saveSession } = useSession()
  const { lobbyState, gameState, isConnected, actions, error } = useGame(
    gameId ?? null,
    session?.sessionId ?? null
  )

  const [rejoinName, setRejoinName] = useState('')
  const [rejoinError, setRejoinError] = useState('')
  const [rejoinLoading, setRejoinLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [startingGame, setStartingGame] = useState(false)

  useEffect(() => {
    if (gameState) {
      navigate(`/game/${gameId}/play`)
    }
  }, [gameState, gameId, navigate])

  const copyJoinCode = () => {
    if (lobbyState?.join_code) {
      navigator.clipboard.writeText(lobbyState.join_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleRejoin = async () => {
    if (!rejoinName.trim() || !gameId) {
      setRejoinError('Please enter your name')
      return
    }

    setRejoinLoading(true)
    setRejoinError('')

    try {
      const response = await rejoinGame(gameId, rejoinName)
      saveSession(response.session_id, response.player_id)
    } catch {
      setRejoinError('Could not rejoin. Check your name matches exactly.')
    } finally {
      setRejoinLoading(false)
    }
  }

  if (!session) {
    return (
      <div className="game-table flex items-center justify-center p-4">
        <div className="bg-black/60 backdrop-blur rounded-lg p-8 w-full max-w-md">
          <h1 className="text-2xl font-bold text-white text-center mb-6">
            Rejoin Game
          </h1>

          {rejoinError && (
            <div className="bg-red-900/50 text-red-200 p-3 rounded mb-4">
              {rejoinError}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-gray-300 mb-1">Your Name</label>
              <input
                type="text"
                value={rejoinName}
                onChange={(e) => setRejoinName(e.target.value)}
                className="w-full bg-gray-800 text-white rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="Enter your name exactly as before"
              />
            </div>

            <button
              onClick={handleRejoin}
              disabled={rejoinLoading}
              className="btn btn-primary w-full py-2"
            >
              {rejoinLoading ? 'Rejoining...' : 'Rejoin Game'}
            </button>

            <button
              onClick={() => navigate('/')}
              className="btn btn-secondary w-full py-2"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="game-table flex items-center justify-center p-4">
      <div className="bg-black/60 backdrop-blur rounded-lg p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-white text-center mb-6">
          Game Lobby
        </h1>

        {!isConnected && (
          <div className="bg-amber-900/50 text-amber-200 p-3 rounded mb-4">
            Connecting...
          </div>
        )}

        {error && (
          <div className="bg-red-900/50 text-red-200 p-3 rounded mb-4">
            {error}
          </div>
        )}

        {lobbyState && (() => {
          const currentPlayer = lobbyState.players.find(p => p.player_id === session?.playerId)
          const isHost = currentPlayer?.is_host ?? false
          const isReady = currentPlayer?.is_ready ?? false
          const botSlots = lobbyState.target_player_count - lobbyState.players.length
          const allReady = lobbyState.players.every(p => p.is_ready)
          const availableBots = lobbyState.available_bot_count
          const hasEnoughBots = availableBots !== null && availableBots >= botSlots

          return (
            <>
              <div className="bg-black/40 rounded-lg p-4 mb-6 text-center">
                <p className="text-gray-400 text-sm mb-2">Share this code</p>
                <div className="flex items-center justify-center gap-3">
                  <span className="text-3xl font-mono font-bold text-amber-400 tracking-wider">
                    {lobbyState.join_code}
                  </span>
                  <button
                    onClick={copyJoinCode}
                    className="btn btn-secondary text-sm py-1"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <p className="text-gray-500 text-sm mt-2">
                  Target: {lobbyState.target_player_count} players
                  {botSlots > 0 && ` (${botSlots} bot slot${botSlots > 1 ? 's' : ''})`}
                </p>
              </div>

              <div className="mb-6">
                <h2 className="text-white font-medium mb-3">
                  Players ({lobbyState.players.length}/{lobbyState.target_player_count})
                </h2>
                <div className="space-y-2">
                  {lobbyState.players.map((player) => (
                    <div
                      key={player.name}
                      className="bg-black/30 p-3 rounded-lg flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            player.is_ready ? 'bg-green-500' : 'bg-gray-500'
                          }`}
                        />
                        <span className="text-white truncate max-w-[150px]">{player.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {player.is_host && (
                          <span className="text-amber-400 text-sm">Host</span>
                        )}
                        <span className={`text-sm ${player.is_ready ? 'text-green-400' : 'text-gray-500'}`}>
                          {player.is_ready ? 'Ready' : 'Not Ready'}
                        </span>
                      </div>
                    </div>
                  ))}
                  {botSlots > 0 && Array.from({ length: botSlots }).map((_, i) => {
                    const isSearching = availableBots === null
                    const botAvailable = !isSearching && i < availableBots
                    const botUnavailable = !isSearching && i >= availableBots
                    return (
                      <div
                        key={`bot-${i}`}
                        className={`bg-black/20 p-3 rounded-lg flex items-center justify-between border border-dashed ${
                          isSearching ? 'border-amber-600/50' : botAvailable ? 'border-cyan-700' : 'border-red-700/50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {isSearching ? (
                            <svg className="animate-spin h-3 w-3 text-amber-500" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                          ) : (
                            <span className={`w-2 h-2 rounded-full ${botAvailable ? 'bg-cyan-600' : 'bg-red-700/50'}`} />
                          )}
                          <span className={`italic ${isSearching ? 'text-amber-400' : botAvailable ? 'text-cyan-500' : 'text-red-400/70'}`}>
                            Bot {i + 1}
                          </span>
                        </div>
                        {isSearching && (
                          <span className="text-amber-400/70 text-xs">Searching...</span>
                        )}
                        {botUnavailable && (
                          <span className="text-red-400/70 text-xs">No match found</span>
                        )}
                      </div>
                    )
                  })}
                  {botSlots > 0 && availableBots !== null && availableBots < botSlots && (
                    <p className="text-gray-500 text-xs mt-2 px-1">
                      Bots are past players with matching settings. Invite more players or try different game options.
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                {!isHost && (
                  <button
                    onClick={() => actions.setReady(!isReady)}
                    className={`w-full py-3 rounded font-medium transition-colors ${
                      isReady
                        ? 'bg-gray-600 text-white hover:bg-gray-500'
                        : 'bg-green-600 text-white hover:bg-green-500'
                    }`}
                  >
                    {isReady ? 'Unready' : 'Ready'}
                  </button>
                )}

                {isHost && (
                  <>
                    <button
                      onClick={() => actions.setReady(!isReady)}
                      className={`w-full py-3 rounded font-medium transition-colors ${
                        isReady
                          ? 'bg-gray-600 text-white hover:bg-gray-500'
                          : 'bg-green-600 text-white hover:bg-green-500'
                      }`}
                    >
                      {isReady ? 'Unready' : 'Ready'}
                    </button>
                    <button
                      onClick={() => {
                        setStartingGame(true)
                        actions.startGame()
                      }}
                      disabled={!lobbyState.can_start || startingGame}
                      className="btn btn-primary w-full py-3"
                    >
                      {startingGame ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Starting...
                        </span>
                      ) : lobbyState.target_player_count < 2
                        ? 'Need at least 2 players'
                        : !allReady
                        ? 'Waiting for all players to ready'
                        : availableBots === null
                        ? 'Searching for bots...'
                        : !hasEnoughBots
                        ? `${botSlots - availableBots} bot${botSlots - availableBots > 1 ? 's' : ''} not found - invite players`
                        : 'Start Game'}
                    </button>
                  </>
                )}
              </div>
            </>
          )
        })()}
      </div>
    </div>
  )
}
