import { useEffect, useState, type CSSProperties } from 'react'
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
import { Count, NoticeTile, PlayIcon, SectionCounts, SectionLink, SectionTitle, WinsCount } from '../components/dashboard/Section'
import { SegmentedFilter } from '../components/dashboard/SegmentedFilter'
import { deleteBattler, getBattlers, getFollowing, getMyGames, unfollowCube } from '../api/client'
import { useFirstLoad } from '../hooks/useFirstLoad'
import { useResumableGames } from '../hooks/useResumableGames'
import type { GameSummary } from '../types'
import { battlerPlayUrl } from '../utils/battlerPlayUrl'
import { countLabel, cubeTitle, formatWhen, upgradesLabel } from '../utils/accountFormat'
import {
  canRemove,
  libraryEntries,
  libraryEntryKey,
  libraryHasMore,
  loadedLibrary,
  nextLibraryPage,
  withAddedPreset,
  withLibraryPage,
  withLibraryPageFailed,
  withLibraryPageRequested,
  withRemovalFailed,
  withRemovalStarted,
  withRemoved,
  type Library,
  type LibraryEntry,
  type LibraryPage,
} from './dashboardState'

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

interface MyGames {
  games: GameSummary[]
  totalGames: number
  totalWins: number
}

async function loadLibrary(): Promise<Library> {
  const [saved, following] = await Promise.all([getBattlers(), getFollowing()])
  return loadedLibrary(saved, following)
}

async function loadMyGames(): Promise<MyGames> {
  const data = await getMyGames(0)
  return { games: data.games, totalGames: data.total_games, totalWins: data.total_wins }
}

export function Dashboard() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const { addToast } = useToast()
  const [resumable] = useResumableGames(1)

  const libraryLoad = useFirstLoad(loadLibrary, !!user)
  const myGamesLoad = useFirstLoad(loadMyGames, !!user)
  const [phoneSection, setPhoneSection] = useState<BoardSection>('library')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showJoinModal, setShowJoinModal] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) navigate('/login?returnTo=/dashboard', { replace: true })
  }, [authLoading, user, navigate])

  const library = libraryLoad.state.status === 'loaded' ? libraryLoad.state.value : null
  const myGames = myGamesLoad.state.status === 'loaded' ? myGamesLoad.state.value : null

  const updateLibrary = (change: (library: Library) => Library) =>
    libraryLoad.update((prev) => (prev.status === 'loaded' ? { ...prev, value: change(prev.value) } : prev))

  const loadMoreLibrary = async () => {
    const next = library && nextLibraryPage(library)
    if (!next) return
    updateLibrary(withLibraryPageRequested)
    try {
      const page: LibraryPage =
        next.list === 'saved'
          ? { list: 'saved', page: await getBattlers(next.offset) }
          : { list: 'following', page: await getFollowing(next.offset) }
      updateLibrary((current) => withLibraryPage(current, page))
    } catch {
      updateLibrary(withLibraryPageFailed)
      addToast('Failed to load more', 'error')
    }
  }

  const remove = async (entry: LibraryEntry) => {
    if (!library || !canRemove(library, entry)) return
    if (entry.kind === 'saved' && !window.confirm(`Delete "${cubeTitle(entry.preset)}"?`)) return
    updateLibrary((current) => withRemovalStarted(current, entry))
    try {
      await (entry.kind === 'saved' ? deleteBattler(entry.preset.id) : unfollowCube(entry.follow.id))
      updateLibrary((current) => withRemoved(current, entry))
    } catch {
      updateLibrary((current) => withRemovalFailed(current, entry))
      addToast(entry.kind === 'saved' ? 'Failed to delete' : 'Failed to unfollow', 'error')
    }
  }

  if (authLoading || !user) return null

  const entries = library ? libraryEntries(library) : []
  const hasMore = !!library && libraryHasMore(library)
  const allCount = library ? `${entries.length}${hasMore ? '+' : ''}` : ''
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
      <DashboardFrame header={<AppHeader account={<UserMenuButton />} />}>
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
              <PlayIcon />
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

          {libraryLoad.state.status === 'failed' ? (
            <NoticeTile style={gridCell(2, 1)} className={libraryNotice} action={{ label: 'Retry', onClick: libraryLoad.retry }}>
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
                key={libraryEntryKey(entry)}
                entry={entry}
                style={gridCell(2 + Math.floor(index / 2), 1 + (index % 2))}
                className={libraryCell}
                removable={canRemove(library, entry)}
                onRemove={remove}
              />
            ))
          )}

          {library && hasMore && (
            <LoadMoreButton
              loading={library.loadingMore}
              disabled={!nextLibraryPage(library)}
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

            {myGamesLoad.state.status === 'failed' ? (
              <NoticeTile action={{ label: 'Retry', onClick: myGamesLoad.retry }}>Your games didn&apos;t load.</NoticeTile>
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
            // The list can finish loading after Add is sent, so this can't go by the `library` of that render.
            libraryLoad.updateOrReload((current) => withAddedPreset(current, preset))
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
  removable,
  onRemove,
}: {
  entry: LibraryEntry
  style: CSSProperties
  className: string
  /** False while this card's delete or unfollow, or a page of the library, is loading. */
  removable: boolean
  onRemove: (entry: LibraryEntry) => void
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
          { label: 'Delete', onSelect: () => onRemove(entry), danger: true, disabled: !removable },
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
        { label: 'Unfollow', onSelect: () => onRemove(entry), danger: true, disabled: !removable },
      ]}
      style={style}
      className={className}
    />
  )
}
