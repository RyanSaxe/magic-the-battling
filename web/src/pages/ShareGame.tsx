import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getShareGame } from '../api/client'
import type { ShareGameResponse } from '../types'
import { GameSummary } from '../components/GameSummary'
import { ShareRoundNav } from '../components/share/ShareRoundNav'
import { SharePlayerToggle } from '../components/share/SharePlayerToggle'
import { ShareRoundDetail } from '../components/share/ShareRoundDetail'
import { buildGameSummaryData } from '../utils/share'

export function ShareGame() {
  const { gameId, playerName } = useParams<{ gameId: string; playerName: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<ShareGameResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedRound, setSelectedRound] = useState('final')
  const [selectedPlayer, setSelectedPlayer] = useState('')

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

  const renderContent = () => {
    if (isFinal) {
      if (gameSummaryData) {
        return (
          <GameSummary
            key={selectedPlayer}
            player={gameSummaryData.selfPlayer}
            players={gameSummaryData.players}
            useUpgrades={data.use_upgrades}
          />
        )
      }
      if (lastSnapshot) {
        return (
          <div className="flex-1 min-h-0 px-4 pt-3 pb-4 flex flex-col">
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
        <div className="flex-1 min-h-0 px-4 pt-3 pb-4 flex flex-col">
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

  return (
    <div className="h-dvh flex flex-col bg-gray-900 text-white overflow-hidden">
      <div className="shrink-0 border-b border-gray-700 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 font-bold text-sm">Magic: The Battling</span>
          {!gameFinished && (
            <span className="text-xs text-gray-500 italic">Game in Progress</span>
          )}
        </div>
        <button
          className="bg-gray-800 border border-gray-600 text-gray-300 rounded px-3 py-1 text-sm hover:bg-gray-700"
          onClick={() => navigate('/')}
        >
          Home
        </button>
      </div>

      <div className="shrink-0 px-4 pt-2 pb-2">
        <div className="flex items-center gap-2">
          <ShareRoundNav
            rounds={referenceSnapshots}
            selectedRound={selectedRound}
            onSelectRound={setSelectedRound}
          />
          <SharePlayerToggle
            players={data.players}
            selectedPlayer={selectedPlayer}
            ownerName={data.owner_name}
            onSelectPlayer={setSelectedPlayer}
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {renderContent()}
      </div>
    </div>
  )
}
