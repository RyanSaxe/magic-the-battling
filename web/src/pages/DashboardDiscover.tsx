import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/authState'
import { useToast } from '../contexts'
import { PageFrame } from '../components/common/PageFrame'
import { CubeTile } from '../components/dashboard/CubeTile'
import { HomeHeader } from '../components/dashboard/HomeHeader'
import { NoticeTile, SectionTitle } from '../components/dashboard/Section'
import { discoverCubes, followCube, getFollowing, unfollowCube, type DiscoverResult } from '../api/client'
import { countLabel, cubeTitle, formatWhen } from '../utils/accountFormat'
import { unknownToAppError } from '../utils/appError'
import {
  NO_FOLLOWS,
  findFollow,
  isFollowing,
  withDiscoverResults,
  withFollow,
  withFollowingPage,
  withoutFollow,
  type FirstPageStatus,
  type Follows,
} from './dashboardState'

/** The cubes most played on Pitfight, to follow or play. */
export function DashboardDiscover() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const { addToast } = useToast()
  const [results, setResults] = useState<DiscoverResult[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [status, setStatus] = useState<FirstPageStatus>('idle')
  const [loadingMore, setLoadingMore] = useState(false)
  const [follows, setFollows] = useState<Follows>(NO_FOLLOWS)

  useEffect(() => {
    if (!authLoading && !user) navigate('/login?returnTo=/dashboard/discover', { replace: true })
  }, [authLoading, user, navigate])

  const loadFirstPage = useCallback(async () => {
    setStatus('loading')
    try {
      const [data, following] = await Promise.all([discoverCubes(0), getFollowing(0)])
      setResults(data.results)
      setHasMore(data.has_more)
      setFollows(withDiscoverResults(withFollowingPage(NO_FOLLOWS, following, 0), data.results))
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
      const data = await discoverCubes(results.length)
      setResults((prev) => [...prev, ...data.results])
      setHasMore(data.has_more)
      setFollows((prev) => withDiscoverResults(prev, data.results))
    } catch {
      addToast('Failed to load cubes', 'error')
    } finally {
      setLoadingMore(false)
    }
  }

  const loadFollowingPage = async (offset: number) => {
    const page = await getFollowing(offset)
    setFollows((prev) => withFollowingPage(prev, page, offset))
    return page
  }

  const follow = async (result: DiscoverResult) => {
    try {
      const record = await followCube(result.cube_id)
      // POST /follow returns the follow without cube stats, and Discover already has them.
      setFollows((prev) =>
        withFollow(prev, {
          ...record,
          game_count: result.game_count,
          human_player_count: result.player_count,
          last_played: result.last_played,
        }),
      )
    } catch (err) {
      addToast(unknownToAppError(err, 'follow-cube', 'Failed to follow').message, 'error')
    }
  }

  const unfollow = async (cubeId: string) => {
    try {
      const record = await findFollow(follows, cubeId, loadFollowingPage)
      // A cube on no Following page is no longer followed, so there is nothing to delete.
      if (record) await unfollowCube(record.id)
      setFollows((prev) => withoutFollow(prev, cubeId))
    } catch {
      addToast('Failed to unfollow', 'error')
    }
  }

  if (authLoading || !user) return null

  return (
    <PageFrame header={<HomeHeader />} contentClassName="px-4">
      <div className="mx-auto flex w-full max-w-[1080px] min-[1600px]:max-w-[1400px] flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3 pt-2">
          <SectionTitle>Discover</SectionTitle>
          {status === 'loaded' && results.length > 0 && (
            <span className="text-[12.5px] leading-5 tabular-nums text-gray-300">
              <strong className="text-amber-50">{results.length}{hasMore ? '+' : ''}</strong> popular{' '}
              {results.length === 1 ? 'cube' : 'cubes'}
            </span>
          )}
        </div>
        {status === 'failed' ? (
          <NoticeTile action={{ label: 'Retry', onClick: loadFirstPage }}>The cubes didn&apos;t load.</NoticeTile>
        ) : status !== 'loaded' ? (
          <NoticeTile>Loading...</NoticeTile>
        ) : results.length === 0 ? (
          <NoticeTile action={{ label: 'New Game', onClick: () => navigate('/play') }}>
            No cube has a finished game yet.
          </NoticeTile>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((result) => {
              const following = isFollowing(follows, result.cube_id)
              const href = `/cube/${encodeURIComponent(result.cube_id)}`
              return (
                <CubeTile
                  key={result.cube_id}
                  title={cubeTitle(result)}
                  cubeId={result.cube_id}
                  imageUri={result.cube_image_uri}
                  badge={following ? 'Following' : 'Cube'}
                  chips={[countLabel(result.player_count, 'player'), countLabel(result.game_count, 'community game')]}
                  footer={result.last_played ? `Last played ${formatWhen(result.last_played)}` : 'No games yet'}
                  href={href}
                  onPlay={() => navigate(`/play?cubeId=${encodeURIComponent(result.cube_id)}`)}
                  menuItems={[
                    { label: 'View', onSelect: () => navigate(href) },
                    following
                      ? { label: 'Unfollow', onSelect: () => unfollow(result.cube_id), danger: true }
                      : { label: 'Follow', onSelect: () => follow(result) },
                  ]}
                />
              )
            })}
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
