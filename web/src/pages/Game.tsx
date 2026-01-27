import { useState, useEffect, type ReactNode } from 'react'
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
import { CardPreviewContext } from '../components/card'
import { GameDndProvider, useDndActions } from '../dnd'
import type { Card as CardType } from '../types'

function CardPreviewModal({
  card,
  upgradeTarget,
  onClose,
}: {
  card: CardType
  upgradeTarget: CardType | null
  onClose: () => void
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="relative flex gap-4 items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={card.png_url ?? card.image_url}
          alt={card.name}
          className="max-h-[80vh] rounded-lg shadow-2xl"
        />
        {upgradeTarget && (
          <>
            <div className="text-white text-2xl font-bold">→</div>
            <img
              src={upgradeTarget.png_url ?? upgradeTarget.image_url}
              alt={upgradeTarget.name}
              className="max-h-[80vh] rounded-lg shadow-2xl"
            />
          </>
        )}
        <button
          className="absolute -top-4 -right-4 bg-black/60 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-black/80"
          onClick={onClose}
        >
          ×
        </button>
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
    awaiting_elimination: 'reward',
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
          playerName={self_player.name}
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
              Stage {self_player.stage} • Round {self_player.round}
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
                currentPlayer={self_player}
                phaseContent={renderPhaseContent()}
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
              {currentPhase === 'awaiting_elimination' && (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <h2 className="text-2xl text-amber-400 mb-4">Sudden Death Pending</h2>
                    <p className="text-gray-300 mb-4">Waiting for other battles to finish...</p>
                  </div>
                </div>
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
                    <button
                      onClick={() => navigate('/')}
                      className="btn btn-primary mt-6"
                    >
                      Return Home
                    </button>
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
              currentPlayer={self_player}
              phaseContent={renderPhaseContent()}
            />
          </div>
        )}
      </div>
      {state.previewCard && (
        <CardPreviewModal
          card={state.previewCard}
          upgradeTarget={state.previewUpgradeTarget}
          onClose={() => setPreviewCard(null)}
        />
      )}
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
