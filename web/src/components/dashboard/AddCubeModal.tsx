import { useState } from 'react'
import { createBattler } from '../../api/client'
import type { PlayMode, UserBattler } from '../../types'
import { unknownToAppError } from '../../utils/appError'
import { SurfaceCard } from '../common/SurfaceCard'
import { DefaultOpponentsField } from './DefaultOpponentsField'

export function AddCubeModal({
  initialCubeId = '',
  onClose,
  onCreated,
  addToast,
}: {
  initialCubeId?: string
  onClose: () => void
  onCreated: (b: UserBattler) => void
  addToast: (msg: string, type: 'error' | 'info') => void
}) {
  const [cubeId, setCubeId] = useState(initialCubeId)
  const [displayName, setDisplayName] = useState('')
  const [playMode, setPlayMode] = useState<PlayMode>('limited')
  const [useUpgrades, setUseUpgrades] = useState(true)
  const [puppetCount, setPuppetCount] = useState(3)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cubeId.trim()) {
      addToast('Please enter a CubeCobra ID', 'error')
      return
    }
    setSaving(true)
    try {
      const b = await createBattler({
        cube_id: cubeId.trim(),
        display_name: displayName.trim() || undefined,
        play_mode: playMode,
        use_upgrades: useUpgrades,
        puppet_count: puppetCount,
        target_player_count: puppetCount + 1,
      })
      onCreated(b)
    } catch (err) {
      addToast(unknownToAppError(err, 'create-battler', 'Failed to create').message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <SurfaceCard as="form" onSubmit={handleSubmit} className="relative">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-black/40">
          <h3 className="text-white font-semibold">Add Cube / Deck</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-black/35 btn-dark-border text-amber-100/70 hover:bg-black/20 hover:text-white transition-all text-sm flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-white text-sm mb-1">CubeCobra ID</label>
            <input
              type="text"
              value={cubeId}
              onChange={(e) => setCubeId(e.target.value)}
              className="w-full h-[42px] bg-black/40 border border-black/40 text-white rounded px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="e.g. auto"
              autoFocus
              required
            />
          </div>

          <div>
            <label className="block text-white text-sm mb-1">Display Name <span className="text-amber-200/45">(optional)</span></label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full h-[42px] bg-black/40 border border-black/40 text-white rounded px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="My Draft Cube"
            />
          </div>

          <label className="bg-black/35 border border-black/40 rounded-lg px-3 py-2.5 flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={playMode === 'constructed'}
              onChange={(e) => setPlayMode(e.target.checked ? 'constructed' : 'limited')}
              className="w-4 h-4 rounded bg-black/40 border-black/40 text-amber-500 focus:ring-amber-500"
            />
            <span className="text-white text-sm">Constructed</span>
            <span className="text-amber-200/45 text-xs">— bring your own deck</span>
          </label>

          <label className="bg-black/35 border border-black/40 rounded-lg px-3 py-2.5 flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={useUpgrades}
              onChange={(e) => setUseUpgrades(e.target.checked)}
              className="w-4 h-4 rounded bg-black/40 border-black/40 text-amber-500 focus:ring-amber-500"
            />
            <span className="text-white text-sm">Upgrades</span>
            <span className="text-amber-200/45 text-xs">— upgrade a card every 3 rounds</span>
          </label>

          <DefaultOpponentsField value={puppetCount} onChange={setPuppetCount} />
        </div>

        <button
          type="submit"
          disabled={saving || !cubeId.trim()}
          className="btn btn-primary w-full py-2 mt-4 font-semibold disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Add Cube / Deck'}
        </button>
      </SurfaceCard>
    </div>
  )
}
