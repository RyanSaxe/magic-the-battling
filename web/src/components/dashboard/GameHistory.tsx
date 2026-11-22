import { useEffect, useState, type ReactNode } from 'react'
import type { CubeGamesPage } from '../../api/client'
import { useToast } from '../../contexts'
import type { GameSummary, PlayMode } from '../../types'
import { countLabel, modeLabel, upgradesLabel } from '../../utils/accountFormat'
import { FilterGroup, FilterMenu } from './FilterMenu'
import { RecapCard } from './GameTile'
import { LoadMoreButton } from './ResultList'
import { NoticeTile } from './Section'
import { SegmentedFilter } from './SegmentedFilter'

export interface GameFilters {
  playMode: PlayMode | null
  useUpgrades: boolean | null
  mineOnly: boolean
}

export type LoadGames = (filters: GameFilters, offset: number) => Promise<CubeGamesPage>

/** A loaded list, stamped with the filters it was loaded for, so a list for older filters never shows. */
interface LoadedGames {
  filters: GameFilters
  games: GameSummary[]
  hasMore: boolean
  totalGames: number
}

type ModeChoice = 'all' | PlayMode
type UpgradesChoice = 'all' | 'on' | 'off'

const UPGRADES_CHOICE: Record<UpgradesChoice, boolean | null> = { all: null, on: true, off: false }

function upgradesChoice(useUpgrades: boolean | null): UpgradesChoice {
  if (useUpgrades === null) return 'all'
  return useUpgrades ? 'on' : 'off'
}

/** What the filter button says: "All games", "Deck", "Cube · Upgrades On". */
function shownGames({ playMode, useUpgrades }: GameFilters): string {
  const narrowed: string[] = []
  if (playMode !== null) narrowed.push(modeLabel(playMode))
  if (useUpgrades !== null) narrowed.push(upgradesLabel(useUpgrades))
  return narrowed.join(' · ') || 'All games'
}

interface GameHistoryProps {
  loadGames: LoadGames
  initialFilters: GameFilters
  /** Offers My Games and All Players. Without it the list is everyone's games. */
  scoped?: boolean
  /** What the toolbar calls the list, given its total once it has loaded. */
  title?: (totalGames: number | null) => ReactNode
}

/** A cube's finished games, newest first, with one menu to narrow them by mode and upgrades. */
export function GameHistory({ loadGames, initialFilters, scoped = false, title }: GameHistoryProps) {
  const { addToast } = useToast()
  const [filters, setFilters] = useState<GameFilters>(initialFilters)
  const [loaded, setLoaded] = useState<LoadedGames | null>(null)
  const [failedFilters, setFailedFilters] = useState<GameFilters | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadGames(filters, 0)
      .then((page) => {
        if (cancelled) return
        setLoaded({ filters, games: page.games, hasMore: page.has_more, totalGames: page.total_games })
      })
      .catch(() => {
        if (!cancelled) setFailedFilters(filters)
      })
    return () => {
      cancelled = true
    }
  }, [filters, loadGames, attempt])

  const current = loaded?.filters === filters ? loaded : null
  const failed = failedFilters === filters && !current

  const loadMore = async () => {
    if (!current) return
    setLoadingMore(true)
    try {
      const page = await loadGames(filters, current.games.length)
      setLoaded((prev) =>
        prev && prev.filters === filters
          ? { ...prev, games: [...prev.games, ...page.games], hasMore: page.has_more, totalGames: page.total_games }
          : prev,
      )
    } catch {
      addToast('Failed to load games', 'error')
    } finally {
      setLoadingMore(false)
    }
  }

  const change = (update: Partial<GameFilters>) => setFilters((prev) => ({ ...prev, ...update }))

  return (
    <section aria-label="Game history" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {scoped && (
          <SegmentedFilter
            label="Whose games"
            variant="heading"
            className="w-full sm:w-auto"
            value={filters.mineOnly ? 'mine' : 'everyone'}
            onChange={(value) => change({ mineOnly: value === 'mine' })}
            options={[
              { value: 'mine', label: 'My Games' },
              { value: 'everyone', label: 'All Players' },
            ]}
          />
        )}
        {title?.(current?.totalGames ?? null)}
        {scoped && current && (
          <span className="text-xs tabular-nums text-[var(--ivory-muted)]">{countLabel(current.totalGames, 'game')}</span>
        )}
        <FilterMenu shown={shownGames(filters)}>
          <FilterGroup title="Mode">
            <SegmentedFilter<ModeChoice>
              label="Mode"
              className="w-full"
              value={filters.playMode ?? 'all'}
              onChange={(value) => change({ playMode: value === 'all' ? null : value })}
              options={[
                { value: 'all', label: 'All' },
                { value: 'limited', label: 'Cube' },
                { value: 'constructed', label: 'Deck' },
              ]}
            />
          </FilterGroup>
          <FilterGroup title="Upgrades">
            <SegmentedFilter<UpgradesChoice>
              label="Upgrades"
              className="w-full"
              value={upgradesChoice(filters.useUpgrades)}
              onChange={(value) => change({ useUpgrades: UPGRADES_CHOICE[value] })}
              options={[
                { value: 'all', label: 'All' },
                { value: 'on', label: 'On' },
                { value: 'off', label: 'Off' },
              ]}
            />
          </FilterGroup>
        </FilterMenu>
      </div>

      {failed ? (
        <NoticeTile
          action={{
            label: 'Retry',
            onClick: () => {
              setFailedFilters(null)
              setAttempt((n) => n + 1)
            },
          }}
        >
          The games didn&apos;t load.
        </NoticeTile>
      ) : !current ? (
        <NoticeTile>Loading...</NoticeTile>
      ) : current.games.length === 0 ? (
        <NoticeTile
          action={
            filters.playMode !== null || filters.useUpgrades !== null
              ? { label: 'Show all modes and upgrades', onClick: () => change({ playMode: null, useUpgrades: null }) }
              : undefined
          }
        >
          {filters.mineOnly ? 'You have no finished games here yet.' : 'No finished games here yet.'}
        </NoticeTile>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 min-[1600px]:grid-cols-3">
          {current.games.map((game) => (
            <RecapCard key={game.game_id} game={game} />
          ))}
        </div>
      )}

      {current?.hasMore && <LoadMoreButton loading={loadingMore} onClick={loadMore} />}
    </section>
  )
}
