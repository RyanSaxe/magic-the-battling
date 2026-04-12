import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { FaDiscord } from 'react-icons/fa6'
import { useAuth } from '../contexts/authState'
import { useToast } from '../contexts'
import { AppHeader, UserMenuButton } from '../components/common/AppHeader'
import { CubeCobraPrimerLink } from '../components/common/CubeCobraPrimerLink'
import { LabeledDivider } from '../components/common/LabeledDivider'
import { InfoCard } from '../components/common/InfoCard'
import { getBattlers, getBattlerGames, updateBattler, deleteBattler } from '../api/client'
import type { UserBattler, GameSummary, PlayMode } from '../types'

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso
  }
}

export function BattlerView() {
  const { battlerId } = useParams<{ battlerId: string }>()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const { addToast } = useToast()

  const [battler, setBattler] = useState<UserBattler | null>(null)
  const [games, setGames] = useState<GameSummary[]>([])
  const [gamesHasMore, setGamesHasMore] = useState(false)
  const [gamesOffset, setGamesOffset] = useState(0)
  const [gamesLoading, setGamesLoading] = useState(false)
  const [filterPlayMode, setFilterPlayMode] = useState<string | null>(null)
  const [filterUpgrades, setFilterUpgrades] = useState<boolean | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login', { replace: true })
    }
  }, [authLoading, user, navigate])

  const loadGames = useCallback(async (b: UserBattler, playMode: string | null, upgrades: boolean | null, offset: number) => {
    setGamesLoading(true)
    try {
      const data = await getBattlerGames(b.id, {
        offset,
        playMode: playMode ?? undefined,
        useUpgrades: upgrades ?? undefined,
      })
      if (offset === 0) {
        setGames(data.games)
      } else {
        setGames((prev) => [...prev, ...data.games])
      }
      setGamesHasMore(data.has_more)
      setGamesOffset(offset + data.games.length)
    } catch {
      addToast('Failed to load games', 'error')
    } finally {
      setGamesLoading(false)
    }
  }, [addToast])

  const refresh = useCallback(async () => {
    if (!user || !battlerId) return
    setLoadingData(true)
    try {
      const allBattlers = await getBattlers()
      const b = allBattlers.find((x) => x.id === Number(battlerId))
      if (!b) {
        navigate('/dashboard', { replace: true })
        return
      }
      setBattler(b)
      setFilterPlayMode(b.play_mode)
      setFilterUpgrades(b.use_upgrades)
      await loadGames(b, b.play_mode, b.use_upgrades, 0)
    } catch {
      addToast('Failed to load data', 'error')
    } finally {
      setLoadingData(false)
    }
  }, [user, battlerId, navigate, addToast, loadGames])

  useEffect(() => { refresh() }, [refresh])

  if (authLoading || !user || loadingData) {
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
              <p className="text-gray-500">Loading...</p>
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

  if (!battler) return null

  const cubeCobraUrl = `https://cubecobra.com/cube/overview/${encodeURIComponent(battler.cube_id)}`
  const wins = games.filter((g) => g.best_human_placement === 1).length

  function battlerPlayUrl(b: UserBattler): string {
    const params = new URLSearchParams()
    params.set('cubeId', b.cube_id)
    params.set('useUpgrades', String(b.use_upgrades))
    params.set('playMode', b.play_mode)
    params.set('puppetCount', String(b.puppet_count))
    return `/play?${params.toString()}`
  }

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
            <div className="mb-4 pb-4 border-b border-black/40">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5 shrink-0 ${battler.play_mode === 'constructed' ? 'bg-blue-600/80 text-white' : 'bg-amber-500/80 text-black'}`}>
                  {battler.play_mode === 'constructed' ? 'Deck' : 'Cube'}
                </span>
                <h2 className="text-white font-bold text-lg">{battler.display_name || battler.cube_id}</h2>
              </div>
              <a
                href={cubeCobraUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-amber-400 hover:text-amber-300 transition-colors mt-1 inline-block"
              >
                View on CubeCobra
              </a>
              <div className="flex gap-2 mt-3">
                <button onClick={() => setShowSettings(true)} className="btn btn-secondary py-1.5 px-3 text-sm">
                  Settings
                </button>
                <button onClick={() => navigate(battlerPlayUrl(battler))} className="btn btn-primary py-1.5 px-3 text-sm font-semibold">
                  Play
                </button>
              </div>
            </div>

            {games.length > 0 && (
              <dl className="overflow-hidden rounded-lg border border-[color:rgba(212,175,55,0.22)] bg-black/10 mb-4">
                <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-3 px-3 py-1.5">
                  <dt className="text-[11px] font-medium text-gray-400">Games played</dt>
                  <dd className="min-w-0 text-right text-sm text-amber-50">{games.length}</dd>
                </div>
                <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-3 px-3 py-1.5 border-t border-[color:rgba(212,175,55,0.12)]">
                  <dt className="text-[11px] font-medium text-gray-400">Wins</dt>
                  <dd className="min-w-0 text-right text-sm text-amber-50">
                    {wins}{games.length > 0 ? ` (${Math.round((wins / games.length) * 100)}%)` : ''}
                  </dd>
                </div>
              </dl>
            )}

            <LabeledDivider label="Game History" />

            <div className="flex flex-wrap gap-2 mt-3 mb-3">
              <div className="inline-flex rounded-full border border-[color:rgba(212,175,55,0.25)] bg-black/15 p-1">
                {([['limited', 'Cube'], ['constructed', 'Deck']] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => {
                      const next = filterPlayMode === mode ? null : mode
                      setFilterPlayMode(next)
                      if (battler) loadGames(battler, next, filterUpgrades, 0)
                    }}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      filterPlayMode === mode
                        ? 'border border-[var(--gold-border)] bg-amber-950/35 text-amber-100 shadow-[inset_0_1px_0_rgba(255,236,181,0.16)]'
                        : 'border border-transparent bg-black/10 text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="inline-flex rounded-full border border-[color:rgba(212,175,55,0.25)] bg-black/15 p-1">
                {([[true, 'Upgrades On'], [false, 'Upgrades Off']] as const).map(([val, label]) => (
                  <button
                    key={label}
                    onClick={() => {
                      const next = filterUpgrades === val ? null : val
                      setFilterUpgrades(next)
                      if (battler) loadGames(battler, filterPlayMode, next, 0)
                    }}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      filterUpgrades === val
                        ? 'border border-[var(--gold-border)] bg-amber-950/35 text-amber-100 shadow-[inset_0_1px_0_rgba(255,236,181,0.16)]'
                        : 'border border-transparent bg-black/10 text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              {games.length === 0 && !gamesLoading ? (
                <div className="flex-1 flex items-center justify-center py-8">
                  <p className="text-gray-500">No games match these filters.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-full">
                  {games.map((g) => (
                    <InfoCard
                      key={g.game_id}
                      variant="history"
                      title={formatDate(g.created_at)}
                      badge={g.best_human_placement ? { text: ordinal(g.best_human_placement), color: g.best_human_placement === 1 ? 'gold' : 'gray' } : undefined}
                      metadata={[
                        { label: 'Players', value: String(g.player_count) },
                        { label: 'Top Human', value: g.best_human_name },
                      ]}
                      onClick={() => navigate(`/game/${g.game_id}/share/${encodeURIComponent(g.best_human_name)}`)}
                      className={g.best_human_placement === 1 ? 'shadow-[0_0_12px_rgba(212,175,55,0.15)]' : ''}
                    >
                      {g.hand_scryfall_ids.length > 0 && (
                        <div className="flex -space-x-2 mt-2">
                          {g.hand_scryfall_ids.slice(0, 7).map((sid) => (
                            <img
                              key={sid}
                              src={`https://cards.scryfall.io/small/front/${sid[0]}/${sid[1]}/${sid}.jpg`}
                              alt=""
                              className="w-8 h-11 rounded-sm border border-black/60 object-cover"
                              loading="lazy"
                            />
                          ))}
                        </div>
                      )}
                    </InfoCard>
                  ))}
                </div>
              )}
              {gamesHasMore && (
                <button
                  onClick={() => battler && loadGames(battler, filterPlayMode, filterUpgrades, gamesOffset)}
                  disabled={gamesLoading}
                  className="btn btn-secondary py-2 px-6 mx-auto mt-4 block disabled:opacity-50"
                >
                  {gamesLoading ? 'Loading...' : 'Load More'}
                </button>
              )}
            </div>
          </div>
        </main>

        <div className="w-[4px] sm:w-10 shrink-0 frame-chrome" />
      </div>

      <footer className="shrink-0 frame-chrome bar-pad-both py-2">
        <div className="flex items-center justify-between">
          <a
            href="https://discord.gg/2NAjcWXNKn"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-[#6974F4] hover:text-[#7983F5] transition-colors"
          >
            <FaDiscord className="w-4 h-4" />
            Join Discord
          </a>
          <CubeCobraPrimerLink />
        </div>
      </footer>

      {showSettings && battler && (
        <SettingsModal
          battler={battler}
          onClose={() => setShowSettings(false)}
          onSave={async (updates) => {
            try {
              const updated = await updateBattler(battler.id, updates)
              setBattler(updated)
              setShowSettings(false)
            } catch (err) {
              addToast(err instanceof Error ? err.message : 'Failed to save', 'error')
            }
          }}
          onDelete={async () => {
            try {
              await deleteBattler(battler.id)
              navigate('/dashboard', { replace: true })
            } catch (err) {
              addToast(err instanceof Error ? err.message : 'Failed to delete', 'error')
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
            onClick={onDelete}
            className="btn btn-secondary py-2 px-4 text-red-400 hover:text-red-300"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
