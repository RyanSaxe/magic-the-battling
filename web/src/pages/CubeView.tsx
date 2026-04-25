import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { FaDiscord, FaUser } from 'react-icons/fa6'
import { PuppetIcon } from '../components/icons/PuppetIcon'
import { useToast } from '../contexts'
import { AppHeader, UserMenuButton } from '../components/common/AppHeader'
import { CubeCobraPrimerLink } from '../components/common/CubeCobraPrimerLink'
import { LabeledDivider } from '../components/common/LabeledDivider'
import { InfoCard } from '../components/common/InfoCard'
import { getCubeGames } from '../api/client'
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

export function CubeView() {
  const { cubeId } = useParams<{ cubeId: string }>()
  const navigate = useNavigate()
  const { addToast } = useToast()

  const [games, setGames] = useState<GameSummary[]>([])
  const [gamesHasMore, setGamesHasMore] = useState(false)
  const [gamesOffset, setGamesOffset] = useState(0)
  const [gamesLoading, setGamesLoading] = useState(false)
  const [totalGames, setTotalGames] = useState(0)
  const [totalWins, setTotalWins] = useState(0)
  const [filterPlayMode, setFilterPlayMode] = useState<string | null>(null)
  const [filterUpgrades, setFilterUpgrades] = useState<boolean | null>(null)
  const [initialLoad, setInitialLoad] = useState(true)
  const [cubeName, setCubeName] = useState<string | null>(null)

  // No auth required — this page is publicly viewable

  const loadGames = useCallback(async (id: string, playMode: string | null, upgrades: boolean | null, offset: number) => {
    setGamesLoading(true)
    try {
      const data = await getCubeGames(id, {
        offset,
        playMode: playMode ?? undefined,
        useUpgrades: upgrades ?? undefined,
      })
      if (offset === 0) {
        setGames(data.games)
        if (data.games.length > 0) {
          setCubeName(data.games[0].cube_name ?? null)
        }
      } else {
        setGames((prev) => [...prev, ...data.games])
      }
      setGamesHasMore(data.has_more)
      setGamesOffset(offset + data.games.length)
      setTotalGames(data.total_games)
      setTotalWins(data.total_wins)
    } catch {
      addToast('Failed to load games', 'error')
    } finally {
      setGamesLoading(false)
      setInitialLoad(false)
    }
  }, [addToast])

  useEffect(() => {
    if (cubeId) {
      loadGames(cubeId, null, null, 0)
    }
  }, [cubeId, loadGames])

  const cubeCobraUrl = cubeId
    ? `https://cubecobra.com/cube/overview/${encodeURIComponent(cubeId)}`
    : '#'

  if (initialLoad) {
    return (
      <div className="game-table h-dvh flex flex-col overflow-hidden">
        <AppHeader renderRight={({ compact }) => (
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/dashboard')}
              className={`btn btn-secondary ${compact ? 'py-1.5 px-3 text-sm' : 'py-2 px-4'}`}
            >
              Back
            </button>
            <UserMenuButton compact={compact} />
          </div>
        )} />
        <div className="flex-1 flex min-h-0 game-surface">
          <div className="sm:hidden w-[4px] shrink-0 frame-chrome" />
          <main className="flex-1 min-h-0 p-[2px] zone-divider-bg">
            <div className="zone-pack h-full min-h-0 flex items-center justify-center">
              <p className="text-gray-500">Loading...</p>
            </div>
          </main>
          <div className="w-[4px] sm:w-10 shrink-0 frame-chrome" />
        </div>
        <footer className="shrink-0 frame-chrome bar-pad-both py-2">
          <div className="flex items-center justify-between">
            <a href="https://discord.gg/2NAjcWXNKn" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-[#6974F4] hover:text-[#7983F5] transition-colors">
              <FaDiscord className="w-4 h-4" />
              Join Discord
            </a>
            <CubeCobraPrimerLink />
          </div>
        </footer>
      </div>
    )
  }

  return (
    <div className="game-table h-dvh flex flex-col overflow-hidden">
      <AppHeader renderRight={({ compact }) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/dashboard')}
            className={`btn btn-secondary ${compact ? 'py-1.5 px-3 text-sm' : 'py-2 px-4'}`}
          >
            Back
          </button>
          <UserMenuButton compact={compact} />
        </div>
      )} />

      <div className="flex-1 flex min-h-0 game-surface">
        <div className="sm:hidden w-[4px] shrink-0 frame-chrome" />

        <main className="flex-1 min-w-0 min-h-0 p-[2px] zone-divider-bg flex flex-col">
          <div className="zone-pack shell-scroll-col flex-1 min-w-0 min-h-0 flex flex-col px-4 py-4 overflow-auto">
            <div className="mb-4 pb-4 border-b border-black/40">
              <h2 className="text-white font-bold text-lg">{cubeName || cubeId}</h2>
              {cubeName && cubeName !== cubeId && (
                <p className="text-xs text-gray-400 mt-0.5">{cubeId}</p>
              )}
              <a
                href={cubeCobraUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-amber-400 hover:text-amber-300 transition-colors mt-1 inline-block"
              >
                View on CubeCobra
              </a>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => navigate(`/play?cubeId=${encodeURIComponent(cubeId || '')}`)}
                  className="btn btn-primary py-1.5 px-3 text-sm font-semibold"
                >
                  Play
                </button>
              </div>
            </div>

            <dl className="overflow-hidden rounded-lg border border-[color:rgba(212,175,55,0.22)] bg-black/10 mb-4">
              <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-3 px-3 py-1.5">
                <dt className="text-[11px] font-medium text-gray-400">Games played</dt>
                <dd className="min-w-0 text-right text-sm text-amber-50">{totalGames}</dd>
              </div>
              <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-3 px-3 py-1.5 border-t border-[color:rgba(212,175,55,0.12)]">
                <dt className="text-[11px] font-medium text-gray-400">Wins</dt>
                <dd className="min-w-0 text-right text-sm text-amber-50">
                  {totalGames > 0 ? `${totalWins} (${Math.round((totalWins / totalGames) * 100)}%)` : '—'}
                </dd>
              </div>
            </dl>

            <LabeledDivider label={totalGames > 0 ? `Game History (${totalGames})` : 'Game History'} />

            <div className="flex flex-wrap gap-2 mt-3 mb-3">
              <div className="inline-flex rounded-full border border-[color:rgba(212,175,55,0.25)] bg-black/15 p-1">
                {([['limited', 'Cube'], ['constructed', 'Deck']] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => {
                      const next = filterPlayMode === mode ? null : mode
                      setFilterPlayMode(next)
                      if (cubeId) loadGames(cubeId, next, filterUpgrades, 0)
                    }}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      filterPlayMode === mode
                        ? 'border border-[var(--gold-border)] bg-amber-950/35 text-amber-100 shadow-[inset_0_1px_0_rgba(255,236,181,0.16)]'
                        : 'border border-transparent bg-black/10 text-gray-400 hover:text-gray-200'
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
                      if (cubeId) loadGames(cubeId, filterPlayMode, next, 0)
                    }}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      filterUpgrades === val
                        ? 'border border-[var(--gold-border)] bg-amber-950/35 text-amber-100 shadow-[inset_0_1px_0_rgba(255,236,181,0.16)]'
                        : 'border border-transparent bg-black/10 text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              {games.length === 0 && !gamesLoading ? (
                <div className="flex-1 flex items-center justify-center py-8">
                  <p className="text-gray-500">No games match these filters.</p>
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
                  onClick={() => cubeId && loadGames(cubeId, filterPlayMode, filterUpgrades, gamesOffset)}
                  disabled={gamesLoading}
                  className="btn btn-secondary py-2 px-6 mx-auto mt-4 block disabled:opacity-50"
                >
                  {gamesLoading ? 'Loading...' : 'Load More'}
                </button>
              )}
            </div>
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
