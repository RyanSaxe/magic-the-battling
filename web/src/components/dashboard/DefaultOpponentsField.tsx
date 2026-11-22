import { OPTION_BOX } from '../common/styles'
import { SegmentedFilter } from './SegmentedFilter'

const OPPONENT_COUNTS = [1, 3, 5, 7] as const
const OPPONENT_OPTIONS = OPPONENT_COUNTS.map((count) => ({ value: String(count), label: String(count) }))

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
      <SegmentedFilter
        label={label}
        options={OPPONENT_OPTIONS}
        value={String(value)}
        onChange={(count) => onChange(Number(count) as (typeof OPPONENT_COUNTS)[number])}
        className="h-9"
      />
    </div>
  )
}
