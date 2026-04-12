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
  deleteBattler,
  getFollowing,
  unfollowCube,
  discoverCubes,
  followCube,
  getMyGames,
  type DiscoverResult,
} from '../api/client'
import type { UserBattler, FollowedBattler, GameSummary, PlayMode } from '../types'

type Tab = 'battlers' | 'following' | 'games' | 'discover'

const TAB_LABELS: Record<Tab, string> = {
  battlers: 'My Cubes',
  following: 'Following',
  games: 'Games',
  discover: 'Discover',
}

export function Dashboard() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const { addToast } = useToast()
  const [tab, setTab] = useState<Tab>('battlers')

  const [battlers, setBattlers] = useState<UserBattler[]>([])
  const [battlersHasMore, setBattlersHasMore] = useState(false)
  const [battlersOffset, setBattlersOffset] = useState(0)
  const [following, setFollowing] = useState<FollowedBattler[]>([])
  const [followingHasMore, setFollowingHasMore] = useState(false)
  const [followingOffset, setFollowingOffset] = useState(0)
  const [loadingData, setLoadingData] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)

  const [myGames, setMyGames] = useState<GameSummary[]>([])
  const [myGamesHasMore, setMyGamesHasMore] = useState(false)
  const [myGamesOffset, setMyGamesOffset] = useState(0)
  const [myGamesLoading, setMyGamesLoading] = useState(false)
  const [myGamesLoaded, setMyGamesLoaded] = useState(false)

  const [discoverResults, setDiscoverResults] = useState<DiscoverResult[]>([])
  const [discoverLoading, setDiscoverLoading] = useState(false)
  const [discoverHasMore, setDiscoverHasMore] = useState(false)
  const [discoverOffset, setDiscoverOffset] = useState(0)
  const [discoverLoaded, setDiscoverLoaded] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login', { replace: true })
    }
  }, [authLoading, user, navigate])

  const refresh = useCallback(async () => {
    if (!user) return
    setLoadingData(true)
    try {
      const [bData, fData] = await Promise.all([getBattlers(), getFollowing()])
      setBattlers(bData.battlers)
      setBattlersHasMore(bData.has_more)
      setBattlersOffset(bData.battlers.length)
      setFollowing(fData.following)
      setFollowingHasMore(fData.has_more)
      setFollowingOffset(fData.following.length)
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
                {(['battlers', 'following', 'games', 'discover'] as Tab[]).map((t) => (
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
                hasMore={battlersHasMore}
                onPlay={(b) => navigate(battlerPlayUrl(b))}
                onView={(b) => navigate(`/dashboard/battler/${b.id}`)}
                onDelete={async (b) => {
                  if (!window.confirm(`Delete "${b.display_name || b.cube_id}"?`)) return
                  try {
                    await deleteBattler(b.id)
                    setBattlers((prev) => prev.filter((x) => x.id !== b.id))
                  } catch {
                    addToast('Failed to delete', 'error')
                  }
                }}
                onAdd={() => setShowAddModal(true)}
                onLoadMore={async () => {
                  try {
                    const data = await getBattlers(battlersOffset)
                    setBattlers((prev) => [...prev, ...data.battlers])
                    setBattlersHasMore(data.has_more)
                    setBattlersOffset((prev) => prev + data.battlers.length)
                  } catch {
                    addToast('Failed to load more', 'error')
                  }
                }}
              />
            ) : tab === 'following' ? (
              <FollowingGrid
                following={following}
                hasMore={followingHasMore}
                onPlay={(f) => navigate(`/play?cubeId=${encodeURIComponent(f.cube_id)}`)}
                onView={(f) => window.open(`https://cubecobra.com/cube/overview/${encodeURIComponent(f.cube_id)}`, '_blank')}
                onUnfollow={async (f) => {
                  try {
                    await unfollowCube(f.id)
                    setFollowing((prev) => prev.filter((x) => x.id !== f.id))
                  } catch {
                    addToast('Failed to unfollow', 'error')
                  }
                }}
                onLoadMore={async () => {
                  try {
                    const data = await getFollowing(followingOffset)
                    setFollowing((prev) => [...prev, ...data.following])
                    setFollowingHasMore(data.has_more)
                    setFollowingOffset((prev) => prev + data.following.length)
                  } catch {
                    addToast('Failed to load more', 'error')
                  }
                }}
              />
            ) : tab === 'games' ? (
              <MyGamesGrid
                games={myGames}
                hasMore={myGamesHasMore}
                loading={myGamesLoading}
                loaded={myGamesLoaded}
                onLoadInitial={async () => {
                  setMyGamesLoading(true)
                  try {
                    const data = await getMyGames(0)
                    setMyGames(data.games)
                    setMyGamesHasMore(data.has_more)
                    setMyGamesOffset(data.games.length)
                    setMyGamesLoaded(true)
                  } catch {
                    addToast('Failed to load games', 'error')
                  } finally {
                    setMyGamesLoading(false)
                  }
                }}
                onLoadMore={async () => {
                  setMyGamesLoading(true)
                  try {
                    const data = await getMyGames(myGamesOffset)
                    setMyGames((prev) => [...prev, ...data.games])
                    setMyGamesHasMore(data.has_more)
                    setMyGamesOffset((prev) => prev + data.games.length)
                  } catch {
                    addToast('Failed to load games', 'error')
                  } finally {
                    setMyGamesLoading(false)
                  }
                }}
                onView={(g) => navigate(`/game/${g.game_id}/share/${encodeURIComponent(g.best_human_name)}`)}
              />
            ) : (
              <DiscoverGrid
                results={discoverResults}
                loading={discoverLoading}
                hasMore={discoverHasMore}
                loaded={discoverLoaded}
                onLoadInitial={async () => {
                  setDiscoverLoading(true)
                  try {
                    const data = await discoverCubes(0)
                    setDiscoverResults(data.results)
                    setDiscoverHasMore(data.has_more)
                    setDiscoverOffset(data.results.length)
                    setDiscoverLoaded(true)
                  } catch {
                    addToast('Failed to load cubes', 'error')
                  } finally {
                    setDiscoverLoading(false)
                  }
                }}
                onLoadMore={async () => {
                  setDiscoverLoading(true)
                  try {
                    const data = await discoverCubes(discoverOffset)
                    setDiscoverResults((prev) => [...prev, ...data.results])
                    setDiscoverHasMore(data.has_more)
                    setDiscoverOffset((prev) => prev + data.results.length)
                  } catch {
                    addToast('Failed to load cubes', 'error')
                  } finally {
                    setDiscoverLoading(false)
                  }
                }}
                onPlay={(cubeId) => navigate(`/play?cubeId=${encodeURIComponent(cubeId)}`)}
                onView={(cubeId) => window.open(`https://cubecobra.com/cube/overview/${encodeURIComponent(cubeId)}`, '_blank')}
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
  hasMore,
  onPlay,
  onView,
  onDelete,
  onAdd,
  onLoadMore,
}: {
  battlers: UserBattler[]
  hasMore: boolean
  onPlay: (b: UserBattler) => void
  onView: (b: UserBattler) => void
  onDelete: (b: UserBattler) => void
  onAdd: () => void
  onLoadMore: () => void
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
            actions={[
              { label: 'Play', onClick: () => onPlay(b), variant: 'primary' },
              { label: 'View', onClick: () => onView(b), variant: 'secondary' },
              { label: 'Delete', onClick: () => onDelete(b), variant: 'danger' },
            ]}
          />
        ))}
        <button
          onClick={onAdd}
          className="border-2 border-dashed border-amber-700/60 rounded-lg p-4 flex items-center justify-center text-amber-400/80 hover:text-amber-300 hover:border-amber-600 hover:animate-gentle-glow transition-colors min-h-[120px] font-medium"
        >
          + Add Cube
        </button>
      </div>
      {hasMore && (
        <button onClick={onLoadMore} className="btn btn-secondary py-2 px-6 mx-auto mt-4 block">
          Load More
        </button>
      )}
    </>
  )
}

function FollowingGrid({
  following,
  hasMore,
  onPlay,
  onView,
  onUnfollow,
  onLoadMore,
}: {
  following: FollowedBattler[]
  hasMore: boolean
  onPlay: (f: FollowedBattler) => void
  onView: (f: FollowedBattler) => void
  onUnfollow: (f: FollowedBattler) => void
  onLoadMore: () => void
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
            actions={[
              { label: 'Play', onClick: () => onPlay(f), variant: 'primary' },
              { label: 'View', onClick: () => onView(f), variant: 'secondary' },
              { label: 'Unfollow', onClick: () => onUnfollow(f), variant: 'danger' },
            ]}
          />
        ))}
      </div>
      {hasMore && (
        <button onClick={onLoadMore} className="btn btn-secondary py-2 px-6 mx-auto mt-4 block">
          Load More
        </button>
      )}
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

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso
  }
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function scryfallSmall(id: string): string {
  return `https://cards.scryfall.io/small/front/${id[0]}/${id[1]}/${id}.jpg`
}

