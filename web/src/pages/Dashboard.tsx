import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { FaDiscord } from 'react-icons/fa6'
import { useAuth } from '../contexts/authState'
import { useToast } from '../contexts'
import { AppHeader, UserMenuButton } from '../components/common/AppHeader'
import { CubeCobraPrimerLink } from '../components/common/CubeCobraPrimerLink'
import { InfoCard } from '../components/common/InfoCard'
import {
  getBattlers,
  createBattler,
  getFollowing,
  unfollowCube,
  discoverCubes,
  followCube,
  type DiscoverResult,
} from '../api/client'
import type { UserBattler, FollowedBattler, PlayMode } from '../types'

type Tab = 'battlers' | 'following' | 'discover'

const TAB_LABELS: Record<Tab, string> = {
  battlers: 'My Cubes',
  following: 'Following',
  discover: 'Discover',
}

export function Dashboard() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const { addToast } = useToast()
  const [tab, setTab] = useState<Tab>('battlers')

  const [battlers, setBattlers] = useState<UserBattler[]>([])
  const [following, setFollowing] = useState<FollowedBattler[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)

  const [discoverQuery, setDiscoverQuery] = useState('')
  const [discoverResults, setDiscoverResults] = useState<DiscoverResult[]>([])
  const [discoverLoading, setDiscoverLoading] = useState(false)
  const [discoverSearched, setDiscoverSearched] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login', { replace: true })
    }
  }, [authLoading, user, navigate])

  const refresh = useCallback(async () => {
    if (!user) return
    setLoadingData(true)
    try {
      const [b, f] = await Promise.all([getBattlers(), getFollowing()])
      setBattlers(b)
      setFollowing(f)
    } catch {
      addToast('Failed to load data', 'error')
    } finally {
      setLoadingData(false)
    }
  }, [user, addToast])

  useEffect(() => { refresh() }, [refresh])

  if (authLoading || !user) return null

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
      <AppHeader renderRight={({ compact }) => <UserMenuButton compact={compact} />} />

      <div className="flex-1 flex min-h-0 game-surface">
        <div className="sm:hidden w-[4px] shrink-0 frame-chrome" />

        <main className="flex-1 min-h-0 p-[2px] zone-divider-bg flex flex-col">
          <div className="zone-pack shell-scroll-col flex-1 min-h-0 flex flex-col px-4 py-4">
            <div className="flex justify-center mb-4">
              <div className="inline-flex rounded-full border border-[color:rgba(212,175,55,0.25)] bg-black/15 p-1">
                {(['battlers', 'following', 'discover'] as Tab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      tab === t
                        ? 'border border-[var(--gold-border)] bg-amber-950/35 text-amber-100 shadow-[inset_0_1px_0_rgba(255,236,181,0.16)]'
                        : 'border border-transparent bg-black/10 text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {TAB_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            {loadingData ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-gray-500">Loading...</p>
              </div>
            ) : tab === 'battlers' ? (
              <BattlersGrid
                battlers={battlers}
                onPlay={(b) => navigate(battlerPlayUrl(b))}
                onView={(b) => navigate(`/dashboard/battler/${b.id}`)}
                onAdd={() => setShowAddModal(true)}
              />
            ) : tab === 'following' ? (
              <FollowingGrid
                following={following}
                onPlay={(f) => navigate(`/play?cubeId=${encodeURIComponent(f.cube_id)}`)}
                onUnfollow={async (f) => {
                  try {
                    await unfollowCube(f.id)
                    setFollowing((prev) => prev.filter((x) => x.id !== f.id))
                  } catch {
                    addToast('Failed to unfollow', 'error')
                  }
                }}
              />
            ) : (
              <DiscoverGrid
                query={discoverQuery}
                setQuery={setDiscoverQuery}
                results={discoverResults}
                loading={discoverLoading}
                searched={discoverSearched}
                onSearch={async () => {
                  setDiscoverLoading(true)
                  setDiscoverSearched(true)
                  try {
                    setDiscoverResults(await discoverCubes(discoverQuery))
                  } catch {
                    addToast('Search failed', 'error')
                  } finally {
                    setDiscoverLoading(false)
                  }
                }}
                onPlay={(cubeId) => navigate(`/play?cubeId=${encodeURIComponent(cubeId)}`)}
                onFollow={async (cubeId) => {
                  try {
                    await followCube(cubeId)
                    setDiscoverResults((prev) => prev.map((r) => r.cube_id === cubeId ? { ...r, is_following: true } : r))
                  } catch (err) {
                    addToast(err instanceof Error ? err.message : 'Failed to follow', 'error')
                  }
                }}
              />
            )}
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

      {showAddModal && (
        <AddBattlerModal
          onClose={() => setShowAddModal(false)}
          onCreated={(b) => {
            setBattlers((prev) => [...prev, b])
            setShowAddModal(false)
          }}
          addToast={addToast}
        />
      )}
    </div>
  )
}

function SectionHeading({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-3">
      <span className="text-[10px] uppercase tracking-[0.14em] text-gray-400">{title}</span>
      {count !== undefined && (
        <span className="text-[10px] text-gray-500">
          {count} {count === 1 ? 'cube' : 'cubes'}
        </span>
      )}
    </div>
  )
}

