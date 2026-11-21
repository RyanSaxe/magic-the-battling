import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/authState'
import { useToast } from '../contexts'
import { AppHeader, UserMenuButton } from '../components/common/AppHeader'
import { SurfaceCard } from '../components/common/SurfaceCard'
import { JoinGameModal } from '../components/home/JoinGameModal'
import { AddCubeModal } from '../components/dashboard/AddCubeModal'
import { CubeTile } from '../components/dashboard/CubeTile'
import { DashboardFrame } from '../components/dashboard/DashboardFrame'
import { GameTile } from '../components/dashboard/GameTile'
import { JoinCodeBox } from '../components/dashboard/JoinCodeBox'
import { ResumeBanner } from '../components/dashboard/ResumeBanner'
import { LoadMoreButton } from '../components/dashboard/ResultList'
import { Count, NoticeTile, SectionCounts, SectionLink, SectionTitle, WinsCount } from '../components/dashboard/Section'
import { SegmentedFilter } from '../components/dashboard/SegmentedFilter'
import { deleteBattler, getBattlers, getFollowing, getMyGames, unfollowCube } from '../api/client'
import { useResumableGames } from '../hooks/useResumableGames'
import type { FollowedBattler, GameSummary, UserBattler } from '../types'
import { battlerPlayUrl } from '../utils/battlerPlayUrl'
import { countLabel, cubeTitle, formatWhen, upgradesLabel } from '../utils/accountFormat'
import { libraryEntries, type FirstPageStatus, type LibraryEntry } from './dashboardState'

const RECENT_GAME_COUNT = 3

type BoardSection = 'library' | 'recent'

/** The two sections' names, shared by their headers on wide screens and the switch that stands in for them below. */
const SECTION_NAMES: Record<BoardSection, string> = { library: 'Cubes & Decks', recent: 'Recent Games' }

/** Both headers share a height and center their items, so their titles share a baseline. */
const SECTION_HEADER = 'flex min-h-9 flex-wrap items-center gap-x-3 gap-y-2'

/** Places a card in the grid on screens 1280px and wider: the library fills columns 1 and 2, and recent games column 4, after a spacer. */
function gridCell(row: number, column: number): CSSProperties {
  return { '--grid-row': row, '--grid-column': column } as CSSProperties
}

const GRID_CELL = 'xl:[grid-row:var(--grid-row)] xl:[grid-column:var(--grid-column)]'

interface Library {
  presets: UserBattler[]
  presetsHaveMore: boolean
  follows: FollowedBattler[]
  followsHaveMore: boolean
}

interface MyGames {
  games: GameSummary[]
  totalGames: number
  totalWins: number
}

