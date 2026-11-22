import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../../contexts'
import { unknownToAppError } from '../../utils/appError'
import { joinLobbyByCode } from '../../utils/joinLobby'
import { FIELD_SURFACE } from '../common/styles'

/** A join code field that takes the signed-in player straight into the lobby. */
export function JoinCodeBox({ playerName, className }: { playerName: string; className?: string }) {
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const code = joinCode.trim()
    if (!code) return
    setJoining(true)
    try {
      navigate(await joinLobbyByCode(code, playerName))
    } catch (err) {
      addToast(unknownToAppError(err, 'join-game', 'Failed to join game').message, 'error')
      setJoining(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      className={`flex h-9 items-center rounded-md ${FIELD_SURFACE} pl-2.5 pr-0.5 focus-within:ring-2 focus-within:ring-[var(--color-gold-bright)] ${className ?? ''}`}
    >
      <input
        type="text"
        value={joinCode}
        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
        aria-label="Join code"
        placeholder="Enter join code"
        className="w-[9.5rem] min-w-0 bg-transparent font-mono text-sm uppercase text-white placeholder:font-sans placeholder:normal-case focus:outline-none"
      />
      <button
        type="submit"
        disabled={joining || !joinCode.trim()}
        className="btn btn-secondary h-8 !py-0 px-3 text-sm font-medium whitespace-nowrap disabled:opacity-50"
      >
        {joining ? 'Joining...' : 'Join Lobby'}
      </button>
    </form>
  )
}
