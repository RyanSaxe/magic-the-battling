import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { createGame } from '../../api/client'
import { useSession } from '../../hooks/useSession'

interface CreateGameModalProps {
  onClose: () => void
}

export function CreateGameModal({ onClose }: CreateGameModalProps) {
  const navigate = useNavigate()
  const { saveSession } = useSession()

  const [playerName, setPlayerName] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [cubeId, setCubeId] = useState('auto')
  const [targetPlayerCount, setTargetPlayerCount] = useState(4)
  const [useUpgrades, setUseUpgrades] = useState(true)
  const [autoApproveSpectators, setAutoApproveSpectators] = useState(false)
  const [useVanguards, setUseVanguards] = useState(false)
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

    setLoading(true)
    setError('')

    try {
      const response = await createGame(playerName, {
        cubeId: cubeId || 'auto',
        useUpgrades,
        useVanguards,
        autoApproveSpectators,
        targetPlayerCount,
      })
      saveSession(response.session_id, response.player_id)
      navigate(`/game/${response.game_id}/lobby`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create game')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-gray-900 rounded-lg p-6 w-full max-w-sm mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-white mb-4">Create Game</h2>

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
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              className="w-full bg-gray-800 text-white rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="Enter your name"
              autoFocus
            />
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-sm text-gray-400 hover:text-gray-300 transition-colors"
          >
            {showAdvanced ? '▾ Advanced Options' : '▸ Advanced Options'}
          </button>

          {showAdvanced && (
            <div className="space-y-3 border-t border-gray-700 pt-3">
              <div>
                <label className="block text-gray-300 text-sm mb-1">CubeCobra ID</label>
                <input
                  type="text"
                  value={cubeId}
                  onChange={(e) => setCubeId(e.target.value)}
                  className="w-full bg-gray-800 text-white rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="auto"
                />
              </div>

              <div>
                <label className="block text-gray-300 text-sm mb-1">Target Players</label>
                <div className="flex gap-1.5">
                  {[2, 4, 6, 8].map((count) => (
                    <button
                      key={count}
                      onClick={() => setTargetPlayerCount(count)}
                      className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                        targetPlayerCount === count
                          ? 'bg-amber-500 text-black'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      {count}
                    </button>
                  ))}
                </div>
                <p className="text-gray-500 text-xs mt-0.5">Bots will fill empty slots.</p>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useUpgrades}
                  onChange={(e) => setUseUpgrades(e.target.checked)}
                  className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-amber-500 focus:ring-amber-500"
                />
                <span className="text-white text-sm">Upgrades</span>
                <span className="text-gray-500 text-xs">— upgrade a card every 3 rounds</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoApproveSpectators}
                  onChange={(e) => setAutoApproveSpectators(e.target.checked)}
                  className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-amber-500 focus:ring-amber-500"
                />
                <span className="text-white text-sm">Open Spectating</span>
                <span className="text-gray-500 text-xs">— let anyone watch</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer opacity-50">
                <input
                  type="checkbox"
                  checked={useVanguards}
                  onChange={(e) => setUseVanguards(e.target.checked)}
                  disabled
                  className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-amber-500 focus:ring-amber-500"
                />
                <span className="text-white text-sm">Vanguards</span>
                <span className="text-gray-500 text-xs">(coming soon)</span>
              </label>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="btn btn-primary flex-1 py-2 animate-gentle-glow"
            >
              {loading ? 'Creating...' : 'Create Game'}
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
