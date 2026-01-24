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
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-white text-center mb-8">
          Magic: The Battling
        </h1>

        {error && (
          <div className="bg-red-900 text-red-200 p-3 rounded mb-4">
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
              className="w-full bg-gray-700 text-white rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="w-full bg-gray-700 text-white rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="w-full bg-gray-700 text-white rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
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
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-medium py-2 px-4 rounded transition-colors"
                >
                  {loading ? 'Creating...' : 'Create Game'}
                </button>
                <button
                  onClick={() => setIsJoining(true)}
                  className="flex-1 bg-gray-600 hover:bg-gray-500 text-white font-medium py-2 px-4 rounded transition-colors"
                >
                  Join Game
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleJoinGame}
                  disabled={loading}
                  className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-medium py-2 px-4 rounded transition-colors"
                >
                  {loading ? 'Joining...' : 'Join'}
                </button>
                <button
                  onClick={() => setIsJoining(false)}
                  className="flex-1 bg-gray-600 hover:bg-gray-500 text-white font-medium py-2 px-4 rounded transition-colors"
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
