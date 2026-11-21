import { useState, useEffect, useCallback } from 'react'
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/authState'
import { useToast } from '../contexts'
import { PageFrame } from '../components/common/PageFrame'
import { SurfaceCard } from '../components/common/SurfaceCard'
import { DetailHero } from '../components/dashboard/DetailHero'
import { GameHistory, type LoadGames } from '../components/dashboard/GameHistory'
import { HomeHeader } from '../components/dashboard/HomeHeader'
import { Breadcrumb, PlayIcon } from '../components/dashboard/Section'
import { getBattlers, getBattlerGames, updateBattler, deleteBattler } from '../api/client'
import type { UserBattler, PlayMode } from '../types'
import { countLabel, cubeTitle, modeLabel, winRate } from '../utils/accountFormat'
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

  const battlerId = battler?.id
  const loadGames = useCallback<LoadGames>((filters, offset) => {
    if (battlerId === undefined) throw new Error('No battler')
    return getBattlerGames(battlerId, {
      offset,
      playMode: filters.playMode ?? undefined,
      useUpgrades: filters.useUpgrades ?? undefined,
      mineOnly: filters.mineOnly,
    })
  }, [battlerId])

  if (authLoading || !user || loadingData || !battler) {
    return (
      <PageFrame header={<HomeHeader />} center contentClassName="items-center">
        <p className="text-amber-200/70">Loading...</p>
      </PageFrame>
    )
  }

  const title = cubeTitle(battler)
  const mode = modeLabel(battler.play_mode)

  return (
    <>
      <PageFrame header={<HomeHeader />} contentClassName="px-4">
        <div className="mx-auto flex w-full max-w-[1080px] min-[1600px]:max-w-[1400px] flex-col gap-3">
          <Breadcrumb to="/dashboard" label="Cubes & Decks" current={title} />
          <DetailHero
            imageUri={battler.cube_image_uri}
            badge={{ label: `Saved ${mode} Preset`, tone: mode }}
            title={title}
            links={<>
              <span>
                Source:{' '}
                <a
                  href={`https://cubecobra.com/cube/overview/${encodeURIComponent(battler.cube_id)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 hover:text-amber-300 transition-colors"
                >
                  {battler.cube_id} on CubeCobra ↗
                </a>
              </span>
              <Link to={`/cube/${encodeURIComponent(battler.cube_id)}`} className="text-amber-400 hover:text-amber-300 transition-colors">
                View Public Cube Page →
              </Link>
            </>}
            chips={[
              `Mode: ${mode === 'Deck' ? 'Deck (Constructed)' : 'Cube (Limited)'}`,
              `Upgrades: ${battler.use_upgrades ? 'On' : 'Off'}`,
              `Default Opponents: ${battler.puppet_count}`,
              `Open Spectating: ${battler.auto_approve_spectators ? 'On' : 'Off'}`,
            ]}
            actions={<>
              <button type="button" onClick={() => setShowSettings(true)} className="btn btn-secondary px-4 py-2 text-sm font-medium">
                Edit Preset
              </button>
              <button
                type="button"
                onClick={() => navigate(battlerPlayUrl(battler))}
                className="btn btn-primary flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold"
              >
                <PlayIcon />
                Play Preset
              </button>
            </>}
            stats={[
              { label: 'Your Games', value: battler.my_game_count },
              {
                label: 'Your Wins',
                value: battler.my_win_count,
                detail: battler.my_game_count > 0 ? `(${winRate(battler.my_win_count, battler.my_game_count)})` : undefined,
              },
              { label: 'Avg Finish', value: battler.my_average_placement?.toFixed(1) ?? '—' },
              { label: 'All Cube Games', value: battler.game_count, detail: countLabel(battler.human_player_count, 'player') },
            ]}
            caption={`Your games, wins and finish count your finished games on this cube in ${mode} mode with upgrades ${battler.use_upgrades ? 'on' : 'off'}.`}
          />
          <GameHistory
            key={`${battler.play_mode}-${battler.use_upgrades}`}
            scoped
            loadGames={loadGames}
            initialFilters={{ playMode: battler.play_mode, useUpgrades: battler.use_upgrades, mineOnly: true }}
          />
        </div>
      </PageFrame>

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
    </>
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
      <SurfaceCard className="relative">
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
      </SurfaceCard>
    </div>
  )
}
