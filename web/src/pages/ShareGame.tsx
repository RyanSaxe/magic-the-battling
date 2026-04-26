import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getShareGame } from '../api/client'
import type { ShareGameResponse, SharePlayerSnapshot, Card as CardType } from '../types'
import { ShareRoundDetail } from '../components/share/ShareRoundDetail'
import { buildSharePlayerViews, getSharePlayerRowBadge } from '../utils/share'
import { useViewportCardSizes } from '../hooks/useViewportCardSizes'
import { useGameShellMode } from '../hooks/useGameShellMode'
import { useElementHeight } from '../hooks/useElementHeight'
import type { ZoneConstraints } from '../hooks/computeConstrainedLayout'
import { CardPreviewContext, CardPreviewModal } from '../components/card'
import { PLAYER_ROW_STACK_CLASS, PlayerRow } from '../components/PlayerList'
import { useHotkeys } from '../hooks/useHotkeys'
import { getSidebarPlayerOrder } from '../utils/playerPlacement'

interface RoundOption {
  label: string
  value: string
}

function buildRoundOptions(rounds: SharePlayerSnapshot[]): RoundOption[] {
  return rounds.map((snap) => ({
    label: `Stage ${snap.stage} - Round ${snap.round}`,
    value: `${snap.stage}_${snap.round}`,
  }))
}

function getLatestRoundValue(rounds: SharePlayerSnapshot[]): string {
  const latest = rounds[rounds.length - 1]
  return latest ? `${latest.stage}_${latest.round}` : ''
}

