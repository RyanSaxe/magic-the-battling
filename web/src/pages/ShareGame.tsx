import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getShareGame } from '../api/client'
import type { ShareGameResponse, SelfPlayerView, PlayerView } from '../types'
import { GameSummary } from '../components/GameSummary'
import { ShareRoundNav } from '../components/share/ShareRoundNav'
import { SharePlayerToggle } from '../components/share/SharePlayerToggle'
import { ShareRoundDetail } from '../components/share/ShareRoundDetail'
import { ShareStandings } from '../components/share/ShareStandings'

function buildGameSummaryData(
  data: ShareGameResponse,
): { selfPlayer: SelfPlayerView; players: PlayerView[] } | null {
  const owner = data.players.find((p) => p.name === data.owner_name)
  if (!owner || owner.snapshots.length === 0) return null

  const lastSnap = owner.snapshots[owner.snapshots.length - 1]

  const selfPlayer: SelfPlayerView = {
    name: owner.name,
    treasures: lastSnap.treasures,
    poison: lastSnap.poison,
    phase: 'game_over',
    round: lastSnap.round,
    stage: lastSnap.stage,
    vanquishers: 0,
    is_ghost: false,
    is_bot: owner.is_bot,
    time_of_death: null,
    hand_count: lastSnap.hand.length,
    sideboard_count: lastSnap.sideboard.length,
    hand_size: lastSnap.hand.length,
    is_stage_increasing: false,
    upgrades: lastSnap.applied_upgrades,
    vanguard: lastSnap.vanguard,
    chosen_basics: lastSnap.basic_lands,
    most_recently_revealed_cards: [],
    last_result: null,
    pairing_probability: null,
    is_most_recent_ghost: false,
    full_sideboard: [],
    command_zone: lastSnap.command_zone,
    placement: owner.final_placement ?? 0,
    in_sudden_death: false,
    build_ready: false,
    hand: lastSnap.hand,
    sideboard: lastSnap.sideboard,
    current_pack: null,
    last_battle_result: lastSnap.treasures > 0 ? {
      opponent_name: '',
      winner_name: null,
      is_draw: false,
      poison_dealt: 0,
      poison_taken: 0,
      treasures_gained: 0,
      card_gained: null,
      vanquisher_gained: false,
      pre_battle_treasures: lastSnap.treasures,
    } : null,
  }

  const players: PlayerView[] = data.players.map((p) => {
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
      is_bot: p.is_bot,
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

  return { selfPlayer, players }
}

function formatDate(isoDate: string): string {
  try {
    const d = new Date(isoDate)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return ''
  }
}

export function ShareGame() {
  const { gameId, playerName } = useParams<{ gameId: string; playerName: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<ShareGameResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedRound, setSelectedRound] = useState('final')
  const [selectedPlayer, setSelectedPlayer] = useState('')
  const [copied, setCopied] = useState(false)

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

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [])

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

  const ownerPlayer = data.players.find((p) => p.name === data.owner_name)
  const referenceSnapshots = ownerPlayer?.snapshots ?? data.players[0]?.snapshots ?? []
  const isFinal = selectedRound === 'final'

  const currentPlayerData = data.players.find((p) => p.name === selectedPlayer)
  const currentSnapshot = !isFinal && currentPlayerData
    ? currentPlayerData.snapshots.find((s) => `${s.stage}_${s.round}` === selectedRound)
    : null

  const gameSummaryData = isFinal ? buildGameSummaryData(data) : null

  return (
    <div className="h-dvh flex flex-col bg-gray-900 text-white overflow-hidden">
      <div className="shrink-0 border-b border-gray-700 px-4 py-2 flex items-center justify-between">
        <span className="text-amber-400 font-bold text-sm">Magic: The Battling</span>
        <div className="flex items-center gap-2">
          <button
            className="bg-gray-800 border border-gray-600 text-gray-300 rounded px-3 py-1 text-sm hover:bg-gray-700"
            onClick={handleCopyLink}
          >
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
          <button
            className="bg-gray-800 border border-gray-600 text-gray-300 rounded px-3 py-1 text-sm hover:bg-gray-700"
            onClick={() => navigate('/')}
          >
            Home
          </button>
        </div>
      </div>

      <div className="shrink-0 px-4 pt-3 pb-2">
        <h1 className="text-lg font-semibold text-gray-200">
          {data.owner_name}'s Game
          <span className="text-gray-500 text-sm font-normal ml-2">{formatDate(data.created_at)}</span>
        </h1>
        <div className="flex items-center gap-4 mt-2 flex-wrap">
          <ShareRoundNav
            rounds={referenceSnapshots}
            selectedRound={selectedRound}
            onSelectRound={setSelectedRound}
          />
        </div>
        {!isFinal && (
          <div className="mt-2">
            <SharePlayerToggle
              players={data.players}
              selectedPlayer={selectedPlayer}
              ownerName={data.owner_name}
              onSelectPlayer={setSelectedPlayer}
              currentRound={selectedRound}
            />
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {isFinal && gameSummaryData ? (
          <>
            <GameSummary
              player={gameSummaryData.selfPlayer}
              players={gameSummaryData.players}
              useUpgrades={data.use_upgrades}
            />
            <div className="shrink-0 px-4 pb-4">
              <ShareStandings players={data.players} />
            </div>
          </>
        ) : currentSnapshot ? (
          <div className="flex-1 min-h-0 px-4 pb-4 flex flex-col">
            <ShareRoundDetail
              snapshot={currentSnapshot}
              useUpgrades={data.use_upgrades}
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            {currentPlayerData
              ? 'This player was not in the game during this round.'
              : 'Select a player to view their deck.'}
          </div>
        )}
      </div>
    </div>
  )
}
