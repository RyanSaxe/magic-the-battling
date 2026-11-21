interface CardSlotProps {
  label: string
  dimensions: { width: number; height: number }
  selected?: boolean
  onClick?: () => void
}

export function CardSlot({ label, dimensions, selected = false, onClick }: CardSlotProps) {
  return (
    <div
      className={`card-slot flex items-center justify-center rounded border-2 border-dashed bg-black/20 ${
        selected ? 'border-amber-400 ring-2 ring-amber-400/50' : 'border-[var(--stone-light)]/60'
      } ${onClick ? 'cursor-pointer' : ''}`}
      style={{ width: dimensions.width, height: dimensions.height }}
      onClick={onClick}
    >
      <span className="text-[9px] text-[var(--ivory-muted)] text-center leading-tight px-1">
        {label}
      </span>
    </div>
  )
}
