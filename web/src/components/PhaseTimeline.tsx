import { useNavigate } from 'react-router-dom'
import type { Phase } from '../constants/phases'
import type { RulesPanelTarget } from './RulesPanel'

const PHASES: Phase[] = ['draft', 'build', 'battle', 'reward']

const PHASE_ACTIVE_STYLE: Record<Phase, string> = {
  draft: 'bg-purple-500/30 text-purple-300 ring-1 ring-purple-400/60',
  build: 'bg-blue-500/30 text-blue-300 ring-1 ring-blue-400/60',
  battle: 'bg-red-500/30 text-red-300 ring-1 ring-red-400/60',
  reward: 'bg-amber-500/30 text-amber-300 ring-1 ring-amber-400/60',
}

type EndState = 'eliminated' | 'winner' | 'game_over' | 'awaiting_elimination'

const END_STATE_LABELS: Record<EndState, string> = {
  eliminated: 'Eliminated',
  winner: 'Victory!',
  game_over: 'Game Over',
  awaiting_elimination: 'Awaiting Result',
}

interface PhaseTimelineProps {
  currentPhase: Phase | EndState
  stage: number
  round: number
  nextStage: number
  nextRound: number
  onOpenRules?: (target?: RulesPanelTarget) => void
  hamburger?: React.ReactNode
  title?: React.ReactNode
}

function isGamePhase(phase: string): phase is Phase {
  return PHASES.includes(phase as Phase)
}

function RulesButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="btn btn-secondary text-xs sm:text-sm"
      title="Guide"
    >
      <span className="hidden sm:inline">Guide</span>
      <span className="sm:hidden">?</span>
    </button>
  )
}

function HomeButton() {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate('/')}
      className="btn btn-secondary text-xs sm:text-sm"
    >
      Home
    </button>
  )
}

export function PhaseTimeline({
  currentPhase,
  stage,
  round,
  nextStage,
  nextRound,
  onOpenRules,
  hamburger,
  title,
}: PhaseTimelineProps) {
  if (!isGamePhase(currentPhase)) {
    return (
      <header className="bg-black/30 py-1.5 sm:py-2 pl-2 pr-1.5 border-b border-gray-700/50">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-300">
            {title ?? END_STATE_LABELS[currentPhase]}
          </span>
          <div className="flex items-center gap-1 timeline-actions">
            {onOpenRules && <RulesButton onClick={() => onOpenRules()} />}
            <HomeButton />
            {hamburger && <div className="shrink-0">{hamburger}</div>}
          </div>
        </div>
      </header>
    )
  }

  return (
    <header className="bg-black/30 py-1.5 sm:py-2 pl-2 pr-1.5 border-b border-gray-700/50">
      <div className="flex items-center">
        <div className="flex items-center gap-1 sm:gap-1.5 flex-1 justify-start min-w-0">
          <span className="text-xs sm:text-sm text-gray-300 font-mono">{stage}-{round}</span>

          {PHASES.map((phase, index) => {
            const currentIndex = PHASES.indexOf(currentPhase)
            const isActive = index === currentIndex
            const isCompleted = index < currentIndex
            const isUpcoming = index > currentIndex

            return (
              <div key={phase} className="flex items-center gap-1 sm:gap-1.5">
                <span className="text-gray-600 text-xs">→</span>
                <button
                  onClick={() => onOpenRules?.({ docId: phase })}
                  className={`text-xs sm:text-sm font-medium capitalize transition-colors cursor-pointer
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

        <div className="flex items-center gap-1 shrink-0 timeline-actions">
          {onOpenRules && <RulesButton onClick={() => onOpenRules()} />}
          <div className="hidden sm:block"><HomeButton /></div>
          {hamburger && <div className="shrink-0">{hamburger}</div>}
        </div>
      </div>
    </header>
  )
}
