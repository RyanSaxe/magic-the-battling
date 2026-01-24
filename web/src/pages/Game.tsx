import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSession } from '../hooks/useSession'
import { useGame } from '../hooks/useGame'
import { rejoinGame } from '../api/client'
import { DraftPhase } from './phases/Draft'
import { BuildPhase } from './phases/Build'
import { BattlePhase } from './phases/Battle'
import { RewardPhase } from './phases/Reward'
import { PlayerList } from '../components/PlayerList'

export function Game() {
  const { gameId } = useParams<{ gameId: string }>()
  const navigate = useNavigate()
  const { session, saveSession } = useSession()
  const { gameState, isConnected, actions, error } = useGame(
    gameId ?? null,
    session?.sessionId ?? null
  )

  const [rejoinName, setRejoinName] = useState('')
  const [rejoinError, setRejoinError] = useState('')
  const [rejoinLoading, setRejoinLoading] = useState(false)

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

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Connecting...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-red-400">{error}</div>
      </div>
    )
  }

  if (!gameState) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Loading game...</div>
      </div>
    )
  }

  const currentPhase = gameState.self_player.phase

  return (
    <div className="min-h-screen bg-gray-900 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold text-white">
            Magic: The Battling
          </h1>
          <div className="flex items-center gap-4 text-white">
            <span>Round {gameState.self_player.round}</span>
            <span>Stage {gameState.self_player.stage}</span>
            <span className="capitalize bg-blue-600 px-2 py-1 rounded">
              {currentPhase}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3">
            {currentPhase === 'draft' && (
              <DraftPhase gameState={gameState} actions={actions} />
            )}
            {currentPhase === 'build' && (
              <BuildPhase gameState={gameState} actions={actions} />
            )}
            {currentPhase === 'battle' && (
              <BattlePhase gameState={gameState} actions={actions} />
            )}
            {currentPhase === 'reward' && (
              <RewardPhase gameState={gameState} actions={actions} />
            )}
            {currentPhase === 'eliminated' && (
              <div className="bg-gray-800 rounded-lg p-8 text-center">
                <h2 className="text-2xl text-red-400 mb-4">Eliminated</h2>
                <p className="text-gray-400">You have been eliminated from the game.</p>
              </div>
            )}
          </div>

          <div>
            <PlayerList
              players={gameState.players}
              currentPlayerName={gameState.self_player.name}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