function BattlersGrid({
  battlers,
  onPlay,
  onView,
  onAdd,
}: {
  battlers: UserBattler[]
  onPlay: (b: UserBattler) => void
  onView: (b: UserBattler) => void
  onAdd: () => void
}) {
  if (battlers.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <div className="felt-raised-panel modal-chrome rounded-lg p-8 text-center max-w-sm">
          <p className="text-gray-300 mb-4">No cubes saved yet. Add your first cube to start tracking your games.</p>
          <button onClick={onAdd} className="btn btn-primary py-2 px-6 font-semibold">
            Add Your First Cube
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <SectionHeading title="My Cubes" count={battlers.length} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {battlers.map((b) => (
          <InfoCard
            key={b.id}
            variant="cube"
            title={b.display_name || b.cube_id}
            subtitle={b.cube_id !== (b.display_name || '') ? b.cube_id : undefined}
            badge={{ text: b.play_mode === 'constructed' ? 'Deck' : 'Cube', color: b.play_mode === 'constructed' ? 'blue' : 'gold' }}
            metadata={[
              { label: 'Upgrades', value: b.use_upgrades ? 'On' : 'Off' },
              { label: 'Opponents', value: String(b.puppet_count) },
            ]}
            primaryAction={{ label: 'Play', onClick: () => onPlay(b) }}
            secondaryAction={{ label: 'View', onClick: () => onView(b) }}
          />
        ))}
        <button
          onClick={onAdd}
          className="border-2 border-dashed border-amber-700/60 rounded-lg p-4 flex items-center justify-center text-amber-400/80 hover:text-amber-300 hover:border-amber-600 hover:animate-gentle-glow transition-colors min-h-[120px] font-medium"
        >
          + Add Cube
        </button>
      </div>
    </>
  )
}

function FollowingGrid({
  following,
  onPlay,
  onUnfollow,
}: {
  following: FollowedBattler[]
  onPlay: (f: FollowedBattler) => void
  onUnfollow: (f: FollowedBattler) => void
}) {
  if (following.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="felt-raised-panel modal-chrome rounded-lg p-8 text-center max-w-sm">
          <p className="text-gray-300">Not following any cubes yet. Use the Discover tab to find cubes.</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <SectionHeading title="Following" count={following.length} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {following.map((f) => (
          <InfoCard
            key={f.id}
            variant="community"
            title={f.display_name || f.cube_id}
            subtitle={f.cube_id !== (f.display_name || '') ? f.cube_id : undefined}
            primaryAction={{ label: 'Play', onClick: () => onPlay(f) }}
            secondaryAction={{ label: 'Unfollow', onClick: () => onUnfollow(f) }}
          />
        ))}
      </div>
    </>
  )
}

function AddBattlerModal({
  onClose,
  onCreated,
  addToast,
}: {
  onClose: () => void
  onCreated: (b: UserBattler) => void
  addToast: (msg: string, type: 'error' | 'info') => void
}) {
  const [cubeId, setCubeId] = useState('')
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
      addToast(err instanceof Error ? err.message : 'Failed to create', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <form
        onSubmit={handleSubmit}
        className="relative modal-chrome border gold-border rounded-lg p-5 w-full max-w-sm felt-raised-panel"
      >
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-black/40">
          <h3 className="text-white font-semibold">Add Cube</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-black/35 btn-dark-border text-gray-300 hover:bg-black/20 hover:text-white transition-all text-sm flex items-center justify-center"
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
            <label className="block text-white text-sm mb-1">Display Name <span className="text-gray-500">(optional)</span></label>
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
            <span className="text-gray-500 text-xs">— upgrade a card every 3 rounds</span>
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

        <button
          type="submit"
          disabled={saving || !cubeId.trim()}
          className="btn btn-primary w-full py-2 mt-4 font-semibold disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Add Cube'}
        </button>
      </form>
    </div>
  )
}

function DiscoverGrid({
  query,
  setQuery,
  results,
  loading,
  searched,
  onSearch,
  onPlay,
  onFollow,
}: {
  query: string
  setQuery: (q: string) => void
  results: DiscoverResult[]
  loading: boolean
  searched: boolean
  onSearch: () => void
  onPlay: (cubeId: string) => void
  onFollow: (cubeId: string) => void
}) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="rounded-lg border border-[color:rgba(212,175,55,0.12)] bg-black/10 p-3 mb-4">
        <form
          onSubmit={(e) => { e.preventDefault(); onSearch() }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by cube ID..."
            className="flex-1 h-[42px] bg-black/40 border border-black/40 text-white rounded px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary py-2 px-4 font-semibold disabled:opacity-50"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>
      </div>

      {!searched ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500">Search for cubes that have been played on Crucible.</p>
        </div>
      ) : results.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500">{query ? 'No cubes found matching that query.' : 'No cubes found. Play some games first!'}</p>
        </div>
      ) : (
        <>
          <SectionHeading title="Results" count={results.length} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {results.map((r) => (
              <InfoCard
                key={r.cube_id}
                variant="community"
                title={r.cube_id}
                badge={r.is_following ? { text: 'Following', color: 'green' } : undefined}
                metadata={[
                  { label: 'Games', value: String(r.game_count) },
                  { label: 'Players', value: String(r.player_count) },
                ]}
                primaryAction={{ label: 'Play', onClick: () => onPlay(r.cube_id) }}
                secondaryAction={
                  r.is_following ? undefined : { label: 'Follow', onClick: () => onFollow(r.cube_id) }
                }
              >
                <a
                  href={`https://cubecobra.com/cube/overview/${encodeURIComponent(r.cube_id)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-amber-400 hover:text-amber-300 transition-colors mt-2 inline-block"
                  onClick={(e) => e.stopPropagation()}
                >
                  View on CubeCobra
                </a>
              </InfoCard>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
