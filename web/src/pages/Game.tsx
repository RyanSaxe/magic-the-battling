import { useState, type ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSession } from '../hooks/useSession'
import { useGame } from '../hooks/useGame'
import { rejoinGame } from '../api/client'
import { DraftPhase } from './phases/Draft'
import { BuildPhase } from './phases/Build'
import { BattlePhase } from './phases/Battle'
import { RewardPhase } from './phases/Reward'
import { Sidebar } from '../components/sidebar'
import { BattleSidebarContent } from '../components/sidebar/BattleSidebarContent'
import { RewardSidebarContent } from '../components/sidebar/RewardSidebarContent'
import { ContextStripProvider, useContextStrip } from '../contexts'
import { CardPreviewContext, Card } from '../components/card'
import { GameDndProvider, useDndActions } from '../dnd'
import type { Card as CardType, PlayerView } from '../types'

function CardPreview({ card }: { card: CardType }) {
  return (
    <div className="p-3">
      <img
        src={card.png_url ?? card.image_url}
        alt={card.name}
        className="w-full rounded-lg shadow-lg"
      />
      <div className="mt-2">
        <div className="text-white font-medium text-sm">{card.name}</div>
        <div className="text-gray-400 text-xs">{card.type_line}</div>
      </div>
    </div>
  )
}

function RevealedCards({ player }: { player: PlayerView }) {
  const cards = player.most_recently_revealed_cards

  if (cards.length === 0) {
    return (
      <div className="p-3 text-center">
        <div className="text-gray-400 text-sm">
          {player.name} has no revealed cards
        </div>
      </div>
    )
  }

  return (
    <div className="p-3">
      <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">
        {player.name}'s Revealed Cards
      </div>
      <div className="flex flex-col gap-2">
        {cards.map((card) => (
          <Card key={card.id} card={card} size="sm" enablePreview={false} />
        ))}
      </div>
    </div>
  )
}

