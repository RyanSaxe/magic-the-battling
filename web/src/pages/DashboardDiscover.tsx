import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/authState'
import { useToast } from '../contexts'
import { CubeTile } from '../components/dashboard/CubeTile'
import { DashboardFrame } from '../components/dashboard/DashboardFrame'
import { ListHeader, LoadMoreButton, ResultGrid } from '../components/dashboard/ResultList'
import { Count, NoticeTile, SectionCounts } from '../components/dashboard/Section'
import { discoverCubes, followCube, getFollowing, unfollowCube, type DiscoverResult } from '../api/client'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
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
  type Follows,
} from './dashboardState'

const SEARCH_DELAY_MS = 300

/** A page of cubes, stamped with the search it was loaded for. */
interface LoadedCubes {
  search: string
  results: DiscoverResult[]
  hasMore: boolean
  total: number
}

/** The cubes most played on Pitfight, searchable by name or CubeCobra id, to follow or play. */
export function DashboardDiscover() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const { addToast } = useToast()
  const [searchText, setSearchText] = useState('')
  const search = useDebouncedValue(searchText.trim(), SEARCH_DELAY_MS)
  const [loaded, setLoaded] = useState<LoadedCubes | null>(null)
  const [failedSearch, setFailedSearch] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [follows, setFollows] = useState<Follows>(NO_FOLLOWS)

  useEffect(() => {
    if (!authLoading && !user) navigate('/login?returnTo=/dashboard/discover', { replace: true })
  }, [authLoading, user, navigate])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    getFollowing(0)
      .then((page) => {
        if (!cancelled) setFollows((prev) => withFollowingPage(prev, page, 0))
      })
      .catch(() => {
        // Without the first Following page, unfollowing still finds the follow by paging Following then.
      })
    return () => {
      cancelled = true
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    discoverCubes(0, search)
      .then((data) => {
        if (cancelled) return
        setLoaded({ search, results: data.results, hasMore: data.has_more, total: data.total })
        setFollows((prev) => withDiscoverResults(prev, data.results))
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
      const data = await discoverCubes(loaded.results.length, loaded.search)
      setLoaded((prev) =>
        prev && prev.search === loaded.search
          ? { ...prev, results: [...prev.results, ...data.results], hasMore: data.has_more }
          : prev,
      )
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

  const current = loaded?.search === search ? loaded : null
  const failed = failedSearch === search && !current
  // While a new search loads, the last list stays on screen, dimmed, instead of flashing away.
  const shown = current ?? loaded

  return (
    <DashboardFrame>
      <ListHeader
        title="Discover"
        counts={
          current &&
          current.total > 0 && (
            <SectionCounts>
              <Count value={current.total}>
                {' '}
                {search ? (current.total === 1 ? 'matching cube' : 'matching cubes') : current.total === 1 ? 'popular cube' : 'popular cubes'}
              </Count>
            </SectionCounts>
          )
        }
        search={{
          label: 'Search cubes',
          placeholder: 'Cube name or CubeCobra ID',
          value: searchText,
          onChange: setSearchText,
        }}
      />
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
          The cubes didn&apos;t load.
        </NoticeTile>
      ) : !shown ? (
        <NoticeTile>Loading...</NoticeTile>
      ) : shown.results.length === 0 ? (
        shown.search ? (
          <NoticeTile action={{ label: 'Clear search', onClick: () => setSearchText('') }}>
            No cubes match &ldquo;{shown.search}&rdquo;.
          </NoticeTile>
        ) : (
          <NoticeTile action={{ label: 'New Game', onClick: () => navigate('/play') }}>
            No cube has a finished game yet.
          </NoticeTile>
        )
      ) : (
        <ResultGrid busy={!current}>
          {shown.results.map((result) => {
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
        </ResultGrid>
      )}
      {current?.hasMore && <LoadMoreButton loading={loadingMore} onClick={loadMore} />}
    </DashboardFrame>
  )
}
