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

        {lobbyState && (
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
            </div>

            <div className="mb-6">
              <h2 className="text-white font-medium mb-3">
                Players ({lobbyState.players.length})
              </h2>
              <div className="space-y-2">
                {lobbyState.players.map((player, index) => (
                  <div
                    key={player.name}
                    className="bg-black/30 p-3 rounded-lg flex items-center justify-between"
                  >
                    <span className="text-white">{player.name}</span>
                    {index === 0 && (
                      <span className="text-amber-400 text-sm">Host</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={actions.startGame}
              disabled={!lobbyState.can_start}
              className="btn btn-primary w-full py-3"
            >
              {lobbyState.can_start
                ? 'Start Game'
                : `Waiting for ${2 - lobbyState.players.length} more player(s)`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