function UpgradesDisplay({ upgrades }: { upgrades: CardType[] }) {
  const appliedUpgrades = upgrades.filter((u) => u.upgrade_target)
  const unappliedUpgrades = upgrades.filter((u) => !u.upgrade_target)

  return (
    <div className="p-3">
      <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">
        Your Upgrades ({upgrades.length})
      </div>
      <div className="flex flex-col gap-2">
        {appliedUpgrades.map((upgrade) => (
          <Card key={upgrade.id} card={upgrade} size="sm" showUpgradeTarget enablePreview={false} />
        ))}
        {unappliedUpgrades.map((upgrade) => (
          <div key={upgrade.id} className="relative opacity-60">
            <Card card={upgrade} size="sm" enablePreview={false} />
            <div className="absolute bottom-0 left-0 right-0 text-center text-[10px] text-gray-400 bg-black/60 rounded-b px-1">
              Not applied
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function GameContent() {
  const { gameId } = useParams<{ gameId: string }>()
  const navigate = useNavigate()
  const { session, saveSession } = useSession()
  const { gameState, isConnected, actions, error } = useGame(
    gameId ?? null,
    session?.sessionId ?? null
  )
  const { state, setPreviewCard } = useContextStrip()

  const [rejoinName, setRejoinName] = useState('')
  const [rejoinError, setRejoinError] = useState('')
  const [rejoinLoading, setRejoinLoading] = useState(false)

  // Lifted state from Build phase
  const [selectedBasics, setSelectedBasics] = useState<string[]>([])

  // Lifted state from Reward phase
  const [selectedUpgradeId, setSelectedUpgradeId] = useState<string | null>(null)

  // Lifted state from Battle phase
  const [isChangingResult, setIsChangingResult] = useState(false)

  // DnD setup for battle phase
  const { handleCardMove, getValidDropZones } = useDndActions({
    phase: gameState?.self_player?.phase ?? 'draft',
    battleMove: actions.battleMove,
  })

  const handleYourLifeChange = (life: number) => {
    actions.battleUpdateLife('you', life)
  }

  const handleOpponentLifeChange = (life: number) => {
    actions.battleUpdateLife('opponent', life)
  }

  const handleRejoin = async () => {
    if (!rejoinName.trim() || !gameId) {
      setRejoinError('Please enter your name')
      return
    }

    setRejoinLoading(true)
    setRejoinError('')

    try {
      const response = await rejoinGame(gameId, rejoinName)
      saveSession(response.session_id, response.player_id)
    } catch {
      setRejoinError('Could not rejoin. Check your name matches exactly.')
    } finally {
      setRejoinLoading(false)
    }
  }

  if (!session) {
    return (
      <div className="game-table flex items-center justify-center p-4">
        <div className="bg-black/60 backdrop-blur rounded-lg p-8 w-full max-w-md">
          <h1 className="text-2xl font-bold text-white text-center mb-6">
            Rejoin Game
          </h1>

          {rejoinError && (
            <div className="bg-red-900/50 text-red-200 p-3 rounded mb-4">
              {rejoinError}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-gray-300 mb-1">Your Name</label>
              <input
                type="text"
                value={rejoinName}
                onChange={(e) => setRejoinName(e.target.value)}
                className="w-full bg-gray-800 text-white rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="Enter your name exactly as before"
              />
            </div>

            <button
              onClick={handleRejoin}
              disabled={rejoinLoading}
              className="btn btn-primary w-full py-2"
            >
              {rejoinLoading ? 'Rejoining...' : 'Rejoin Game'}
            </button>

            <button
              onClick={() => navigate('/')}
              className="btn btn-secondary w-full py-2"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!isConnected) {
    return (
      <div className="game-table flex items-center justify-center">
        <div className="text-white">Connecting...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="game-table flex items-center justify-center">
        <div className="text-red-400">{error}</div>
      </div>
    )
  }

  if (!gameState) {
    return (
      <div className="game-table flex items-center justify-center">
        <div className="text-white">Loading game...</div>
      </div>
    )
  }

  const currentPhase = gameState.self_player.phase

  const phaseBadgeClass = {
    draft: 'draft',
    build: 'build',
    battle: 'battle',
    reward: 'reward',
    eliminated: 'battle',
    winner: 'reward',
    game_over: 'battle',
  }[currentPhase] || 'draft'

  const { self_player, current_battle } = gameState
  const maxHandSize = self_player.hand_size
  const handExceedsLimit = self_player.hand.length > maxHandSize
  const basicsComplete = selectedBasics.length === 3
  const canReady = basicsComplete && !handExceedsLimit

  const isStageIncreasing = self_player.is_stage_increasing
  const needsUpgrade = isStageIncreasing && gameState.available_upgrades.length > 0
  const canContinue = !needsUpgrade || !!selectedUpgradeId

  const handleContinue = () => {
    actions.rewardDone(selectedUpgradeId ?? undefined)
    setSelectedUpgradeId(null)
  }

  const renderActionButtons = (): ReactNode => {
    switch (currentPhase) {
      case 'draft':
        return (
          <>
            <button
              onClick={actions.draftRoll}
              disabled={
                self_player.treasures <= 0 ||
                (self_player.current_pack?.length ?? 0) === 0
              }
              className="btn btn-secondary"
            >
              Roll Pack ({self_player.treasures} 💰)
            </button>
            <button onClick={actions.draftDone} className="btn btn-primary">
              Done Drafting
            </button>
          </>
        )
      case 'build':
        if (self_player.build_ready) {
          return (
            <>
              <span className="text-amber-400 text-sm">Waiting...</span>
              <button
                onClick={actions.buildUnready}
                className="btn bg-gray-600 hover:bg-gray-500 text-white"
              >
                Unready
              </button>
            </>
          )
        }
        return (
          <button
            onClick={() => actions.buildReady(selectedBasics)}
            disabled={!canReady}
            className="btn btn-primary"
          >
            Ready {!basicsComplete && '(select 3 basics)'}
          </button>
        )
      case 'battle': {
        if (!current_battle) return null
        const { opponent_name, result_submissions } = current_battle
        const mySubmission = result_submissions[self_player.name]
        const opponentSubmission = result_submissions[opponent_name]

        if (mySubmission && !isChangingResult) {
          const resultsConflict = opponentSubmission && mySubmission !== opponentSubmission
          return (
            <>
              <span className={`text-sm ${resultsConflict ? 'text-red-400' : 'text-amber-400'}`}>
                {resultsConflict ? 'Results conflict!' : 'Waiting...'}
              </span>
              <button
                onClick={() => setIsChangingResult(true)}
                className="btn btn-secondary"
              >
                Change
              </button>
            </>
          )
        }
        return (
          <>
            {isChangingResult && (
              <button
                onClick={() => setIsChangingResult(false)}
                className="text-gray-400 text-sm hover:text-white"
              >
                Cancel
              </button>
            )}
            <button
              onClick={() => {
                actions.battleSubmitResult(self_player.name)
                setIsChangingResult(false)
              }}
              className="btn btn-primary"
            >
              I Won
            </button>
            <button
              onClick={() => {
                actions.battleSubmitResult('draw')
                setIsChangingResult(false)
              }}
              className="btn btn-secondary"
            >
              Draw
            </button>
            <button
              onClick={() => {
                actions.battleSubmitResult(opponent_name)
                setIsChangingResult(false)
              }}
              className="btn btn-danger"
            >
              Opponent Won
            </button>
          </>
        )
      }
      case 'reward': {
        const buttonLabel = needsUpgrade
          ? selectedUpgradeId
            ? 'Claim & Continue'
            : 'Select Upgrade'
          : 'Continue'
        return (
          <button
            onClick={handleContinue}
            disabled={!canContinue}
            className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {buttonLabel}
          </button>
        )
      }
      default:
        return null
    }
  }

  const renderPreviewContent = (): ReactNode => {
    if (state.previewCard) {
      return <CardPreview card={state.previewCard} />
    }
    if (state.revealedPlayer) {
      return <RevealedCards player={state.revealedPlayer} />
    }
    if (self_player.upgrades.length > 0 && currentPhase !== 'battle') {
      return <UpgradesDisplay upgrades={self_player.upgrades} />
    }
    return null
  }

  const renderPhaseContent = (): ReactNode => {
    if (currentPhase === 'battle' && current_battle) {
      return (
        <BattleSidebarContent
          currentBattle={current_battle}
          selfUpgrades={self_player.upgrades}
          yourLife={current_battle.your_life}
          opponentLife={current_battle.opponent_life}
          onYourLifeChange={handleYourLifeChange}
          onOpponentLifeChange={handleOpponentLifeChange}
        />
      )
    }
    if (currentPhase === 'reward' && self_player.last_battle_result) {
      return (
        <RewardSidebarContent
          lastBattleResult={self_player.last_battle_result}
          playerName={self_player.name}
          players={gameState.players}
        />
      )
    }
    return null
  }

  return (
    <CardPreviewContext.Provider value={{ setPreviewCard }}>
      <div className="game-table flex flex-col">
        {/* Header - Action Bar */}
        <header className="flex justify-between items-center px-4 py-2 bg-black/30">
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-300">
              Stage {self_player.hand_size} • Round {self_player.round}
            </div>
            <span className={`phase-badge ${phaseBadgeClass}`}>{currentPhase}</span>
          </div>
          <div className="flex items-center gap-2">
            {renderActionButtons()}
          </div>
        </header>

        {/* Main content */}
        {currentPhase === 'battle' ? (
          <GameDndProvider onCardMove={handleCardMove} validDropZones={getValidDropZones}>
            <div className="flex-1 flex min-h-0">
              <main className="flex-1 flex flex-col min-h-0">
                <BattlePhase gameState={gameState} actions={actions} />
              </main>
              <Sidebar
                players={gameState.players}
                currentPlayerName={self_player.name}
                phaseContent={renderPhaseContent()}
                previewContent={renderPreviewContent()}
              />
            </div>
          </GameDndProvider>
        ) : (
          <div className="flex-1 flex min-h-0">
            <main className="flex-1 flex flex-col min-h-0">
              {currentPhase === 'draft' && (
                <DraftPhase gameState={gameState} actions={actions} />
              )}
              {currentPhase === 'build' && (
                <BuildPhase
                  gameState={gameState}
                  actions={actions}
                  selectedBasics={selectedBasics}
                  onBasicsChange={setSelectedBasics}
                />
              )}
              {currentPhase === 'reward' && (
                <RewardPhase
                  gameState={gameState}
                  actions={actions}
                  selectedUpgradeId={selectedUpgradeId}
                  onUpgradeSelect={setSelectedUpgradeId}
                />
              )}
              {currentPhase === 'eliminated' && (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center max-w-md">
                    <h2 className="text-2xl text-red-400 mb-4">Eliminated</h2>
                    <p className="text-gray-300 mb-4">
                      You are now <span className="text-amber-400 font-semibold">The Ghost</span>.
                    </p>
                    <div className="text-gray-400 text-sm space-y-2 text-left bg-black/30 p-4 rounded-lg">
                      <p>Your deck is frozen exactly as it was when you died:</p>
                      <ul className="list-disc list-inside ml-2 space-y-1">
                        <li>Same hand, sideboard, and treasures</li>
                        <li>No rewards or changes between battles</li>
                        <li>You play the same deck repeatedly</li>
                      </ul>
                      <p className="mt-3">
                        You will continue battling until there is an even number of players,
                        or until another player is eliminated and becomes the new ghost.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {currentPhase === 'winner' && (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <h2 className="text-3xl text-amber-400 mb-4">Victory!</h2>
                    <p className="text-gray-300 mb-6">
                      Congratulations! You won the game!
                    </p>
                    <button
                      onClick={() => navigate('/')}
                      className="btn btn-primary"
                    >
                      Return Home
                    </button>
                  </div>
                </div>
              )}
              {currentPhase === 'game_over' && (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <h2 className="text-3xl text-red-400 mb-4">Game Over</h2>
                    <p className="text-gray-300 mb-6">
                      You were eliminated from the game.
                    </p>
                    <button
                      onClick={() => navigate('/')}
                      className="btn btn-primary"
                    >
                      Return Home
                    </button>
                  </div>
                </div>
              )}
            </main>
            <Sidebar
              players={gameState.players}
              currentPlayerName={self_player.name}
              phaseContent={renderPhaseContent()}
              previewContent={renderPreviewContent()}
            />
          </div>
        )}
      </div>
    </CardPreviewContext.Provider>
  )
}

export function Game() {
  return (
    <ContextStripProvider>
      <GameContent />
    </ContextStripProvider>
  )
}
