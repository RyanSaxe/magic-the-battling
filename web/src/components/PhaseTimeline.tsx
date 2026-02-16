import type { ReactNode } from 'react'
import type { Phase } from '../constants/rules'

const PHASES: Phase[] = ['draft', 'build', 'battle', 'reward']

const PHASE_ACTIVE_STYLE: Record<Phase, string> = {
  draft: 'bg-purple-500/30 text-purple-300 ring-1 ring-purple-400/60',
  build: 'bg-blue-500/30 text-blue-300 ring-1 ring-blue-400/60',
  battle: 'bg-red-500/30 text-red-300 ring-1 ring-red-400/60',
  reward: 'bg-amber-500/30 text-amber-300 ring-1 ring-amber-400/60',
}

type EndState = 'eliminated' | 'winner' | 'game_over' | 'awaiting_elimination'

interface PhaseTimelineProps {
  currentPhase: Phase | EndState
  stage: number
  round: number
  nextStage: number
  nextRound: number
  onPhaseClick: (phase: Phase) => void
  actionButtons: ReactNode
  hamburger?: ReactNode
}

function isGamePhase(phase: string): phase is Phase {
  return PHASES.includes(phase as Phase)
}

export function PhaseTimeline({
  currentPhase,
  stage,
  round,
  nextStage,
  nextRound,
  onPhaseClick,
  actionButtons,
  hamburger,
}: PhaseTimelineProps) {
  if (!isGamePhase(currentPhase)) {
    return <EndStateHeader phase={currentPhase} actionButtons={actionButtons} hamburger={hamburger} />
  }

  const currentIndex = PHASES.indexOf(currentPhase)

  return (
    <header className="bg-black/30 py-1.5 px-2 sm:px-4">
      <div className="flex items-center">
        <div className="flex items-center gap-1 sm:gap-1.5 flex-1 justify-center min-w-0">
          <span className="text-xs sm:text-sm text-gray-300 font-mono">{stage}-{round}</span>

          {PHASES.map((phase, index) => {
            const isActive = index === currentIndex
            const isCompleted = index < currentIndex
            const isUpcoming = index > currentIndex

            return (
              <div key={phase} className="flex items-center gap-1 sm:gap-1.5">
                <span className="text-gray-600 text-xs">→</span>
                <button
                  onClick={() => onPhaseClick(phase)}
                  className={`text-xs sm:text-sm font-medium capitalize transition-all cursor-pointer
                    ${isActive ? `rounded-full px-2.5 py-0.5 sm:px-3 sm:py-0.5 ${PHASE_ACTIVE_STYLE[phase]}` : ''}
                    ${isCompleted ? 'text-gray-500 line-through decoration-gray-600' : ''}
                    ${isUpcoming ? 'text-gray-500' : ''}
                    hover:brightness-125
                  `}
                >
                  {phase}
                </button>
              </div>
            )
          })}

          <span className="text-gray-600 text-xs">→</span>
          <span className="text-xs sm:text-sm text-gray-500 font-mono">{nextStage}-{nextRound}</span>
        </div>

        {hamburger && <div className="shrink-0">{hamburger}</div>}
      </div>

      {actionButtons && (
        <div className="flex items-center justify-center gap-1.5 sm:gap-2 mt-1 timeline-actions">
          {actionButtons}
        </div>
      )}
    </header>
  )
}

function EndStateHeader({ phase, actionButtons, hamburger }: { phase: EndState; actionButtons: ReactNode; hamburger?: ReactNode }) {
  const messages: Record<EndState, string> = {
    eliminated: 'You were eliminated',
    winner: 'You won!',
    game_over: 'Game Over',
    awaiting_elimination: 'Awaiting results...',
  }

  return (
    <header className="bg-black/30 px-4 py-3">
      <div className="flex items-center">
        <div className="flex-1 text-center">
          <div className="text-lg font-medium text-white">{messages[phase]}</div>
        </div>
        {hamburger && <div className="shrink-0">{hamburger}</div>}
      </div>
      {actionButtons && (
        <div className="flex items-center justify-center gap-2 mt-2">
          {actionButtons}
        </div>
      )}
    </header>
  )
}
