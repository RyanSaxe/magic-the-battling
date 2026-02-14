import type { SharePlayerSnapshot } from '../../types'

interface RoundOption {
  label: string
  value: string
}

interface ShareRoundNavProps {
  rounds: SharePlayerSnapshot[]
  selectedRound: string
  onSelectRound: (value: string) => void
  gameFinished?: boolean
}

function buildRoundOptions(rounds: SharePlayerSnapshot[], gameFinished: boolean): RoundOption[] {
  const options: RoundOption[] = [{ label: gameFinished ? 'Final Summary' : 'Latest', value: 'final' }]
  for (const snap of rounds) {
    options.push({
      label: `Stage ${snap.stage} - Round ${snap.round}`,
      value: `${snap.stage}_${snap.round}`,
    })
  }
  return options
}

export function ShareRoundNav({ rounds, selectedRound, onSelectRound, gameFinished = true }: ShareRoundNavProps) {
  const options = buildRoundOptions(rounds, gameFinished)
  const currentIndex = options.findIndex((o) => o.value === selectedRound)
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < options.length - 1

  return (
    <div className="flex items-center gap-2">
      <select
        className="bg-gray-800 border border-gray-600 text-gray-200 rounded px-3 py-1.5 text-sm"
        value={selectedRound}
        onChange={(e) => onSelectRound(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <button
        className="bg-gray-800 border border-gray-600 text-gray-300 rounded px-2 py-1.5 text-sm disabled:opacity-30"
        disabled={!hasPrev}
        onClick={() => hasPrev && onSelectRound(options[currentIndex - 1].value)}
      >
        ◀
      </button>
      <button
        className="bg-gray-800 border border-gray-600 text-gray-300 rounded px-2 py-1.5 text-sm disabled:opacity-30"
        disabled={!hasNext}
        onClick={() => hasNext && onSelectRound(options[currentIndex + 1].value)}
      >
        ▶
      </button>
    </div>
  )
}