function MyGamesGrid({
  games,
  hasMore,
  loading,
  loaded,
  onLoadInitial,
  onLoadMore,
  onView,
}: {
  games: GameSummary[]
  hasMore: boolean
  loading: boolean
  loaded: boolean
  onLoadInitial: () => void
  onLoadMore: () => void
  onView: (g: GameSummary) => void
}) {
  useEffect(() => {
    if (!loaded) onLoadInitial()
  }, [loaded, onLoadInitial])

  if (!loaded && loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  if (games.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="felt-raised-panel modal-chrome rounded-lg p-8 text-center max-w-sm">
          <p className="text-gray-300">No completed games yet. Play a game to see it here!</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <SectionHeading title="My Games" count={games.length} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {games.map((g) => (
          <InfoCard
            key={g.game_id}
            variant="history"
            title={formatDate(g.created_at)}
            subtitle={g.cube_id || undefined}
            badge={g.best_human_placement ? { text: ordinal(g.best_human_placement), color: g.best_human_placement === 1 ? 'gold' : 'gray' } : undefined}
            metadata={[
              { label: 'Players', value: String(g.player_count) },
            ]}
            onClick={() => onView(g)}
            className={g.best_human_placement === 1 ? 'shadow-[0_0_12px_rgba(212,175,55,0.15)]' : ''}
          >
            {g.hand_scryfall_ids.length > 0 && (
              <div className="flex -space-x-2 mt-2">
                {g.hand_scryfall_ids.slice(0, 7).map((sid) => (
                  <img
                    key={sid}
                    src={scryfallSmall(sid)}
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
      {hasMore && (
        <button
          onClick={onLoadMore}
          disabled={loading}
          className="btn btn-secondary py-2 px-6 mx-auto mt-4 block disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Load More'}
        </button>
      )}
    </div>
  )
}

function DiscoverGrid({
  results,
  loading,
  hasMore,
  loaded,
  onLoadInitial,
  onLoadMore,
  onPlay,
  onView,
  onFollow,
}: {
  results: DiscoverResult[]
  loading: boolean
  hasMore: boolean
  loaded: boolean
  onLoadInitial: () => void
  onLoadMore: () => void
  onPlay: (cubeId: string) => void
  onView: (cubeId: string) => void
  onFollow: (cubeId: string) => void
}) {
  useEffect(() => {
    if (!loaded) onLoadInitial()
  }, [loaded, onLoadInitial])

  if (!loaded && loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-500">No cubes found. Play some games first!</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <SectionHeading title="Popular Cubes" count={results.length} />
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
            actions={[
              { label: 'Play', onClick: () => onPlay(r.cube_id), variant: 'primary' },
              { label: 'View', onClick: () => onView(r.cube_id), variant: 'secondary' },
              ...(r.is_following ? [] : [{ label: 'Follow', onClick: () => onFollow(r.cube_id), variant: 'secondary' as const }]),
            ]}
          />
        ))}
      </div>
      {hasMore && (
        <button
          onClick={onLoadMore}
          disabled={loading}
          className="btn btn-secondary py-2 px-6 mx-auto mt-4 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Load More'}
        </button>
      )}
    </div>
  )
}
