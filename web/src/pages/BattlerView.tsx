import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { FaDiscord } from 'react-icons/fa6'
import { useAuth } from '../contexts/authState'
import { useToast } from '../contexts'
import { AppHeader, UserMenuButton } from '../components/common/AppHeader'
import { CubeCobraPrimerLink } from '../components/common/CubeCobraPrimerLink'
import { CubeGameHistory } from '../components/CubeGameHistory'
import { getBattlers, getBattlerGames, updateBattler, deleteBattler } from '../api/client'
import type { UserBattler, PlayMode } from '../types'
import { unknownToAppError } from '../utils/appError'
import { battlerPlayUrl } from '../utils/battlerPlayUrl'

export function BattlerView() {
  const { listId } = useParams<{ listId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, loading: authLoading } = useAuth()
  const { addToast } = useToast()

  const [battler, setBattler] = useState<UserBattler | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) {
      navigate(`/login?returnTo=${encodeURIComponent(location.pathname)}`, { replace: true })
    }
  }, [authLoading, user, navigate, location.pathname])

  useEffect(() => {
    if (!user || !listId) return
    let cancelled = false
    getBattlers()
      .then(({ battlers }) => {
        if (cancelled) return
        const b = battlers.find((x) => x.id === Number(listId))
        if (!b) {
          navigate('/dashboard', { replace: true })
          return
        }
        setBattler(b)
      })
      .catch(() => { if (!cancelled) addToast('Failed to load data', 'error') })
      .finally(() => { if (!cancelled) setLoadingData(false) })
    return () => { cancelled = true }
  }, [user, listId, navigate, addToast])

  const fetchGames = useCallback(async (_id: string, opts: { offset?: number; playMode?: string; useUpgrades?: boolean }) => {
    if (!battler) throw new Error('No battler')
    return getBattlerGames(battler.id, opts)
  }, [battler])

  if (authLoading || !user || loadingData || !battler) {
    return (
      <div className="game-table h-dvh flex flex-col overflow-hidden">
        <AppHeader renderRight={({ compact }) => (
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/dashboard')}
              className={`btn btn-secondary ${compact ? 'py-1.5 px-3 text-sm' : 'py-2 px-4'}`}
            >
              Back
            </button>
            <UserMenuButton compact={compact} />
          </div>
        )} />
        <div className="flex-1 flex min-h-0 game-surface">
          <div className="sm:hidden w-[4px] shrink-0 frame-chrome" />
          <main className="flex-1 min-h-0 p-[2px] zone-divider-bg">
            <div className="zone-pack h-full min-h-0 flex items-center justify-center">
              <p className="text-amber-200/70">Loading...</p>
            </div>
          </main>
          <div className="w-[4px] sm:w-10 shrink-0 frame-chrome" />
        </div>
        <footer className="shrink-0 frame-chrome bar-pad-both py-2">
          <div className="flex items-center justify-between">
            <a href="https://discord.gg/2NAjcWXNKn" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-[#6974F4] hover:text-[#7983F5] transition-colors">
              <FaDiscord className="w-4 h-4" />
              Join Discord
            </a>
            <CubeCobraPrimerLink />
          </div>
        </footer>
      </div>
    )
  }

  const cubeCobraUrl = `https://cubecobra.com/cube/overview/${encodeURIComponent(battler.cube_id)}`

  return (
    <div className="game-table h-dvh flex flex-col overflow-hidden">
      <AppHeader renderRight={({ compact }) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/dashboard')}
            className={`btn btn-secondary ${compact ? 'py-1.5 px-3 text-sm' : 'py-2 px-4'}`}
          >
            Back
          </button>
          <UserMenuButton compact={compact} />
        </div>
      )} />

      <div className="flex-1 flex min-h-0 game-surface">
        <div className="sm:hidden w-[4px] shrink-0 frame-chrome" />

        <main className="flex-1 min-w-0 min-h-0 p-[2px] zone-divider-bg flex flex-col">
          <div className="zone-pack shell-scroll-col flex-1 min-w-0 min-h-0 flex flex-col px-4 py-4 overflow-auto">
            <CubeGameHistory
              cubeId={battler.cube_id}
              cubeName={battler.cube_name ?? battler.display_name ?? null}
              cubeImageUri={battler.cube_image_uri ?? null}
              cubeCobraUrl={cubeCobraUrl}
              defaultPlayMode={battler.play_mode}
              defaultUpgrades={battler.use_upgrades}
              loadGames={fetchGames}
              actions={<>
                <button onClick={() => setShowSettings(true)} className="btn btn-secondary py-1.5 px-3 text-sm">
                  Settings
                </button>
                <button onClick={() => navigate(battlerPlayUrl(battler))} className="btn btn-primary py-1.5 px-3 text-sm font-semibold">
                  Play
                </button>
              </>}
            />
          </div>
        </main>

        <div className="w-[4px] sm:w-10 shrink-0 frame-chrome" />
      </div>

      <footer className="shrink-0 frame-chrome bar-pad-both py-2">
        <div className="flex items-center justify-between">
          <a href="https://discord.gg/2NAjcWXNKn" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-[#6974F4] hover:text-[#7983F5] transition-colors">
            <FaDiscord className="w-4 h-4" />
            Join Discord
          </a>
          <CubeCobraPrimerLink />
        </div>
      </footer>

      {showSettings && (
        <SettingsModal
          battler={battler}
          onClose={() => setShowSettings(false)}
          onSave={async (updates) => {
            try {
              const updated = await updateBattler(battler.id, updates)
              setBattler(updated)
              setShowSettings(false)
            } catch (err) {
              addToast(unknownToAppError(err, 'update-battler', 'Failed to save').message, 'error')
            }
          }}
          onDelete={async () => {
            try {
              await deleteBattler(battler.id)
              navigate('/dashboard', { replace: true })
            } catch (err) {
              addToast(unknownToAppError(err, 'delete-battler', 'Failed to delete').message, 'error')
            }
          }}
        />
      )}
    </div>
  )
}

