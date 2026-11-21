const OPPONENT_COUNTS = [1, 3, 5, 7] as const

/** The choice of how many puppet opponents a saved cube or deck starts with. */
export function DefaultOpponentsField({ value, onChange }: { value: number; onChange: (count: number) => void }) {
  return (
    <div className="bg-black/35 border border-black/40 rounded-lg p-3">
      <label className="block text-amber-100/70 text-sm mb-2">Default Opponents</label>
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
