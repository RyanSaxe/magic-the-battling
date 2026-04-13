import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { joinGame } from '../../api/client'
import { useAuth } from '../../contexts/authState'
import { useSession } from '../../hooks/useSession'
import { rememberPlayerForGame } from '../../utils/deviceIdentity'

interface JoinGameModalProps {
  onClose: () => void
}

export function JoinGameModal({ onClose }: JoinGameModalProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { saveSession } = useSession()

  const [manualName, setManualName] = useState('')
  const playerName = user ? user.username : manualName
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
      rememberPlayerForGame(response.game_id, playerName.trim())
      navigate(`/game/${response.game_id}/lobby`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join game')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative modal-chrome border gold-border rounded-lg p-5 w-full max-w-sm felt-raised-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-black/40">
          <h2 className="text-white font-semibold">Join Game</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-black/35 btn-dark-border text-gray-300 hover:bg-black/20 hover:text-white transition-all text-sm flex items-center justify-center"
            aria-label="Close join game modal"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="bg-red-900/45 border border-red-800/60 text-red-200 p-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-white text-sm mb-1">Your Name</label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => !user && setManualName(e.target.value)}
              disabled={!!user}
              className="w-full h-[42px] bg-black/40 border border-black/40 text-white rounded px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
              placeholder="Enter your name"
              autoFocus={!user}
            />
          </div>

          <div>
            <label className="block text-white text-sm mb-1">Join Code</label>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              className="w-full h-[42px] bg-black/40 border border-black/40 text-white rounded px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-amber-500 uppercase font-mono"
              placeholder="ABC123"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="btn btn-primary play-action-btn flex-1 py-2"
            >
              {loading ? 'Joining...' : 'Join Game'}
            </button>
            <button onClick={onClose} className="btn btn-secondary play-action-btn flex-1 py-2">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
