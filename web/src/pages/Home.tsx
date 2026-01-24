import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createGame, joinGame } from '../api/client'
import { useSession } from '../hooks/useSession'

export function Home() {
  const navigate = useNavigate()
  const { saveSession } = useSession()

  const [playerName, setPlayerName] = useState('')
  const [cubeId, setCubeId] = useState('auto')
  const [joinCode, setJoinCode] = useState('')
  const [isJoining, setIsJoining] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleCreateGame = async () => {
    if (!playerName.trim()) {
      setError('Please enter your name')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await createGame(playerName, cubeId || 'auto')
      saveSession(response.session_id, response.player_id)
      navigate(`/game/${response.game_id}/lobby`)
    } catch {
      setError('Failed to create game')
    } finally {
      setLoading(false)
    }
  }

  const handleJoinGame = async () => {
    if (!playerName.trim()) {
      setError('Please enter your name')
      return
    }
    if (!joinCode.trim()) {
      setError('Please enter a join code')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await joinGame(joinCode, playerName)
      saveSession(response.session_id, response.player_id)
      navigate(`/game/${response.game_id}/lobby`)
    } catch {
      setError('Failed to join game. Check your join code.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="game-table flex items-center justify-center p-4">
      <div className="bg-black/60 backdrop-blur rounded-lg p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-white text-center mb-2">
          Magic: The Battling
        </h1>
        <p className="text-gray-400 text-center text-sm mb-8">
          Draft, build, battle
        </p>

        {error && (
          <div className="bg-red-900/50 text-red-200 p-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-gray-300 mb-1">Your Name</label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full bg-gray-800 text-white rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="Enter your name"
            />
          </div>

          {!isJoining && (
            <div>
              <label className="block text-gray-300 mb-1">
                Cube ID <span className="text-gray-500">(optional)</span>
              </label>
              <input
                type="text"
                value={cubeId}
                onChange={(e) => setCubeId(e.target.value)}
                className="w-full bg-gray-800 text-white rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="auto"
              />
            </div>
          )}

          {isJoining && (
            <div>
              <label className="block text-gray-300 mb-1">Join Code</label>
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="w-full bg-gray-800 text-white rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500 uppercase font-mono"
                placeholder="ABC123"
              />
            </div>
          )}

          <div className="flex gap-3">
            {!isJoining ? (
              <>
                <button
                  onClick={handleCreateGame}
                  disabled={loading}
                  className="btn btn-primary flex-1 py-2"
                >
                  {loading ? 'Creating...' : 'Create Game'}
                </button>
                <button
                  onClick={() => setIsJoining(true)}
                  className="btn btn-secondary flex-1 py-2"
                >
                  Join Game
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleJoinGame}
                  disabled={loading}
                  className="btn btn-primary flex-1 py-2"
                >
                  {loading ? 'Joining...' : 'Join'}
                </button>
                <button
                  onClick={() => setIsJoining(false)}
                  className="btn btn-secondary flex-1 py-2"
                >
                  Back
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
