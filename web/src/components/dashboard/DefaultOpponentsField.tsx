import { OPTION_BOX } from '../common/styles'

const OPPONENT_COUNTS = [1, 3, 5, 7] as const

/** The choice of how many puppet opponents a game, or a saved cube or deck by default, starts with. */
export function DefaultOpponentsField({
  value,
  onChange,
  label = 'Default Opponents',
}: {
  value: number
  onChange: (count: (typeof OPPONENT_COUNTS)[number]) => void
  label?: string
}) {
  return (
    <div className={`${OPTION_BOX} p-3`}>
      <label className="block text-amber-100/70 text-sm mb-2">{label}</label>
      <div className="flex gap-1.5">
        {OPPONENT_COUNTS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`btn ${value === n ? 'btn-primary' : 'btn-secondary'} px-3 py-1.5 text-sm font-medium`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}
