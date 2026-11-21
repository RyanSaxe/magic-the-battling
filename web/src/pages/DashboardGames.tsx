import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/authState'
import { useToast } from '../contexts'
import { PageFrame } from '../components/common/PageFrame'
import { GameTile } from '../components/dashboard/GameTile'
import { HomeHeader } from '../components/dashboard/HomeHeader'
import { NoticeTile, SectionTitle } from '../components/dashboard/Section'
import { getMyGames } from '../api/client'
import type { GameSummary } from '../types'
import { winsLabel } from '../utils/accountFormat'
import type { FirstPageStatus } from './dashboardState'

/** Every finished game the player has played, newest first. */
export function DashboardGames() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const { addToast } = useToast()
  const [games, setGames] = useState<GameSummary[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [totals, setTotals] = useState({ games: 0, wins: 0 })
  const [status, setStatus] = useState<FirstPageStatus>('idle')
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) navigate('/login?returnTo=/dashboard/games', { replace: true })
  }, [authLoading, user, navigate])

  const loadFirstPage = useCallback(async () => {
    setStatus('loading')
    try {
      const data = await getMyGames(0)
      setGames(data.games)
      setHasMore(data.has_more)
      setTotals({ games: data.total_games, wins: data.total_wins })
      setStatus('loaded')
    } catch {
      setStatus('failed')
    }
  }, [])

  useEffect(() => {
    if (user) loadFirstPage()
  }, [user, loadFirstPage])

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const data = await getMyGames(games.length)
      setGames((prev) => [...prev, ...data.games])
      setHasMore(data.has_more)
    } catch {
      addToast('Failed to load games', 'error')
    } finally {
      setLoadingMore(false)
    }
  }

  if (authLoading || !user) return null

  return (
    <PageFrame header={<HomeHeader />} contentClassName="px-4">
      <div className="mx-auto flex w-full max-w-[1080px] min-[1600px]:max-w-[1400px] flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3 pt-2">
          <SectionTitle>Games</SectionTitle>
          {status === 'loaded' && (
            <div className="flex items-baseline gap-4 text-[12.5px] leading-5 tabular-nums text-gray-300">
              <span>
                <strong className="text-amber-50">{totals.games}</strong> {totals.games === 1 ? 'game' : 'games'}
              </span>
              <span className="text-amber-300">{winsLabel(totals.wins, totals.games)}</span>
            </div>
          )}
        </div>
        {status === 'failed' ? (
          <NoticeTile action={{ label: 'Retry', onClick: loadFirstPage }}>Your games didn&apos;t load.</NoticeTile>
        ) : status !== 'loaded' ? (
          <NoticeTile>Loading...</NoticeTile>
        ) : games.length === 0 ? (
          <NoticeTile action={{ label: 'New Game', onClick: () => navigate('/play') }}>
            You haven&apos;t finished a game yet.
          </NoticeTile>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {games.map((game) => (
              <GameTile key={game.game_id} game={game} />
            ))}
          </div>
        )}
        {hasMore && (
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
