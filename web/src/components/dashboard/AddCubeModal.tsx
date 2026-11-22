import { useState } from 'react'
import { createBattler } from '../../api/client'
import type { PlayMode, UserBattler } from '../../types'
import { unknownToAppError } from '../../utils/appError'
import { DefaultOpponentsField } from './DefaultOpponentsField'
import { OPTION_BOX, TEXT_INPUT } from '../common/styles'
import { Dialog } from '../common/Dialog'

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
    <Dialog title="Add Cube / Deck" onClose={onClose} onSubmit={handleSubmit}>

      <div className="space-y-3">
        <div>
          <label className="block text-white text-sm mb-1">CubeCobra ID</label>
          <input
            type="text"
            value={cubeId}
            onChange={(e) => setCubeId(e.target.value)}
            className={TEXT_INPUT}
            placeholder="e.g. auto, or paste the cube's link"
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
            className={TEXT_INPUT}
            placeholder="My Draft Cube"
          />
        </div>

        <label className={`${OPTION_BOX} px-3 py-2.5 flex items-center gap-2 cursor-pointer`}>
          <input
            type="checkbox"
            checked={playMode === 'constructed'}
            onChange={(e) => setPlayMode(e.target.checked ? 'constructed' : 'limited')}
            className="w-4 h-4 rounded bg-black/40 border-black/40"
          />
          <span className="text-white text-sm">Constructed</span>
          <span className="text-amber-200/45 text-xs">— bring your own deck</span>
        </label>

        <label className={`${OPTION_BOX} px-3 py-2.5 flex items-center gap-2 cursor-pointer`}>
          <input
            type="checkbox"
            checked={useUpgrades}
            onChange={(e) => setUseUpgrades(e.target.checked)}
            className="w-4 h-4 rounded bg-black/40 border-black/40"
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
    </Dialog>
  )
}
