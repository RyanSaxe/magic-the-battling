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

  if (!isConnected) {
    return (
      <div className="game-table flex items-center justify-center">
        <div className="text-white">Connecting...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="game-table flex items-center justify-center">
        <div className="text-red-400">{error}</div>
      </div>
    )
  }

  if (!gameState) {
    return (
      <div className="game-table flex items-center justify-center">
        <div className="text-white">Loading game...</div>
      </div>
    )
  }

  const currentPhase = gameState.self_player.phase

  const phaseBadgeClass = {
    draft: 'draft',
    build: 'build',
    battle: 'battle',
    reward: 'reward',
    eliminated: 'battle',
  }[currentPhase] || 'draft'

  return (
    <div className="game-table flex flex-col">
      {/* Header */}
      <header className="flex justify-between items-center px-4 py-3 bg-black/30">
        <h1 className="text-xl font-bold text-white">
          Magic: The Battling
        </h1>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-300">
            Stage {gameState.self_player.hand_size} • Round {gameState.self_player.round}
          </div>
          <span className={`phase-badge ${phaseBadgeClass}`}>
            {currentPhase}
          </span>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* Game area */}
        <main className="flex-1 flex flex-col min-h-0">
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
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <h2 className="text-2xl text-red-400 mb-4">Eliminated</h2>
                <p className="text-gray-400">You have been eliminated from the game.</p>
              </div>
            </div>
          )}
        </main>

        {/* Sidebar */}
        <aside className="w-64 bg-black/30 p-4 overflow-auto">
          <PlayerList
            players={gameState.players}
            currentPlayerName={gameState.self_player.name}
          />
        </aside>
      </div>
    </div>
  )
}