export function Dashboard() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const { addToast } = useToast()
  const [resumable] = useResumableGames(1)

  const [library, setLibrary] = useState<Library | null>(null)
  const [libraryStatus, setLibraryStatus] = useState<FirstPageStatus>('idle')
  const [phoneSection, setPhoneSection] = useState<BoardSection>('library')
  const [loadingMore, setLoadingMore] = useState(false)
  const [myGames, setMyGames] = useState<MyGames | null>(null)
  const [myGamesStatus, setMyGamesStatus] = useState<FirstPageStatus>('idle')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showJoinModal, setShowJoinModal] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) navigate('/login?returnTo=/dashboard', { replace: true })
  }, [authLoading, user, navigate])

  const loadLibrary = useCallback(async () => {
    setLibraryStatus('loading')
    try {
      const [saved, following] = await Promise.all([getBattlers(), getFollowing()])
      setLibrary({
        presets: saved.battlers,
        presetsHaveMore: saved.has_more,
        follows: following.following,
        followsHaveMore: following.has_more,
      })
      setLibraryStatus('loaded')
    } catch {
      setLibraryStatus('failed')
    }
  }, [])

  const loadMyGames = useCallback(async () => {
    setMyGamesStatus('loading')
    try {
      const data = await getMyGames(0)
      setMyGames({ games: data.games, totalGames: data.total_games, totalWins: data.total_wins })
      setMyGamesStatus('loaded')
    } catch {
      setMyGamesStatus('failed')
    }
  }, [])

  useEffect(() => {
    if (!user) return
    loadLibrary()
    loadMyGames()
  }, [user, loadLibrary, loadMyGames])

  const loadMoreLibrary = async () => {
    if (!library) return
    setLoadingMore(true)
    try {
      if (library.presetsHaveMore) {
        const page = await getBattlers(library.presets.length)
        setLibrary({ ...library, presets: [...library.presets, ...page.battlers], presetsHaveMore: page.has_more })
      } else {
        const page = await getFollowing(library.follows.length)
        setLibrary({ ...library, follows: [...library.follows, ...page.following], followsHaveMore: page.has_more })
      }
    } catch {
      addToast('Failed to load more', 'error')
    } finally {
      setLoadingMore(false)
    }
  }

  const removePreset = async (preset: UserBattler) => {
    if (!window.confirm(`Delete "${cubeTitle(preset)}"?`)) return
    try {
      await deleteBattler(preset.id)
      setLibrary((prev) => prev && { ...prev, presets: prev.presets.filter((p) => p.id !== preset.id) })
    } catch {
      addToast('Failed to delete', 'error')
    }
  }

  const unfollow = async (follow: FollowedBattler) => {
    try {
      await unfollowCube(follow.id)
      setLibrary((prev) => prev && { ...prev, follows: prev.follows.filter((f) => f.id !== follow.id) })
    } catch {
      addToast('Failed to unfollow', 'error')
    }
  }

  if (authLoading || !user) return null

  const entries = library ? libraryEntries(library.presets, library.follows) : []
  const libraryHasMore = !!library && (library.presetsHaveMore || library.followsHaveMore)
  const allCount = library ? `${library.presets.length + library.follows.length}${libraryHasMore ? '+' : ''}` : ''
  const libraryRows = Math.max(1, Math.ceil(entries.length / 2))
  const recentGames = myGames?.games.slice(0, RECENT_GAME_COUNT) ?? []
  // Equal flexible rows: each row of cards is as tall as the tallest card on the board, in either column.
  const recentRows = Math.max(recentGames.length, 1)
  const cardRows = Math.max(libraryRows, recentRows)
  // Below 1280px the sections stack, so a switch shows one at a time instead of a long scroll past every cube.
  const libraryCell = `${GRID_CELL} ${phoneSection === 'library' ? '' : 'max-xl:hidden'}`
  const libraryNotice = `col-span-full ${libraryCell} xl:col-span-2`

  return (
    <>
      <DashboardFrame header={<AppHeader renderRight={({ compact }) => <UserMenuButton compact={compact} />} />}>
        {resumable && <ResumeBanner seat={resumable} />}

        <SurfaceCard
          as="section"
          layout="tile"
          aria-label="Start or join a game"
          className="flex flex-col gap-3 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/play')}
              className="btn btn-primary flex h-9 flex-1 items-center justify-center gap-2 !py-0 px-5 font-semibold sm:flex-none"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
              New Game
            </button>
            <JoinCodeBox playerName={user.username} className="hidden md:flex" />
            <button
              type="button"
              onClick={() => setShowJoinModal(true)}
              className="btn btn-secondary h-9 flex-1 !py-0 px-4 font-medium sm:flex-none md:hidden"
            >
              Join Code
            </button>
          </div>
          {myGames && (
            <SectionCounts className="flex items-center justify-between gap-4 whitespace-nowrap sm:justify-end">
              <Count value={myGames.totalGames}>{' '}{myGames.totalGames === 1 ? 'game' : 'games'}</Count>
              <WinsCount wins={myGames.totalWins} games={myGames.totalGames} />
              {library && (
                <Count value={allCount} className="hidden lg:inline"> saved &amp; followed</Count>
              )}
            </SectionCounts>
          )}
        </SurfaceCard>

        <div
          data-testid="dashboard-board"
          style={{ '--board-rows': `auto repeat(${cardRows}, 1fr) auto` } as CSSProperties}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_0.5rem_minmax(0,1fr)] xl:[grid-template-rows:var(--board-rows)]"
        >
          <SegmentedFilter
            label="Section"
            variant="heading"
            value={phoneSection}
            onChange={setPhoneSection}
            className="col-span-full w-full sm:w-auto sm:justify-self-start xl:hidden"
            options={[
              { value: 'library', label: SECTION_NAMES.library },
              { value: 'recent', label: SECTION_NAMES.recent },
            ]}
          />

          <div
            data-testid="library-header"
            style={gridCell(1, 1)}
            className={`col-span-full ${libraryCell} xl:col-span-2 ${SECTION_HEADER}`}
          >
            <div className="max-xl:hidden">
              <SectionTitle>{SECTION_NAMES.library}</SectionTitle>
            </div>
            <div className="flex w-full items-center gap-3 sm:ml-auto sm:w-auto">
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="btn btn-secondary flex-1 py-1.5 px-3 text-xs font-semibold sm:flex-none"
              >
                + Add Cube / Deck
              </button>
              <SectionLink to="/dashboard/discover">Discover cubes →</SectionLink>
            </div>
          </div>

          {libraryStatus === 'failed' ? (
            <NoticeTile style={gridCell(2, 1)} className={libraryNotice} action={{ label: 'Retry', onClick: loadLibrary }}>
              Your cubes and decks didn&apos;t load.
            </NoticeTile>
          ) : !library ? (
            <NoticeTile style={gridCell(2, 1)} className={libraryNotice}>
              Loading...
            </NoticeTile>
          ) : entries.length === 0 ? (
            <NoticeTile
              style={gridCell(2, 1)}
              className={libraryNotice}
              action={{ label: 'Add Cube / Deck', onClick: () => setShowAddModal(true) }}
            >
              Save a cube or deck with your settings to play it again in one click.
            </NoticeTile>
          ) : (
            entries.map((entry, index) => (
              <LibraryTile
                key={entry.kind === 'saved' ? `saved-${entry.preset.id}` : `following-${entry.follow.id}`}
                entry={entry}
                style={gridCell(2 + Math.floor(index / 2), 1 + (index % 2))}
                className={libraryCell}
                onDelete={removePreset}
                onUnfollow={unfollow}
              />
            ))
          )}

          {libraryHasMore && (
            <LoadMoreButton
              loading={loadingMore}
              onClick={loadMoreLibrary}
              style={gridCell(2 + libraryRows, 1)}
              className={`${libraryNotice} justify-self-center`}
            />
          )}

          {/* One section, so it can stay in view while the cubes scroll; subgrid keeps its cards on the cube rows. */}
          <section
            aria-label={SECTION_NAMES.recent}
            style={{ '--recent-rows': `1 / span ${1 + recentRows}` } as CSSProperties}
            className={`${phoneSection === 'recent' ? 'contents' : 'hidden'} xl:sticky xl:top-0 xl:col-start-4 xl:grid xl:[grid-row:var(--recent-rows)] xl:[grid-template-rows:subgrid] xl:self-start`}
          >
            <div data-testid="recent-header" className={`col-span-full justify-end xl:justify-between ${SECTION_HEADER}`}>
              <div className="max-xl:hidden">
                <SectionTitle>{SECTION_NAMES.recent}</SectionTitle>
              </div>
              <SectionLink to="/dashboard/games">All games →</SectionLink>
            </div>

            {myGamesStatus === 'failed' ? (
              <NoticeTile action={{ label: 'Retry', onClick: loadMyGames }}>Your games didn&apos;t load.</NoticeTile>
            ) : !myGames ? (
              <NoticeTile>Loading...</NoticeTile>
            ) : recentGames.length === 0 ? (
              <NoticeTile>Your finished games show up here.</NoticeTile>
            ) : (
              recentGames.map((game) => <GameTile key={game.game_id} game={game} />)
            )}
          </section>
        </div>
      </DashboardFrame>

      {showAddModal && (
        <AddCubeModal
          onClose={() => setShowAddModal(false)}
          onCreated={(preset) => {
            setLibrary((prev) => prev && { ...prev, presets: [...prev.presets, preset] })
            setShowAddModal(false)
          }}
          addToast={addToast}
        />
      )}
      {showJoinModal && <JoinGameModal onClose={() => setShowJoinModal(false)} />}
    </>
  )
}