function SettingsModal({
  battler,
  onClose,
  onSave,
  onDelete,
}: {
  battler: UserBattler
  onClose: () => void
  onSave: (updates: Record<string, unknown>) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [displayName, setDisplayName] = useState(battler.display_name || '')
  const [useUpgrades, setUseUpgrades] = useState(battler.use_upgrades)
  const [playMode, setPlayMode] = useState<PlayMode>(battler.play_mode)
  const [puppetCount, setPuppetCount] = useState(battler.puppet_count)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await onSave({
      display_name: displayName.trim() || null,
      use_upgrades: useUpgrades,
      play_mode: playMode,
      puppet_count: puppetCount,
      target_player_count: puppetCount + 1,
    })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative modal-chrome border gold-border rounded-lg p-5 w-full max-w-sm felt-raised-panel">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-black/40">
          <h3 className="text-white font-semibold">Settings</h3>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-black/35 btn-dark-border text-gray-300 hover:bg-black/20 hover:text-white transition-all text-sm flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-white text-sm mb-1">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full h-[42px] bg-black/40 border border-black/40 text-white rounded px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder={battler.cube_id}
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
            <span className="text-gray-500 text-xs">— bring your own deck</span>
          </label>

          <label className="bg-black/35 border border-black/40 rounded-lg px-3 py-2.5 flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={useUpgrades}
              onChange={(e) => setUseUpgrades(e.target.checked)}
              className="w-4 h-4 rounded bg-black/40 border-black/40 text-amber-500 focus:ring-amber-500"
            />
            <span className="text-white text-sm">Upgrades</span>
          </label>

          <div className="bg-black/35 border border-black/40 rounded-lg p-3">
            <label className="block text-gray-300 text-sm mb-2">Default Opponents</label>
            <div className="flex gap-1.5">
              {([1, 3, 5, 7] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPuppetCount(n)}
                  className={`px-3 py-1.5 rounded text-sm font-medium btn-dark-border transition-colors ${
                    puppetCount === n ? 'bg-amber-500 text-black' : 'bg-black/40 text-gray-300 hover:bg-black/30'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary flex-1 py-2 font-semibold disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={() => {
              if (window.confirm(`Delete "${battler.display_name || battler.cube_id}"?`)) onDelete()
            }}
            className="btn btn-secondary py-2 px-4 text-red-400 hover:text-red-300"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
