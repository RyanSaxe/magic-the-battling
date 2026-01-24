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

  useEffect(() => {
    if (gameState) {
      navigate(`/game/${gameId}/play`)
    }
  }, [gameState, gameId, navigate])

  const copyJoinCode = () => {
    if (lobbyState?.join_code) {
      navigator.clipboard.writeText(lobbyState.join_code)
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
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-lg p-8 w-full max-w-md">
          <h1 className="text-2xl font-bold text-white text-center mb-6">
            Rejoin Game
          </h1>

          {rejoinError && (
            <div className="bg-red-900 text-red-200 p-3 rounded mb-4">
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
                className="w-full bg-gray-700 text-white rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter your name exactly as before"
              />
            </div>

            <button
              onClick={handleRejoin}
              disabled={rejoinLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-medium py-2 px-4 rounded transition-colors"
            >
              {rejoinLoading ? 'Rejoining...' : 'Rejoin Game'}
            </button>

            <button
              onClick={() => navigate('/')}
              className="w-full bg-gray-600 hover:bg-gray-500 text-white font-medium py-2 px-4 rounded transition-colors"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-white text-center mb-6">
          Game Lobby
        </h1>

        {!isConnected && (
          <div className="bg-yellow-900 text-yellow-200 p-3 rounded mb-4">
            Connecting...
          </div>
        )}

        {error && (
          <div className="bg-red-900 text-red-200 p-3 rounded mb-4">
            {error}
          </div>
        )}

        {lobbyState && (
          <>
            <div className="bg-gray-700 rounded p-4 mb-6">
              <p className="text-gray-400 text-sm mb-1">Join Code</p>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-mono font-bold text-white">
                  {lobbyState.join_code}
                </span>
                <button
                  onClick={copyJoinCode}
                  className="bg-gray-600 hover:bg-gray-500 text-white px-2 py-1 rounded text-sm"
                >
                  Copy
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
                    className="bg-gray-700 p-3 rounded flex items-center justify-between"
                  >
                    <span className="text-white">{player.name}</span>
                    {index === 0 && (
                      <span className="text-yellow-400 text-sm">Host</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={actions.startGame}
              disabled={!lobbyState.can_start}
              className={`w-full py-3 rounded font-medium transition-colors ${
                lobbyState.can_start
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
              }`}
            >
              {lobbyState.can_start
                ? 'Start Game'
                : `Need ${2 - lobbyState.players.length} more player(s)`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
