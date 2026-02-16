import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { joinGame } from '../../api/client'
import { useSession } from '../../hooks/useSession'

interface JoinGameModalProps {
  onClose: () => void
}

export function JoinGameModal({ onClose }: JoinGameModalProps) {
  const navigate = useNavigate()
  const { saveSession } = useSession()

  const [playerName, setPlayerName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  const handleSubmit = async () => {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join game')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
      <div
        className="bg-gray-900 rounded-lg p-6 w-full max-w-sm mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-white mb-4">Join Game</h2>

        {error && (
          <div className="bg-red-900/50 text-red-200 p-3 rounded mb-4 text-sm">{error}</div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-gray-300 text-sm mb-1">Your Name</label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full bg-gray-800 text-white rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="Enter your name"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-gray-300 text-sm mb-1">Join Code</label>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              className="w-full bg-gray-800 text-white rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500 uppercase font-mono"
              placeholder="ABC123"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="btn btn-primary flex-1 py-2"
            >
              {loading ? 'Joining...' : 'Join Game'}
            </button>
            <button onClick={onClose} className="btn btn-secondary flex-1 py-2">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