function LibraryTile({
  entry,
  style,
  className,
  onDelete,
  onUnfollow,
}: {
  entry: LibraryEntry
  style: CSSProperties
  className: string
  onDelete: (preset: UserBattler) => void
  onUnfollow: (follow: FollowedBattler) => void
}) {
  const navigate = useNavigate()

  if (entry.kind === 'saved') {
    const { preset } = entry
    const href = `/dashboard/list/${preset.id}`
    return (
      <CubeTile
        title={cubeTitle(preset)}
        cubeId={preset.cube_id}
        imageUri={preset.cube_image_uri}
        badge={preset.play_mode === 'constructed' ? 'Deck' : 'Cube'}
        chips={[countLabel(preset.puppet_count, 'opponent'), upgradesLabel(preset.use_upgrades)]}
        footer={
          preset.my_game_count > 0 ? (
            <>
              <Count value={preset.my_game_count}>{' '}{preset.my_game_count === 1 ? 'game' : 'games'}</Count>
              {preset.my_last_played && ` · ${formatWhen(preset.my_last_played)}`}
            </>
          ) : (
            'No games yet'
          )
        }
        href={href}
        onPlay={() => navigate(battlerPlayUrl(preset))}
        menuItems={[
          { label: 'View', onSelect: () => navigate(href) },
          { label: 'Delete', onSelect: () => onDelete(preset), danger: true },
        ]}
        style={style}
        className={className}
      />
    )
  }

  const { follow } = entry
  const href = `/cube/${encodeURIComponent(follow.cube_id)}`
  return (
    <CubeTile
      title={cubeTitle(follow)}
      cubeId={follow.cube_id}
      imageUri={follow.cube_image_uri}
      badge="Following"
      chips={[countLabel(follow.human_player_count, 'player'), countLabel(follow.game_count, 'community game')]}
      footer={follow.last_played ? `Last played ${formatWhen(follow.last_played)}` : 'No games yet'}
      href={href}
      onPlay={() => navigate(`/play?cubeId=${encodeURIComponent(follow.cube_id)}`)}
      menuItems={[
        { label: 'View', onSelect: () => navigate(href) },
        { label: 'Unfollow', onSelect: () => onUnfollow(follow), danger: true },
      ]}
      style={style}
      className={className}
    />
  )
}
