import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getShareGame } from '../api/client'
import type { ShareGameResponse, SharePlayerSnapshot, PlayerView, Card as CardType } from '../types'
import { GameSummary } from '../components/GameSummary'
import { ShareRoundDetail } from '../components/share/ShareRoundDetail'
import { buildGameSummaryData } from '../utils/share'
import { getOrdinal, getPlacementBadgeColor } from '../utils/format'
import { useViewportCardSizes } from '../hooks/useViewportCardSizes'
import { PhaseTimeline } from '../components/PhaseTimeline'
import { CardPreviewContext, CardPreviewModal } from '../components/card'

interface RoundOption {
  label: string
  value: string
}

function buildRoundOptions(rounds: SharePlayerSnapshot[]): RoundOption[] {
  const options: RoundOption[] = [{ label: 'Latest', value: 'final' }]
  for (const snap of rounds) {
    options.push({
      label: `Stage ${snap.stage} - Round ${snap.round}`,
      value: `${snap.stage}_${snap.round}`,
    })
  }
  return options
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
      className="absolute bottom-full mb-2 left-0 z-50 bg-gray-900/95 backdrop-blur border border-gray-700 rounded-lg shadow-2xl p-2 flex flex-col gap-1 min-w-[180px] max-h-[300px] overflow-y-auto"
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
  const [data, setData] = useState<ShareGameResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedRound, setSelectedRound] = useState('final')
  const [selectedPlayer, setSelectedPlayer] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [roundPopoverOpen, setRoundPopoverOpen] = useState(false)
  const [previewCard, setPreviewCardState] = useState<CardType | null>(null)
  const [previewUpgrades, setPreviewUpgrades] = useState<CardType[]>([])
  const setPreviewCard = useCallback((card: CardType | null, appliedUpgrades?: CardType[]) => {
    setPreviewCardState(card)
    setPreviewUpgrades(appliedUpgrades ?? [])
  }, [])

  useEffect(() => {
    if (!gameId || !playerName) return
    getShareGame(gameId, playerName)
      .then((res) => {
        setData(res)
        setSelectedPlayer(res.owner_name)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [gameId, playerName])

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

  const gameFinished = data.players.every((p) => p.final_placement != null)
  const ownerPlayer = data.players.find((p) => p.name === data.owner_name)
  const referenceSnapshots = ownerPlayer?.snapshots ?? data.players[0]?.snapshots ?? []
  const isFinal = selectedRound === 'final'

  const currentPlayerData = data.players.find((p) => p.name === selectedPlayer)
  const currentSnapshot = !isFinal && currentPlayerData
    ? currentPlayerData.snapshots.find((s) => `${s.stage}_${s.round}` === selectedRound)
    : null

  const gameSummaryData = isFinal ? buildGameSummaryData(data, selectedPlayer) : null
  const lastSnapshot = currentPlayerData?.snapshots[currentPlayerData.snapshots.length - 1] ?? null

  const roundOptions = buildRoundOptions(referenceSnapshots)
  const currentIndex = roundOptions.findIndex((o) => o.value === selectedRound)
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < roundOptions.length - 1
  const currentRoundLabel = roundOptions.find((o) => o.value === selectedRound)?.label ?? 'Latest'

  const playerViews: PlayerView[] = data.players.map((p) => {
    const snap = p.snapshots[p.snapshots.length - 1]
    return {
      name: p.name,
      treasures: snap?.treasures ?? 0,
      poison: p.final_poison,
      phase: 'game_over',
      round: snap?.round ?? 0,
      stage: snap?.stage ?? 0,
      vanquishers: 0,
      is_ghost: false,
      is_puppet: p.is_puppet,
      time_of_death: null,
      hand_count: snap?.hand.length ?? 0,
      sideboard_count: snap?.sideboard.length ?? 0,
      hand_size: snap?.hand.length ?? 0,
      is_stage_increasing: false,
      upgrades: snap?.applied_upgrades ?? [],
      vanguard: snap?.vanguard ?? null,
      chosen_basics: snap?.basic_lands ?? [],
      most_recently_revealed_cards: [],
      last_result: null,
      pairing_probability: null,
      is_most_recent_ghost: false,
      full_sideboard: [],
      command_zone: snap?.command_zone ?? [],
      placement: p.final_placement ?? 0,
      in_sudden_death: false,
      build_ready: false,
    }
  })

  const sortedPlayerViews = [...playerViews].sort((a, b) => {
    if (a.placement !== 0 && b.placement !== 0) return a.placement - b.placement
    if (a.placement !== 0) return -1
    if (b.placement !== 0) return 1
    return 0
  })

  const renderContent = () => {
    if (isFinal) {
      if (gameSummaryData) {
        return (
          <GameSummary
            key={selectedPlayer}
            player={gameSummaryData.selfPlayer}
            players={gameSummaryData.players}
            useUpgrades={data.use_upgrades}
            compact
          />
        )
      }
      if (lastSnapshot) {
        return (
          <div className="flex-1 min-h-0 flex flex-col">
            <ShareRoundDetail snapshot={lastSnapshot} useUpgrades={data.use_upgrades} />
          </div>
        )
      }
      return (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          No deck data available for this player.
        </div>
      )
    }

    if (currentSnapshot) {
      return (
        <div className="flex-1 min-h-0 flex flex-col">
          <ShareRoundDetail snapshot={currentSnapshot} useUpgrades={data.use_upgrades} />
        </div>
      )
    }

    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        {currentPlayerData
          ? 'This player was not in the game during this round.'
          : 'Select a player to view their deck.'}
      </div>
    )
  }

  const renderSidebarContent = () => (
    <div className="flex flex-col gap-1 p-3">
      {sortedPlayerViews.map((pv) => {
        const isSelected = pv.name === selectedPlayer
        const colors = pv.placement !== 0
          ? getPlacementBadgeColor(pv.placement, playerViews.length)
          : null
        return (
          <button
            key={pv.name}
            onClick={() => {
              setSelectedPlayer(pv.name)
              if (sizes.isMobile) setSidebarOpen(false)
            }}
            className={`flex items-center gap-2 px-3 py-2 rounded text-left text-sm transition-colors ${
              isSelected
                ? 'bg-amber-600/20 ring-1 ring-amber-500/50 text-white'
                : 'text-gray-300 hover:bg-gray-700/40'
            }`}
          >
            {pv.placement !== 0 && colors && (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none shrink-0"
                style={{ backgroundColor: colors.bg, color: colors.text }}
              >
                {getOrdinal(pv.placement)}
              </span>
            )}
            <span className="truncate flex-1">
              {pv.name}
              {pv.name === data.owner_name && (
                <span className="text-gray-500 ml-1">(You)</span>
              )}
            </span>
            {pv.is_puppet && (
              <span className="text-[10px] text-gray-500 shrink-0">PUPPET</span>
            )}
          </button>
        )
      })}
    </div>
  )

  return (
    <CardPreviewContext.Provider value={{ setPreviewCard }}>
    <div className="h-dvh flex flex-col bg-gray-900 text-white overflow-hidden">
      {/* Header */}
      <div className="relative">
        <PhaseTimeline
          currentPhase="game_over"
          stage={0}
          round={0}
          nextStage={0}
          nextRound={0}
          onPhaseClick={() => {}}
          title={
            <span className="flex items-center gap-2">
              <span className="text-amber-400 font-bold text-sm">Magic: The Battling</span>
              {!gameFinished && (
                <span className="text-xs text-gray-500 italic">Game in Progress</span>
              )}
            </span>
          }
          hamburger={sizes.isMobile ? (
            <button onClick={() => setSidebarOpen(o => !o)} className="text-gray-300 hover:text-white text-xl px-1">☰</button>
          ) : undefined}
        />
      </div>

      {/* Main + Sidebar */}
      <div className="flex-1 flex min-h-0">
        <main className="flex-1 flex flex-col min-h-0 min-w-0">
          {renderContent()}
        </main>

        {sizes.isMobile ? (
          <>
            {sidebarOpen && (
              <div
                className="fixed inset-0 bg-black/50 z-40"
                onClick={() => setSidebarOpen(false)}
              />
            )}
            <div
              className={`fixed top-0 right-0 h-full z-50 transition-transform duration-300 ${
                sidebarOpen ? 'translate-x-0' : 'translate-x-full'
              }`}
            >
              <aside className="w-64 h-full bg-gray-900 border-l border-gray-700 flex flex-col overflow-hidden">
                <div className="px-3 py-2 border-b border-gray-700 text-sm font-medium text-gray-400">
                  Players
                </div>
                <div className="overflow-y-auto flex-1">
                  {renderSidebarContent()}
                </div>
              </aside>
            </div>
          </>
        ) : (
          <aside className="w-64 h-full bg-black/30 border-l border-gray-700 flex flex-col overflow-hidden">
            <div className="overflow-y-auto flex-1">
              {renderSidebarContent()}
            </div>
          </aside>
        )}
      </div>

      {/* Bottom Bar */}
      <div className="shrink-0 bg-black/30 border-t border-gray-700/50">
        <div className="flex items-center justify-between py-1.5 sm:py-2 px-1.5 timeline-actions">
          {/* Left: Round selector */}
          <div className="relative">
            <button
              className="btn btn-secondary text-sm py-1.5 px-3"
              onClick={() => setRoundPopoverOpen((o) => !o)}
            >
              {currentRoundLabel}
            </button>
            {roundPopoverOpen && (
              <RoundPopover
                options={roundOptions}
                selectedRound={selectedRound}
                onSelect={setSelectedRound}
                onClose={handleCloseRoundPopover}
              />
            )}
          </div>

          {/* Right: Prev / Next */}
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
