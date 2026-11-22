import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/authState'
import { unknownToAppError } from '../../utils/appError'
import { getRememberedGuestName, rememberGuestName } from '../../utils/deviceIdentity'
import { joinLobbyByCode } from '../../utils/joinLobby'
import { TEXT_INPUT } from '../common/styles'
import { Dialog } from '../common/Dialog'

interface JoinGameModalProps {
  onClose: () => void
}

export function JoinGameModal({ onClose }: JoinGameModalProps) {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [manualName, setManualName] = useState(() => getRememberedGuestName() ?? '')
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
    const name = playerName.trim()
    const code = joinCode.trim()
    if (!name) {
      setError('Please enter your name')
      return
    }
    if (!code) {
      setError('Please enter a join code')
      return
    }

    setLoading(true)
    setError('')

    try {
      const lobbyPath = await joinLobbyByCode(code, name)
      if (!user) rememberGuestName(name)
      navigate(lobbyPath)
    } catch (err) {
      setError(unknownToAppError(err, 'join-game', 'Failed to join game').message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog title="Join Game" onClose={onClose}>

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
            className={`${TEXT_INPUT} disabled:opacity-50`}
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
            className={`${TEXT_INPUT} uppercase font-mono`}
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
    </Dialog>
  )
}
