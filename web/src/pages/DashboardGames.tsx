import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/authState'
import { useToast } from '../contexts'
import { PageFrame } from '../components/common/PageFrame'
import { GameTile } from '../components/dashboard/GameTile'
import { HomeHeader } from '../components/dashboard/HomeHeader'
import { SearchBox } from '../components/dashboard/SearchBox'
import { NoticeTile, SectionTitle } from '../components/dashboard/Section'
import { getMyGames } from '../api/client'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import type { GameSummary } from '../types'
import { winsLabel } from '../utils/accountFormat'

const SEARCH_DELAY_MS = 300

/** A list of games, stamped with the search it was loaded for. */
interface LoadedGames {
  search: string
  games: GameSummary[]
  hasMore: boolean
  totalGames: number
  totalWins: number
}

/** Every finished game the player has played, newest first, searchable by cube, preset, opponent or card. */
export function DashboardGames() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const { addToast } = useToast()
  const [searchText, setSearchText] = useState('')
  const search = useDebouncedValue(searchText.trim(), SEARCH_DELAY_MS)
  const [loaded, setLoaded] = useState<LoadedGames | null>(null)
  const [failedSearch, setFailedSearch] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) navigate('/login?returnTo=/dashboard/games', { replace: true })
  }, [authLoading, user, navigate])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    getMyGames(0, search)
      .then((data) => {
        if (cancelled) return
        setLoaded({
          search,
          games: data.games,
          hasMore: data.has_more,
          totalGames: data.total_games,
          totalWins: data.total_wins,
        })
      })
      .catch(() => {
        if (!cancelled) setFailedSearch(search)
      })
    return () => {
      cancelled = true
    }
  }, [user, search, attempt])

  const loadMore = async () => {
    if (!loaded) return
    setLoadingMore(true)
    try {
      const data = await getMyGames(loaded.games.length, loaded.search)
      setLoaded((prev) =>
        prev && prev.search === loaded.search
          ? { ...prev, games: [...prev.games, ...data.games], hasMore: data.has_more }
          : prev,
      )
    } catch {
      addToast('Failed to load games', 'error')
    } finally {
      setLoadingMore(false)
    }
  }

  if (authLoading || !user) return null

  const current = loaded?.search === search ? loaded : null
  const failed = failedSearch === search && !current
  // While a new search loads, the last list stays on screen, dimmed, instead of flashing away.
  const shown = current ?? loaded

  return (
    <PageFrame header={<HomeHeader />} contentClassName="px-4">
      <div className="mx-auto flex w-full max-w-[1080px] min-[1600px]:max-w-[1400px] flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-2">
          <div className="flex items-baseline gap-4">
            <SectionTitle>Games</SectionTitle>
            {current && (
              <div className="flex items-baseline gap-4 text-[12.5px] leading-5 tabular-nums text-amber-100/70">
                <span>
                  <strong className="text-amber-50">{current.totalGames}</strong>{' '}
                  {search ? 'matching ' : ''}
                  {current.totalGames === 1 ? 'game' : 'games'}
                </span>
                <span className="text-amber-300">{winsLabel(current.totalWins, current.totalGames)}</span>
              </div>
            )}
          </div>
          <SearchBox
            label="Search games"
            placeholder="Cube, preset, player or card"
            value={searchText}
            onChange={setSearchText}
            className="w-full sm:w-72"
          />
        </div>
        {failed ? (
          <NoticeTile
            action={{
              label: 'Retry',
              onClick: () => {
                setFailedSearch(null)
                setAttempt((n) => n + 1)
              },
            }}
          >
            Your games didn&apos;t load.
          </NoticeTile>
        ) : !shown ? (
          <NoticeTile>Loading...</NoticeTile>
        ) : shown.games.length === 0 ? (
          shown.search ? (
            <NoticeTile action={{ label: 'Clear search', onClick: () => setSearchText('') }}>
              No games match &ldquo;{shown.search}&rdquo;.
            </NoticeTile>
          ) : (
            <NoticeTile action={{ label: 'New Game', onClick: () => navigate('/play') }}>
              You haven&apos;t finished a game yet.
            </NoticeTile>
          )
        ) : (
          <div
            aria-busy={!current}
            className={`grid grid-cols-1 gap-3 transition-opacity sm:grid-cols-2 lg:grid-cols-3 ${current ? '' : 'opacity-60'}`}
          >
            {shown.games.map((game) => (
              <GameTile key={game.game_id} game={game} />
            ))}
          </div>
        )}
        {current?.hasMore && (
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="btn btn-secondary self-center px-6 py-2 disabled:opacity-50"
          >
            {loadingMore ? 'Loading...' : 'Load more'}
          </button>
        )}
      </div>
    </PageFrame>
  )
}
