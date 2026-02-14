import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getShareGame } from '../api/client'
import type { ShareGameResponse } from '../types'
import { GameSummary } from '../components/GameSummary'
import { ShareRoundNav } from '../components/share/ShareRoundNav'
import { SharePlayerToggle } from '../components/share/SharePlayerToggle'
import { ShareRoundDetail } from '../components/share/ShareRoundDetail'
import { buildGameSummaryData } from '../utils/share'

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

  const gameSummaryData = isFinal ? buildGameSummaryData(data, selectedPlayer) : null

  return (
    <div className="h-dvh flex flex-col bg-gray-900 text-white overflow-hidden">
      <div className="shrink-0 border-b border-gray-700 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 font-bold text-sm">Magic: The Battling</span>
          {!data.game_finished && (
            <span className="text-xs text-gray-500 italic">Game in Progress</span>
          )}
        </div>
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
            gameFinished={data.game_finished}
          />
        </div>
        <div className="mt-2">
          <SharePlayerToggle
            players={data.players}
            selectedPlayer={selectedPlayer}
            ownerName={data.owner_name}
            onSelectPlayer={setSelectedPlayer}
            currentRound={selectedRound}
            gameFinished={data.game_finished}
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {isFinal && gameSummaryData ? (
          <GameSummary
            player={gameSummaryData.selfPlayer}
            players={gameSummaryData.players}
            useUpgrades={data.use_upgrades}
          />
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
