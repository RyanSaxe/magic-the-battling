import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/authState'
import { unknownToAppError } from '../../utils/appError'
import { getRememberedGuestName, rememberGuestName } from '../../utils/deviceIdentity'
import { joinLobbyByCode } from '../../utils/joinLobby'
import { FIELD_ERROR, FIELD_LABEL, TEXT_INPUT } from '../common/styles'
import { Dialog } from '../common/Dialog'

interface JoinGameModalProps {
  onClose: () => void
}

type JoinFieldError = { field: 'name' | 'code'; message: string }

export function JoinGameModal({ onClose }: JoinGameModalProps) {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [manualName, setManualName] = useState(() => getRememberedGuestName() ?? '')
  const playerName = user ? user.username : manualName
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState<JoinFieldError | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    const name = playerName.trim()
    const code = joinCode.trim()
    if (!name) {
      setError({ field: 'name', message: 'Please enter your name' })
      return
    }
    if (!code) {
      setError({ field: 'code', message: 'Please enter a join code' })
      return
    }

    setLoading(true)
    setError(null)

    try {
      const lobbyPath = await joinLobbyByCode(code, name)
      if (!user) rememberGuestName(name)
      navigate(lobbyPath)
    } catch (err) {
      const appError = unknownToAppError(err, 'join-game', 'Failed to join game')
      setError({
        field: appError.code === 'PLAYER_NAME_TAKEN' ? 'name' : 'code',
        message: appError.message,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog title="Join Game" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className={FIELD_LABEL}>Your Name</label>
          <input
            type="text"
            value={playerName}
            onChange={(e) => {
              if (!user) setManualName(e.target.value)
              setError(null)
            }}
            disabled={!!user}
            className={`${TEXT_INPUT} disabled:opacity-50`}
            placeholder="Enter your name"
            autoFocus={!user}
          />
          {error?.field === 'name' && (
            <p role="alert" className={FIELD_ERROR}>{error.message}</p>
          )}
        </div>

        <div>
          <label className={FIELD_LABEL}>Join Code</label>
          <input
            type="text"
            value={joinCode}
            onChange={(e) => {
              setJoinCode(e.target.value.toUpperCase())
              setError(null)
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            className={`${TEXT_INPUT} uppercase font-mono`}
            placeholder="ABC123"
          />
          {error?.field === 'code' && (
            <p role="alert" className={FIELD_ERROR}>{error.message}</p>
          )}
        </div>

        <div className="flex gap-3 pt-1">
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
    </Dialog>
  )
}