function RoundPopover({
  options,
  selectedRound,
  onSelect,
  onClose,
}: {
  options: RoundOption[]
  selectedRound: string
  onSelect: (value: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute bottom-full mb-2 left-0 z-50 modal-chrome backdrop-blur border gold-border rounded-lg shadow-2xl p-2 flex flex-col gap-1 min-w-[180px] max-h-[300px] overflow-y-auto"
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => {
            onSelect(opt.value)
            onClose()
          }}
          className={`text-sm py-1.5 px-3 rounded text-left transition-colors ${
            opt.value === selectedRound
              ? 'bg-amber-600/80 text-white'
              : 'text-gray-300 hover:bg-gray-700/60'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function ShareGame() {
  const { gameId, playerName } = useParams<{ gameId: string; playerName: string }>()
  const navigate = useNavigate()
  const sizes = useViewportCardSizes()
  const shellMode = useGameShellMode()
  const [data, setData] = useState<ShareGameResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedRound, setSelectedRound] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [roundPopoverOpen, setRoundPopoverOpen] = useState(false)
  const [previewCard, setPreviewCardState] = useState<CardType | null>(null)
  const [previewUpgrades, setPreviewUpgrades] = useState<CardType[]>([])
  const [deckConstraintsByView, setDeckConstraintsByView] = useState<Record<string, ZoneConstraints>>({})
  const [headerRef] = useElementHeight()
  const [bottomBarRef] = useElementHeight()
  const usesOverlaySidebar = shellMode !== 'big'
  const overlaySidebarOpen = usesOverlaySidebar && sidebarOpen
  const isSmallShell = shellMode === 'small'
  const usesCompactHeader = shellMode === 'mobile'
  const headerChromeClassName =
    shellMode === 'big'
      ? 'shrink-0 py-3 frame-chrome bar-pad-left'
      : 'shrink-0 py-3 frame-chrome bar-pad-both'
  const bottomBarPaddingClass =
    shellMode === 'small' ? 'bar-pad-both' : 'bar-pad-main'
  const setPreviewCard = useCallback((card: CardType | null, appliedUpgrades?: CardType[]) => {
    setPreviewCardState(card)
    setPreviewUpgrades(appliedUpgrades ?? [])
  }, [])
  const setDeckConstraintsForView = useCallback((viewKey: string, constraints: ZoneConstraints) => {
    setDeckConstraintsByView((prev) => ({ ...prev, [viewKey]: constraints }))
  }, [])
  const clearDeckConstraintsForView = useCallback((viewKey: string) => {
    setDeckConstraintsByView((prev) => {
      if (!(viewKey in prev)) return prev
      const next = { ...prev }
      delete next[viewKey]
      return next
    })
  }, [])

  useEffect(() => {
    if (!gameId || !playerName) return
    getShareGame(gameId, playerName)
      .then((res) => {
        setData(res)
        setSelectedPlayer(res.owner_name)
        const ownerPlayer = res.players.find((player) => player.name === res.owner_name)
        const referenceSnapshots = ownerPlayer?.snapshots ?? res.players[0]?.snapshots ?? []
        setSelectedRound(getLatestRoundValue(referenceSnapshots))
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [gameId, playerName])

  const ownerPlayer = data?.players.find((p) => p.name === data.owner_name)
  const referenceSnapshots = ownerPlayer?.snapshots ?? data?.players[0]?.snapshots ?? []
  const latestRoundValue = getLatestRoundValue(referenceSnapshots)
  const selectedRoundExists = referenceSnapshots.some(
    (snapshot) => `${snapshot.stage}_${snapshot.round}` === selectedRound,
  )
  const effectiveSelectedRound = selectedRoundExists ? selectedRound : latestRoundValue
  const playerViews = buildSharePlayerViews(data, effectiveSelectedRound)
  const sortedPlayerViews = getSidebarPlayerOrder(playerViews)
  const shareHotkeys: Record<string, () => void> = {}
  if (shellMode === 'big' && !previewCard && !roundPopoverOpen) {
    sortedPlayerViews.slice(0, 8).forEach((player, index) => {
      shareHotkeys[String(index + 1)] = () => {
        setSelectedPlayer(player.name)
      }
    })
  }

  useHotkeys(shareHotkeys, true)

  const handleCloseRoundPopover = useCallback(() => setRoundPopoverOpen(false), [])

  if (loading) {
    return (
      <div className="h-dvh flex items-center justify-center bg-gray-900 text-gray-400">
        Loading game...
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center bg-gray-900 text-gray-400 gap-4">
        <p>{error || 'Game not found'}</p>
        <button
          className="bg-amber-600 text-white px-4 py-2 rounded hover:bg-amber-500"
          onClick={() => navigate('/')}
        >
          Go Home
        </button>
      </div>
    )
  }

  const sharePlayersByName = new Map(data.players.map((player) => [player.name, player] as const))
  const roundOptions = buildRoundOptions(referenceSnapshots)

  const currentPlayerData = data.players.find((p) => p.name === selectedPlayer)
  const currentSnapshot = currentPlayerData
    ? currentPlayerData.snapshots.find((s) => `${s.stage}_${s.round}` === effectiveSelectedRound)
    : null
  const currentIndex = roundOptions.findIndex((o) => o.value === effectiveSelectedRound)
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < roundOptions.length - 1
  const currentRoundLabel = roundOptions.find((o) => o.value === effectiveSelectedRound)?.label ?? 'No rounds'
  const roundLayoutStateKey = currentSnapshot
    ? `round:${selectedPlayer}:${currentSnapshot.stage}:${currentSnapshot.round}`
    : null
  const roundResizeState = roundLayoutStateKey
    ? {
        constraints: deckConstraintsByView[roundLayoutStateKey] ?? null,
        setConstraints: (constraints: ZoneConstraints) => {
          setDeckConstraintsForView(roundLayoutStateKey, constraints)
        },
        clearConstraints: () => {
          clearDeckConstraintsForView(roundLayoutStateKey)
        },
      }
    : undefined

  const renderContent = () => {
    if (roundOptions.length === 0) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="modal-chrome border gold-border rounded-lg p-5 max-w-md w-[min(92vw,28rem)]">
            <h2 className="text-lg font-semibold text-amber-200">No Round Data</h2>
            <p className="text-sm text-gray-200 mt-2 leading-snug">
              No round data is available for this game.
            </p>
          </div>
        </div>
      )
    }

    if (currentSnapshot) {
      return (
        <div className="flex-1 min-h-0 flex flex-col">
          <ShareRoundDetail
            snapshot={currentSnapshot}
            useUpgrades={data.use_upgrades}
            enableResize
            isMobile={sizes.isMobile}
            layoutStateKey={roundLayoutStateKey ?? undefined}
            resizeState={roundResizeState}
            showLayoutReset
          />
        </div>
      )
    }

    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="modal-chrome border gold-border rounded-lg p-5 max-w-md w-[min(92vw,28rem)]">
          <p className="text-sm text-gray-200 leading-snug">
            {currentPlayerData
              ? 'This player was not in the game during this round.'
              : 'Select a player to view their deck.'}
          </p>
        </div>
      </div>
    )
  }

  const renderSidebarContent = () => (
    <div className="px-3 py-0">
      <div className={PLAYER_ROW_STACK_CLASS}>
        {sortedPlayerViews.map((pv) => {
          const sharePlayer = sharePlayersByName.get(pv.name)
          const shareStatus = sharePlayer
            ? getSharePlayerRowBadge(sharePlayer, selectedPlayer, effectiveSelectedRound)
            : (pv.name === selectedPlayer ? 'viewing' : 'dead')

          return (
            <PlayerRow
              key={pv.name}
              player={pv}
              players={playerViews}
              currentPlayerName={data.owner_name}
              isSelected={pv.name === selectedPlayer}
              variant="share"
              shareStatus={shareStatus}
              onClick={() => {
                setSelectedPlayer(pv.name)
                if (usesOverlaySidebar) setSidebarOpen(false)
              }}
            />
          )
        })}
      </div>
    </div>
  )

  return (
    <CardPreviewContext.Provider value={{ setPreviewCard }}>
    <div className="h-dvh flex flex-col bg-gray-900 text-white overflow-hidden">
      {/* Header */}
      <header ref={headerRef} className={headerChromeClassName}>
        {!usesCompactHeader ? (
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-baseline">
              <h1 className="hero-title text-[32px] font-bold tracking-wide leading-tight">
                Crucible
              </h1>
              <span className="hero-sep mx-2.5">—</span>
              <span className="hero-subtitle text-base font-normal tracking-widest">
                an MtG format
              </span>
            </div>
            <p className="hero-tagline">
              Inspired by Roguelikes and Autobattlers
            </p>
          </div>
          <div className="flex items-center gap-2">
            {data.cube_id && (
              <a
                href={`https://cubecobra.com/cube/overview/${encodeURIComponent(data.cube_id)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-amber-400 hover:text-amber-300 transition-colors mr-1"
              >
                CubeCobra
              </a>
            )}
            <button
              onClick={() => navigate('/')}
              className="btn btn-secondary py-2 px-4"
            >
              Home
            </button>
          </div>
        </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-baseline whitespace-nowrap">
                <h1 className="hero-title text-lg font-bold tracking-wide leading-tight">
                  Crucible
                </h1>
                <span className="hero-sep mx-1 text-xs">—</span>
                <span className="hero-subtitle text-[11px] font-normal tracking-wider">
                  an MtG format
                </span>
              </div>
              <p className="hero-tagline !text-[9px] !tracking-[0.04em]">
                Inspired by Roguelikes and Autobattlers
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => navigate('/')}
                className="btn btn-secondary py-1.5 px-3 text-sm"
              >
                Home
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Main + Sidebar */}
      <div className="flex-1 flex min-h-0 game-surface">
        {shellMode === 'mobile' && (
          <div className="w-[4px] shrink-0 frame-chrome" />
        )}
        <main className="flex-1 flex flex-col min-h-0 min-w-0 p-[2px] zone-divider-bg">
          <div className="zone-pack flex-1 min-h-0 flex flex-col">
            {renderContent()}
          </div>
        </main>

        {usesOverlaySidebar ? (
          <>
            {overlaySidebarOpen && (
              <div
                className="fixed inset-0 bg-black/50 z-40"
                onClick={() => setSidebarOpen(false)}
              />
            )}
            <div
              className={`fixed inset-y-0 right-0 z-50 w-[var(--sidebar-width)] border-l border-[var(--gold-border-opaque)] transition-transform duration-300 ${
                overlaySidebarOpen ? 'translate-x-0' : 'translate-x-full'
              }`}
            >
              <aside className="w-[var(--sidebar-width)] h-full frame-chrome flex flex-col overflow-hidden">
                <div className="px-3 py-2 text-sm font-medium text-gray-400">
                  Players
                </div>
                <div className="overflow-y-auto flex-1">
                  {renderSidebarContent()}
                </div>
              </aside>
            </div>
          </>
        ) : (
          <aside className="w-[var(--sidebar-width)] h-full frame-chrome flex flex-col overflow-hidden">
            <div className="overflow-y-auto flex-1">
              {renderSidebarContent()}
            </div>
          </aside>
        )}
        {shellMode === 'mobile' && (
          <div className="w-[4px] shrink-0 frame-chrome" />
        )}
        {isSmallShell && (
          <div className="w-10 shrink-0 frame-chrome" />
        )}
      </div>

      {/* Bottom Bar */}
      <div ref={bottomBarRef} className="shrink-0 frame-chrome">
        <div className={`flex items-center justify-between py-1.5 sm:py-2 ${bottomBarPaddingClass} timeline-actions`}>
          <div className="relative">
            <button
              className="btn btn-secondary text-sm py-1.5 px-3"
              disabled={roundOptions.length === 0}
              onClick={() => setRoundPopoverOpen((o) => !o)}
            >
              {currentRoundLabel}
            </button>
            {roundPopoverOpen && roundOptions.length > 0 && (
              <RoundPopover
                options={roundOptions}
                selectedRound={effectiveSelectedRound}
                onSelect={setSelectedRound}
                onClose={handleCloseRoundPopover}
              />
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn btn-secondary text-sm py-1.5 disabled:opacity-30"
              disabled={!hasPrev}
              onClick={() => hasPrev && setSelectedRound(roundOptions[currentIndex - 1].value)}
            >
              Prev
            </button>
            <button
              className="btn btn-secondary text-sm py-1.5 disabled:opacity-30"
              disabled={!hasNext}
              onClick={() => hasNext && setSelectedRound(roundOptions[currentIndex + 1].value)}
            >
              Next
            </button>
            {usesOverlaySidebar && (
              <button
                onClick={() => setSidebarOpen((o) => !o)}
                className="btn btn-secondary py-1.5 px-2 text-sm"
                aria-label="Players"
              >
                ☰
              </button>
            )}
          </div>
        </div>
      </div>
      {previewCard && (
        <CardPreviewModal
          card={previewCard}
          appliedUpgrades={previewUpgrades}
          onClose={() => setPreviewCard(null)}
        />
      )}
    </div>
    </CardPreviewContext.Provider>
  )
}
