import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { FaUser } from 'react-icons/fa6'
import { PuppetIcon } from './icons/PuppetIcon'
import { useToast } from '../contexts'
import { LabeledDivider } from './common/LabeledDivider'
import { InfoCard } from './common/InfoCard'
import type { GameSummary } from '../types'

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso
  }
}

interface CubeGameHistoryProps {
  cubeId: string
  cubeName: string | null
  cubeImageUri: string | null
  cubeCobraUrl: string
  defaultPlayMode: string | null
  defaultUpgrades: boolean | null
  actions: ReactNode
  loadGames: (cubeId: string, opts: { offset?: number; playMode?: string; useUpgrades?: boolean }) => Promise<{ games: GameSummary[]; has_more: boolean; total_games: number }>
  onMetadata?: (name: string | null, imageUri: string | null) => void
}

export function CubeGameHistory({
  cubeId,
  cubeName,
  cubeImageUri,
  cubeCobraUrl,
  defaultPlayMode,
  defaultUpgrades,
  actions,
  loadGames: fetchGames,
  onMetadata,
}: CubeGameHistoryProps) {
  const navigate = useNavigate()
  const { addToast } = useToast()

  const [games, setGames] = useState<GameSummary[]>([])
  const [gamesHasMore, setGamesHasMore] = useState(false)
  const [gamesOffset, setGamesOffset] = useState(0)
  const [gamesLoading, setGamesLoading] = useState(false)
  const [totalGames, setTotalGames] = useState(0)
  const [filterPlayMode, setFilterPlayMode] = useState<string | null>(defaultPlayMode)
  const [filterUpgrades, setFilterUpgrades] = useState<boolean | null>(defaultUpgrades)
  const [initialLoad, setInitialLoad] = useState(true)

  const loadPage = useCallback(async (playMode: string | null, upgrades: boolean | null, offset: number) => {
    setGamesLoading(true)
    try {
      const data = await fetchGames(cubeId, {
        offset,
        playMode: playMode ?? undefined,
        useUpgrades: upgrades ?? undefined,
      })
      if (offset === 0) {
        setGames(data.games)
        if (data.games.length > 0 && onMetadata) {
          onMetadata(data.games[0].cube_name ?? null, data.games[0].cube_image_uri ?? null)
        }
      } else {
        setGames((prev) => [...prev, ...data.games])
      }
      setGamesHasMore(data.has_more)
      setGamesOffset(offset + data.games.length)
      setTotalGames(data.total_games)
    } catch {
      addToast('Failed to load games', 'error')
    } finally {
      setGamesLoading(false)
      setInitialLoad(false)
    }
  }, [cubeId, fetchGames, onMetadata, addToast])

  useEffect(() => {
    loadPage(defaultPlayMode, defaultUpgrades, 0)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (initialLoad) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-amber-200/70">Loading...</p>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Hero banner */}
      <div className="mb-4">
        {cubeImageUri ? (
          <div className="relative h-[100px] overflow-hidden rounded-lg">
            <img
              src={cubeImageUri}
              alt=""
              className="absolute inset-0 w-full h-full object-cover brightness-[0.35]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#1c1714] via-transparent to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 px-4 pb-3">
              <h2 className="text-white font-bold text-lg drop-shadow-md">{cubeName || cubeId}</h2>
              {cubeName && cubeName !== cubeId && (
                <a href={cubeCobraUrl} target="_blank" rel="noopener noreferrer" className="text-amber-400/80 text-xs hover:text-amber-300 transition-colors drop-shadow-sm">
                  {cubeId} ↗
                </a>
              )}
              {(!cubeName || cubeName === cubeId) && (
                <a href={cubeCobraUrl} target="_blank" rel="noopener noreferrer" className="text-amber-400/80 text-xs hover:text-amber-300 transition-colors drop-shadow-sm">
                  View on CubeCobra ↗
                </a>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-amber-950/40 rounded-lg px-4 py-3">
            <h2 className="text-white font-bold text-lg">{cubeName || cubeId}</h2>
            {cubeName && cubeName !== cubeId && (
              <a href={cubeCobraUrl} target="_blank" rel="noopener noreferrer" className="text-amber-400/80 text-xs hover:text-amber-300 transition-colors">
                {cubeId} ↗
              </a>
            )}
            {(!cubeName || cubeName === cubeId) && (
              <a href={cubeCobraUrl} target="_blank" rel="noopener noreferrer" className="text-amber-400/80 text-xs hover:text-amber-300 transition-colors">
                View on CubeCobra ↗
              </a>
            )}
          </div>
        )}

        {/* Stats + actions bar */}
        <div className="flex items-center justify-between mt-3 gap-3">
          <div className="flex items-center gap-3 text-sm text-amber-200/80">
            <span className="text-amber-50">{totalGames}</span> games
          </div>
          <div className="flex gap-2 shrink-0">
            {actions}
          </div>
        </div>
      </div>

      <LabeledDivider label={totalGames > 0 ? `Game History (${totalGames})` : 'Game History'} />

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mt-3 mb-3">
        <div className="inline-flex rounded-full border border-[color:rgba(212,175,55,0.25)] bg-black/15 p-1">
          {([['limited', 'Cube'], ['constructed', 'Deck']] as const).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => {
                const next = filterPlayMode === mode ? null : mode
                setFilterPlayMode(next)
                loadPage(next, filterUpgrades, 0)
              }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filterPlayMode === mode
                  ? 'border border-[var(--gold-border)] bg-amber-950/35 text-amber-100 shadow-[inset_0_1px_0_rgba(255,236,181,0.16)]'
                  : 'border border-transparent bg-black/10 text-amber-200/80 hover:text-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-full border border-[color:rgba(212,175,55,0.25)] bg-black/15 p-1">
          {([[true, 'Upgrades On'], [false, 'Upgrades Off']] as const).map(([val, label]) => (
            <button
              key={label}
              onClick={() => {
                const next = filterUpgrades === val ? null : val
                setFilterUpgrades(next)
                loadPage(filterPlayMode, next, 0)
              }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filterUpgrades === val
                  ? 'border border-[var(--gold-border)] bg-amber-950/35 text-amber-100 shadow-[inset_0_1px_0_rgba(255,236,181,0.16)]'
                  : 'border border-transparent bg-black/10 text-amber-200/80 hover:text-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Game grid */}
      <div>
        {games.length === 0 && !gamesLoading ? (
          <div className="flex-1 flex items-center justify-center py-8">
            <p className="text-amber-200/70">No games match these filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-full">
            {games.map((g) => (
              <InfoCard
                key={g.game_id}
                title={formatDate(g.created_at)}
                badge={g.best_human_placement ? { text: ordinal(g.best_human_placement), color: g.best_human_placement === 1 ? 'gold' : 'gray' } : undefined}
                inlineStats={<>
                  <FaUser className="w-3 h-3 text-gray-500" /><span>{g.human_count}</span>
                  {g.player_count - g.human_count > 0 && <>
                    <PuppetIcon size="sm" className="opacity-60" />
                    <span>{g.player_count - g.human_count}</span>
                  </>}
                  <span className="text-gray-600">·</span>
                  <span>{g.best_human_name}</span>
                </>}
                onClick={() => navigate(`/game/${g.game_id}/share/${encodeURIComponent(g.best_human_name)}`)}
                className={g.best_human_placement === 1 ? 'shadow-[0_0_12px_rgba(212,175,55,0.15)]' : ''}
              >
                {g.hand_scryfall_ids.length > 0 && (
                  <div className="flex -space-x-3 mt-2">
                    {g.hand_scryfall_ids.slice(0, 7).map((sid) => (
                      <img
                        key={sid}
                        src={`https://cards.scryfall.io/small/front/${sid[0]}/${sid[1]}/${sid}.jpg`}
                        alt=""
                        className="w-10 h-14 rounded-sm border border-black/60 object-cover"
                        loading="lazy"
                      />
                    ))}
                  </div>
                )}
              </InfoCard>
            ))}
          </div>
        )}
        {gamesHasMore && (
          <button
            onClick={() => loadPage(filterPlayMode, filterUpgrades, gamesOffset)}
            disabled={gamesLoading}
            className="btn btn-secondary py-2 px-6 mx-auto mt-4 block disabled:opacity-50"
          >
            {gamesLoading ? 'Loading...' : 'Load More'}
          </button>
        )}
      </div>
    </div>
  )
}
