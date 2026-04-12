import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { FaDiscord } from 'react-icons/fa6'
import { useAuth } from '../contexts/authState'
import { useToast } from '../contexts'
import { AppHeader, AuthHeaderButton, UserMenuButton } from '../components/common/AppHeader'
import { CubeCobraPrimerLink } from '../components/common/CubeCobraPrimerLink'
import { InfoCard } from '../components/common/InfoCard'
import { discoverCubes, followCube, type DiscoverResult } from '../api/client'

function formatDate(iso: string | null): string {
  if (!iso) return 'Never'
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso
  }
}

export function Discover() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { addToast } = useToast()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DiscoverResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const handleSearch = useCallback(async () => {
    setLoading(true)
    setSearched(true)
    try {
      const r = await discoverCubes(query)
      setResults(r)
    } catch {
      addToast('Search failed', 'error')
    } finally {
      setLoading(false)
    }
  }, [query, addToast])

  const handleFollow = async (cubeId: string) => {
    if (!user) {
      navigate('/login')
      return
    }
    try {
      await followCube(cubeId)
      setResults((prev) => prev.map((r) => r.cube_id === cubeId ? { ...r, is_following: true } : r))
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to follow', 'error')
    }
  }

  const handleUnfollow = async (cubeId: string) => {
    addToast('Use the Following tab on Dashboard to unfollow', 'info')
    setResults((prev) => prev.map((r) => r.cube_id === cubeId ? { ...r, is_following: false } : r))
  }

  return (
    <div className="game-table h-dvh flex flex-col overflow-hidden">
      <AppHeader renderRight={({ compact }) => (
        user ? <UserMenuButton compact={compact} /> : <AuthHeaderButton compact={compact} />
      )} />

      <div className="flex-1 flex min-h-0 game-surface">
        <div className="sm:hidden w-[4px] shrink-0 frame-chrome" />

        <main className="flex-1 min-h-0 p-[2px] zone-divider-bg flex flex-col">
          <div className="zone-pack shell-scroll-col flex-1 min-h-0 flex flex-col px-4 py-4">
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => navigate(user ? '/dashboard' : '/')} className="btn btn-secondary py-1 px-3 text-sm">
                Back
              </button>
              <h2 className="text-white font-bold text-lg">Discover Cubes</h2>
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); handleSearch() }}
              className="flex gap-2 mb-4"
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

            {!searched ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-gray-500">Search for cubes that have been played on Crucible.</p>
              </div>
            ) : results.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-gray-500">{query ? 'No cubes found matching that query.' : 'No cubes found. Play some games first!'}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {results.map((r) => (
                  <InfoCard
                    key={r.cube_id}
                    title={r.cube_id}
                    badge={r.is_following ? { text: 'Following', color: 'green' } : undefined}
                    metadata={[
                      { label: 'Games', value: String(r.game_count) },
                      { label: 'Players', value: String(r.player_count) },
                      { label: 'Last played', value: formatDate(r.last_played) },
                    ]}
                    primaryAction={{ label: 'Play', onClick: () => navigate(`/play?cubeId=${encodeURIComponent(r.cube_id)}`) }}
                    secondaryAction={{
                      label: r.is_following ? 'Unfollow' : 'Follow',
                      onClick: () => r.is_following ? handleUnfollow(r.cube_id) : handleFollow(r.cube_id),
                    }}
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
    </div>
  )
}
